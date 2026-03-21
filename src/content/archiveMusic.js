// Archive.org CC music seeder
// Downloads CC-licensed AI-generated music from the Internet Archive
// as a high-quality gap-fill tier — plays when the local queue runs dry.
//
// No auth, no paid APIs. Uses ffmpeg (already a dep) for download + normalise.
// Pool lives at tmp/music/archive/. Index persisted to tmp/music/archive/index.json.

import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARCHIVE_DIR  = join(ROOT, 'tmp', 'music', 'archive');
const INDEX_PATH   = join(ARCHIVE_DIR, 'index.json');
const TARGET_COUNT = 120;  // tracks to keep on disk
const MIN_DUR_S    = 20;
const MAX_DUR_S    = 240;  // 4 min hard cap
const IDEAL_DUR_S  = 180;  // 3 min target — prefer tracks near this length

// CC-licensed music from Archive.org netlabels — verified to return results.
const QUERIES = [
  'collection:netlabels AND mediatype:audio AND subject:electronic',
  'collection:netlabels AND mediatype:audio AND subject:ambient',
  'collection:netlabels AND mediatype:audio AND subject:instrumental',
  'collection:netlabels AND mediatype:audio AND subject:"lo-fi"',
  'collection:netlabels AND mediatype:audio AND subject:techno',
  'collection:netlabels AND mediatype:audio AND subject:house',
  'collection:netlabels AND mediatype:audio AND subject:experimental',
  'collection:netlabels AND mediatype:audio AND subject:downtempo',
  'collection:netlabels AND mediatype:audio AND subject:chillout',
  'collection:netlabels AND mediatype:audio AND subject:jazz',
];

let pool    = [];   // { identifier, title, creator, path, duration, addedAt }
let seeding = false;

// ── Index helpers ───────────────────────────────────────────────────────────

async function loadPool() {
  try {
    if (existsSync(INDEX_PATH)) {
      const raw = JSON.parse(await readFile(INDEX_PATH, 'utf8'));
      pool = raw.filter(t => existsSync(t.path));
    }
  } catch (err) {
    console.warn('[archive] Failed to load pool index:', err.message);
    pool = [];
  }
}

// Debounced save — coalesces rapid writes during seeding
let poolSaveTimer = null;
async function savePool() {
  if (poolSaveTimer) return;
  poolSaveTimer = setTimeout(async () => {
    poolSaveTimer = null;
    try {
      await writeFile(INDEX_PATH, JSON.stringify(pool, null, 2));
    } catch (err) {
      console.warn('[archive] Failed to save pool index:', err.message);
    }
  }, 2000);
}

async function savePoolNow() {
  if (poolSaveTimer) { clearTimeout(poolSaveTimer); poolSaveTimer = null; }
  await writeFile(INDEX_PATH, JSON.stringify(pool, null, 2));
}

// ── Archive.org API ─────────────────────────────────────────────────────────

async function searchArchive(query, rows = 30) {
  const q = encodeURIComponent(query);
  const url =
    `https://archive.org/advancedsearch.php?q=${q}` +
    `&fl[]=identifier,title,creator&output=json&rows=${rows}&sort[]=downloads+desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const data = await res.json();
  return data.response?.docs ?? [];
}

async function findMp3(identifier) {
  const res = await fetch(
    `https://archive.org/metadata/${identifier}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  const data = await res.json();
  if (!data.files) return null;

  const mp3 = data.files
    .filter(f => {
      if (!f.name.toLowerCase().endsWith('.mp3')) return false;
      if (f.size && parseInt(f.size) > 30_000_000) return false; // skip >30 MB
      return true;
    })
    .sort((a, b) => {
      // Prefer tracks closest to IDEAL_DUR_S (3 min), reject out-of-range
      const score = f => {
        const d = parseFloat(f.length);
        if (!d || d < MIN_DUR_S || d > MAX_DUR_S) return 9999;
        return Math.abs(d - IDEAL_DUR_S); // lower = closer to ideal
      };
      return score(a) - score(b);
    })[0];

  if (!mp3) return null;

  const dur = mp3.length ? parseFloat(mp3.length) : null;
  if (dur && (dur < MIN_DUR_S || dur > MAX_DUR_S)) return null;

  return {
    url:      `https://archive.org/download/${identifier}/${mp3.name}`,
    filename: mp3.name,
    duration: dur,
  };
}

// ── Download ────────────────────────────────────────────────────────────────

async function downloadMp3(url, identifier, filename) {
  const safeName = `${identifier}_${basename(filename).replace(/[^a-z0-9._-]/gi, '_')}`;
  const dest = join(ARCHIVE_DIR, safeName);
  if (existsSync(dest)) return { path: dest, fresh: false };

  await execFileAsync('ffmpeg', [
    '-i', url,
    '-c:a', 'libmp3lame',
    '-ab', '128k',
    '-ar', '44100',
    '-y', dest,
  ], { timeout: 180_000 });

  return { path: dest, fresh: true };
}

async function probeDuration(path) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      path,
    ]);
    return parseFloat(stdout.trim());
  } catch { return null; }
}

// ── Seeding ─────────────────────────────────────────────────────────────────

async function seedOne(doc) {
  if (pool.some(t => t.identifier === doc.identifier)) return false;

  try {
    const mp3 = await findMp3(doc.identifier);
    if (!mp3) return false;

    const { path, fresh } = await downloadMp3(mp3.url, doc.identifier, mp3.filename);
    if (fresh) console.log(`[archive] ↓ ${doc.title || doc.identifier}`);

    const duration = mp3.duration ?? await probeDuration(path);
    if (duration && (duration < MIN_DUR_S || duration > MAX_DUR_S)) {
      if (fresh) await unlink(path).catch(() => {});
      return false;
    }

    pool.push({
      identifier: doc.identifier,
      title:      doc.title   || doc.identifier,
      creator:    doc.creator || 'Archive.org',
      path,
      duration:   duration ?? 120,
      addedAt:    new Date().toISOString(),
    });
    await savePool();
    return true;
  } catch (err) {
    console.warn(`[archive] Seed failed (${doc.identifier}): ${err.message}`);
    return false;
  }
}

export async function seedArchiveMusic() {
  if (seeding) return;
  seeding = true;
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  await loadPool();

  const needed = TARGET_COUNT - pool.length;
  if (needed <= 0) {
    console.log(`[archive] Pool full (${pool.length} tracks)`);
    seeding = false;
    return;
  }

  console.log(`[archive] Seeding — need ${needed} more tracks`);
  let added = 0;

  for (const query of QUERIES) {
    if (added >= needed) break;
    let docs;
    try { docs = await searchArchive(query); }
    catch (err) { console.warn(`[archive] Search error: ${err.message}`); continue; }

    for (const doc of docs) {
      if (added >= needed) break;
      if (await seedOne(doc)) added++;
    }
  }

  await savePoolNow(); // flush any pending debounced writes
  console.log(`[archive] Pool: ${pool.length}/${TARGET_COUNT} (+${added})`);
  seeding = false;
}

// ── Public API ──────────────────────────────────────────────────────────────

// Track recently played to avoid repeats within a session
const recentlyPlayed = new Set();
const MAX_RECENT = 30;

export function getArchiveTrack() {
  if (!pool.length) return null;
  const available = pool.filter(t => !recentlyPlayed.has(t.path));
  const pick = available.length > 0 ? available : pool;
  const track = pick[Math.floor(Math.random() * pick.length)];
  recentlyPlayed.add(track.path);
  if (recentlyPlayed.size > MAX_RECENT) {
    const first = recentlyPlayed.values().next().value;
    recentlyPlayed.delete(first);
  }
  return track;
}

export function archivePoolSize() { return pool.length; }

export function startArchiveWorker() {
  seedArchiveMusic().catch(err => console.warn('[archive] Startup seed error:', err.message));
  // Refresh pool weekly
  setInterval(
    () => seedArchiveMusic().catch(err => console.warn('[archive] Weekly refresh error:', err.message)),
    7 * 24 * 60 * 60 * 1000
  );
}
