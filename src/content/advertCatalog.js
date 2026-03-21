// Advert catalog — pre-generates a pool of adverts in the background.
// Used to fill generation-lag gaps without silence.
//
// Catalog lives at tmp/adverts/ as individual MP3s + a catalog.json index.
// The worker keeps CATALOG_TARGET adverts ready across all humor styles.

import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateAdvert, generateDecentAdvert } from './advert.js';
import { getPendingTextAdverts, updateAdvertStatus } from '../db.js';
import { ollama } from './ollama.js';
import { textToMp3 } from './tts.js';
import { pickAdVoice } from './advert.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CATALOG_DIR = join(ROOT, 'tmp', 'adverts');
const ARCHIVE_DIR = join(ROOT, 'tmp', 'adverts', 'archive');
const INDEX_PATH = join(CATALOG_DIR, 'catalog.json');
const ARCHIVE_INDEX_PATH = join(ARCHIVE_DIR, 'archive.json');

const CATALOG_TARGET = 200;    // total adverts to build up over time
const REPLENISH_INTERVAL = 60000; // check every 60s
const HUMOR_STYLES = ['dark', 'light', 'dry', 'absurd'];
// Every 4th advert is a factual decentralisation tech spot
const DECENT_EVERY_N = 4;
const RECENT_AVOID_COUNT = 20; // don't replay the last N adverts played

mkdirSync(CATALOG_DIR, { recursive: true });
mkdirSync(ARCHIVE_DIR, { recursive: true });

// In-memory index: [{ path, title, humor, script, createdAt, lastPlayedAt }]
let catalog = [];
let recentlyPlayed = []; // ring buffer of recently played paths
let generating = false;

async function loadIndex() {
  try {
    if (existsSync(INDEX_PATH)) {
      const raw = JSON.parse(await readFile(INDEX_PATH, 'utf8'));
      // Drop entries whose file no longer exists
      catalog = raw.filter(entry => existsSync(entry.path));
    }
  } catch (err) {
    console.warn('[catalog] Failed to load index:', err.message);
    catalog = [];
  }
}

// Debounced save — coalesces rapid writes into one I/O
let saveTimer = null;
function saveIndex() {
  if (saveTimer) return; // already scheduled
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await writeFile(INDEX_PATH, JSON.stringify(catalog, null, 2));
    } catch (err) {
      console.warn('[catalog] Failed to save index:', err.message);
    }
  }, 500);
}

// Force immediate save (for shutdown)
async function saveIndexNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await writeFile(INDEX_PATH, JSON.stringify(catalog, null, 2));
}

// Pick the best advert for the current show context.
// Prefers matching humor style, avoids recently played, picks oldest last-played.
export function getFromCatalog(preferHumor = null) {
  if (!catalog.length) return null;

  // Filter out recently played
  const available = catalog.filter(e => !recentlyPlayed.includes(e.path));
  const pool = available.length ? available : catalog; // fallback to full catalog if all played recently

  // Prefer humor match, then fall back to any
  const humourMatched = preferHumor ? pool.filter(e => e.humor === preferHumor) : [];
  const candidates = humourMatched.length ? humourMatched : pool;

  // Pick the one least recently played (oldest lastPlayedAt, or never played first)
  const sorted = [...candidates].sort((a, b) => {
    if (!a.lastPlayedAt && !b.lastPlayedAt) return 0;
    if (!a.lastPlayedAt) return -1;
    if (!b.lastPlayedAt) return 1;
    return new Date(a.lastPlayedAt) - new Date(b.lastPlayedAt);
  });

  const entry = sorted[0];

  // Mark as played
  entry.lastPlayedAt = new Date().toISOString();
  recentlyPlayed.push(entry.path);
  if (recentlyPlayed.length > RECENT_AVOID_COUNT) recentlyPlayed.shift();
  saveIndex();

  console.log(`[catalog] Playing: ${entry.title} | catalog: ${catalog.length} | unplayed: ${pool.filter(e => !e.lastPlayedAt).length}`);
  return entry;
}

export function catalogSize() {
  return catalog.length;
}

export function catalogStats() {
  const unplayed = catalog.filter(e => !e.lastPlayedAt).length;
  const byHumor = [...HUMOR_STYLES, 'decent'].reduce((acc, h) => {
    acc[h] = catalog.filter(e => e.humor === h).length;
    return acc;
  }, {});
  return { total: catalog.length, unplayed, byHumor };
}

async function fillCatalog() {
  if (generating) return;
  generating = true;

  try {
    while (catalog.length < CATALOG_TARGET) {
      const isDecent = (catalog.length % DECENT_EVERY_N) === 0;
      const humor = isDecent ? 'decent' : HUMOR_STYLES[(catalog.length % (HUMOR_STYLES.length * DECENT_EVERY_N)) % HUMOR_STYLES.length];
      const fakeSlot = {
        voice: 'en-GB-RyanNeural',
        advertHumor: humor,
        advertMusicBed: false,
        id: 'catalog',
      };

      try {
        console.log(`[catalog] Generating ${humor} advert (${catalog.length + 1}/${CATALOG_TARGET})...`);
        const advert = isDecent
          ? await generateDecentAdvert(fakeSlot)
          : await generateAdvert(fakeSlot);

        // Move the file into the catalog dir if it isn't already there
        const entry = {
          path: advert.path,
          title: advert.title,
          humor: advert.humor,
          script: advert.script,
          createdAt: advert.createdAt,
        };

        catalog.push(entry);
        saveIndex();
        console.log(`[catalog] Ready: ${entry.title} (${catalog.length}/${CATALOG_TARGET})`);
      } catch (err) {
        console.error('[catalog] Failed to generate advert:', err.message);
        break; // don't tight-loop on persistent errors
      }
    }
  } finally {
    generating = false;
  }
}

// Move an advert to the archive (keeps the file, moves the record).
async function archiveEntry(entry) {
  let archive = [];
  try {
    if (existsSync(ARCHIVE_INDEX_PATH)) {
      archive = JSON.parse(await readFile(ARCHIVE_INDEX_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('[catalog] Failed to load archive index:', err.message);
  }

  archive.push({ ...entry, archivedAt: new Date().toISOString() });
  await writeFile(ARCHIVE_INDEX_PATH, JSON.stringify(archive, null, 2));
}

// Remove the oldest advert from active catalog, archive it, generate a fresh replacement.
async function rotateCatalog() {
  if (!catalog.length) return;

  // Sort by createdAt ascending — oldest first
  catalog.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const oldest = catalog.shift();

  // Archive rather than delete
  archiveEntry(oldest);
  console.log(`[catalog] Archived: ${oldest.title} — generating replacement`);
  saveIndex();

  // Generate one fresh advert — respect the decent-spot cadence
  const isDecent = (catalog.length % DECENT_EVERY_N) === 0;
  const humor = isDecent ? 'decent' : HUMOR_STYLES[Math.floor(Math.random() * HUMOR_STYLES.length)];
  const fakeSlot = { voice: 'en-GB-RyanNeural', advertHumor: humor, advertMusicBed: false, id: 'catalog' };
  try {
    const advert = isDecent ? await generateDecentAdvert(fakeSlot) : await generateAdvert(fakeSlot);
    catalog.push({ path: advert.path, title: advert.title, humor: advert.humor, script: advert.script, createdAt: advert.createdAt });
    saveIndex();
    console.log(`[catalog] Replacement ready: ${advert.title}`);
  } catch (err) {
    console.error('[catalog] Rotation replacement failed:', err.message);
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Process approved listener text ads: generate script via LLM → TTS → store audio path
async function processListenerAds() {
  const pending = getPendingTextAdverts();
  if (!pending.length) return;

  for (const ad of pending) {
    try {
      console.log(`[catalog] Processing listener ad: ${ad.business_name} — ${ad.product}`);

      // Generate a professional radio ad script from the description
      const scriptResponse = await ollama.generate({
        prompt: `Write a 20-second radio advertisement (45-60 words) for the following:

Business: ${ad.business_name}
Product/Service: ${ad.product}
Description: ${ad.description}
Tone: ${ad.tone || 'casual'}
${ad.target_audience ? `Target audience: ${ad.target_audience}` : ''}
${ad.website ? `Website: ${ad.website}` : ''}

Rules:
- Exactly 45-60 words, punchy and engaging
- Match the requested tone
- End with a call to action
- Output ONLY the spoken ad script, no stage directions

Write the ad now:`,
        options: { temperature: 0.85, num_predict: 120 },
      });

      const script = scriptResponse.response.trim();
      const voice = pickAdVoice(''); // random ad voice
      const { path } = await textToMp3(script, voice, { energy: 3 });

      updateAdvertStatus(ad.id, 'approved', 'Auto-generated and approved', path);
      console.log(`[catalog] Listener ad ready: ${ad.business_name} → ${path}`);
    } catch (err) {
      console.error(`[catalog] Failed to process listener ad ${ad.id}:`, err.message);
    }
  }
}

export async function startCatalogWorker() {
  await loadIndex();
  const stats = catalogStats();
  console.log(`[catalog] Loaded ${stats.total} adverts — unplayed: ${stats.unplayed} | dark:${stats.byHumor.dark} light:${stats.byHumor.light} dry:${stats.byHumor.dry} absurd:${stats.byHumor.absurd}`);

  // Fill in background immediately, then top up on interval
  fillCatalog().catch(() => {});
  setInterval(() => fillCatalog().catch(() => {}), REPLENISH_INTERVAL);

  // Process approved listener ads every 5 minutes
  processListenerAds().catch(() => {});
  setInterval(() => processListenerAds().catch(() => {}), 5 * 60 * 1000);

  // Daily rotation: remove oldest, add newest — keeps catalog fresh
  setInterval(() => rotateCatalog().catch(() => {}), MS_PER_DAY);
}
