// Stream manager — one persistent FFmpeg process fed via stdin.
// Segments are piped sequentially into FFmpeg's stdin, which streams
// continuously to Icecast. No disconnect between tracks.
//
// Gap prevention:
//   1. Silence MP3 generated at startup — piped whenever queue is empty
//   2. Catalog fallback — pulls a real advert before falling back to silence
//   3. FFmpeg auto-restart on exit

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { queue } from './queue.js';
import { getFromCatalog, catalogSize } from './content/advertCatalog.js';
import { getArchiveTrack, archivePoolSize } from './content/archiveMusic.js';
import { logBroadcast } from './db.js';

const execFileAsync = promisify(execFile);

const ICECAST = {
  host: 'localhost',
  port: 8000,
  mount: '/stream',
  password: 'radiogaga_source',
};

const ICECAST_URL = `icecast://source:${ICECAST.password}@${ICECAST.host}:${ICECAST.port}${ICECAST.mount}`;
const TMP_DIR = join(process.cwd(), 'tmp');
const SILENCE_PATH = join(TMP_DIR, 'silence.mp3');

let ffmpegProc = null;
let running = false;
let silenceReady = false;

// Generate a 5-second silence MP3 once at startup.
async function ensureSilence() {
  if (silenceReady && existsSync(SILENCE_PATH)) return;
  mkdirSync(TMP_DIR, { recursive: true });
  try {
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'aevalsrc=0',
      '-t', '5',
      '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
      '-y', SILENCE_PATH,
    ]);
    silenceReady = true;
    console.log('[stream] Silence buffer ready');
  } catch (err) {
    console.warn('[stream] Could not generate silence:', err.message);
  }
}

// Get the duration of an MP3 file in milliseconds via ffprobe.
async function getAudioDurationMs(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    return Math.round(parseFloat(stdout.trim()) * 1000);
  } catch {
    return null;
  }
}

// Pipe one file into FFmpeg's stdin without closing it.
// Does NOT wait for playback duration — caller handles timing.
function pipeFile(filePath, stdin) {
  return new Promise((resolve) => {
    const src = createReadStream(filePath);
    src.on('error', (err) => { console.error('[stream] Read error:', err.message); resolve(); });
    src.on('end', resolve);
    src.pipe(stdin, { end: false });
  });
}

// Pipe a segment and wait for it to finish playing.
async function pipeSegment(segment, stdin) {
  if (!existsSync(segment.path)) {
    console.warn(`[stream] File not found, skipping: ${segment.path}`);
    return;
  }

  console.log(`[stream] >> ${segment.type.toUpperCase()}: ${segment.title}`);

  const durationMs = await getAudioDurationMs(segment.path)
    ?? (segment.duration ? segment.duration * 1000 : 30000);

  const pipeStart = Date.now();
  await pipeFile(segment.path, stdin);

  // Clean up tmp files after piping
  if (segment.path.startsWith(join(process.cwd(), 'tmp', 'audio'))) {
    await unlink(segment.path).catch(() => {});
  }

  // Wait for playback to complete before advancing
  const elapsed = Date.now() - pipeStart;
  const remaining = durationMs - elapsed;
  if (remaining > 50) {
    await new Promise(r => setTimeout(r, remaining));
  }
}

// Pipe silence to keep FFmpeg/Icecast connection alive while waiting for content.
async function pipeSilence(stdin) {
  if (!silenceReady || !existsSync(SILENCE_PATH)) {
    await new Promise(r => setTimeout(r, 500));
    return;
  }
  await pipeFile(SILENCE_PATH, stdin);
  await new Promise(r => setTimeout(r, 5000)); // silence is 5s — wait it out
}

function startFFmpeg() {
  console.log('[stream] Starting persistent FFmpeg → Icecast');

  const proc = spawn('ffmpeg', [
    '-re',
    '-f', 'mp3',
    '-i', 'pipe:0',
    '-vn',
    '-acodec', 'libmp3lame',
    '-ab', '128k',
    '-ar', '44100',
    '-f', 'mp3',
    '-content_type', 'audio/mpeg',
    ICECAST_URL,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });

  proc.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line.includes('Error') || line.includes('error') || line.includes('failed')) {
      console.error('[ffmpeg]', line);
    }
  });

  proc.on('close', (code) => {
    console.warn(`[stream] FFmpeg exited (${code}) — restarting in 2s`);
    ffmpegProc = null;
    if (running) {
      setTimeout(() => { ffmpegProc = startFFmpeg(); }, 2000);
    }
  });

  proc.on('error', (err) => {
    console.error('[stream] FFmpeg spawn error:', err.message);
  });

  return proc;
}

async function runLoop() {
  await ensureSilence();
  await new Promise(r => setTimeout(r, 1000)); // brief startup delay

  while (running) {
    if (!ffmpegProc) {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }

    // 1. Real content from queue
    if (queue.length > 0) {
      const segment = queue.shift();
      logBroadcast({ type: segment.type, title: segment.title, slot: segment.slot });
      try {
        await pipeSegment(segment, ffmpegProc.stdin);
      } catch (err) {
        console.error('[stream] Segment pipe failed:', err.message);
      }
      continue;
    }

    // 2. Archive music fallback — CC AI tracks, sounds like real content
    if (archivePoolSize() > 0) {
      const track = getArchiveTrack();
      if (track && existsSync(track.path)) {
        console.log(`[stream] Archive fill: ${track.title}`);
        logBroadcast({ type: 'music', title: track.title, slot: null });
        try {
          await pipeSegment({ ...track, type: 'music' }, ffmpegProc.stdin);
        } catch (err) {
          console.error('[stream] Archive fill failed:', err.message);
        }
        continue;
      }
    }

    // 3. Catalog fallback — pull an advert rather than going silent
    if (catalogSize() > 0) {
      const filler = getFromCatalog();
      if (filler && existsSync(filler.path)) {
        console.log(`[stream] Gap-fill from catalog: ${filler.title}`);
        logBroadcast({ type: 'advert', title: filler.title, slot: null });
        try {
          await pipeSegment(
            { ...filler, type: 'advert' },
            ffmpegProc.stdin
          );
        } catch (err) {
          console.error('[stream] Catalog filler failed:', err.message);
        }
        continue;
      }
    }

    // 3. Last resort — silence to keep connection alive
    await pipeSilence(ffmpegProc.stdin);
  }
}

export function startStream() {
  if (running) return;
  running = true;
  console.log('[stream] Starting stream loop');
  ffmpegProc = startFFmpeg();
  runLoop().catch(err => console.error('[stream] Loop crashed:', err));
}

export function stopStream() {
  running = false;
  if (ffmpegProc) {
    ffmpegProc.stdin.end();
    ffmpegProc.kill('SIGTERM');
    ffmpegProc = null;
  }
}
