// Archive.org CC music seeder
// Downloads CC-licensed AI-generated music from the Internet Archive
// as a high-quality gap-fill tier — plays when the local queue runs dry.
//
// No auth, no paid APIs. Uses ffmpeg (already a dep) for download + normalise.
// Pool lives at tmp/music/archive/. Index persisted to tmp/music/archive/index.json.

import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join, basename } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const ARCHIVE_DIR  = join(process.cwd(), 'tmp', 'music', 'archive');
const INDEX_PATH   = join(ARCHIVE_DIR, 'index.json');
const TARGET_COUNT = 120;  // tracks to keep on disk
const MIN_DUR_S    = 20;
const MAX_DUR_S    = 480;  // 8 min cap

// Ordered search queries — most likely to yield genuine AI tracks first.
const QUERIES = [
  'subject:suno AND mediatype:audio',
  'subject:udio AND mediatype:audio',
  'subject:"ai music" AND mediatype:audio',
  'subject:"ai generated music" AND mediatype:audio',
  'subject:"generative music" AND mediatype:audio',
  'subject:"suno ai" AND mediatype:audio',
  'subject:"udio ai" AND mediatype:audio',
  'subject:"music generation" AND mediatype:audio',
  'subject:"electronic music" AND mediatype:audio AND licenseurl:"creativecommons"',
  'subject:"ambient music" AND mediatype:audio AND licenseurl:"creativecommons"',
  'subject:"lo-fi" AND mediatype:audio AND licenseurl:"creativecommons"',
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
  } catch { pool = []; }
}

async function savePool() {
  await writeFile(INDEX_PATH, JSON.stringify(pool, null, 2));
}

// ── Archive.org API ─────────────────────────────────────────────────────────

async function searchArchive(query, rows = 30) {
  const q = encodeURIComponent(
    `(${query}) AND licenseurl:"https://creativecommons.org"`
  );
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
      // prefer files whose declared duration is in our window
      const inRange = f => {
        const d = parseFloat(f.length);
        return d >= MIN_DUR_S && d <= MAX_DUR_S ? 0 : 1;
      };
      return inRange(a) - inRange(b);
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

  console.log(`[archive] Pool: ${pool.length}/${TARGET_COUNT} (+${added})`);
  seeding = false;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getArchiveTrack() {
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
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
