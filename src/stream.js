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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { queue } from './queue.js';
import { getFromCatalog, catalogSize } from './content/advertCatalog.js';
import { getArchiveTrack, archivePoolSize } from './content/archiveMusic.js';
import { logBroadcast } from './db.js';
import { getCurrentSlot } from './schedule.js';
import { generateTrackIntro, generateTrackOutro } from './content/trackIntro.js';
import { textToMp3 } from './content/tts.js';
import { getNextShoutout } from './bot/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const execFileAsync = promisify(execFile);

const ICECAST = {
  host: process.env.ICECAST_HOST || 'localhost',
  port: parseInt(process.env.ICECAST_PORT) || 8000,
  mount: '/stream',
  password: process.env.ICECAST_SOURCE_PASSWORD || 'radiogaga_source',
};

const ICECAST_URL = `icecast://source:${ICECAST.password}@${ICECAST.host}:${ICECAST.port}${ICECAST.mount}`;
const TMP_DIR = join(ROOT, 'tmp');
const SILENCE_PATH = join(TMP_DIR, 'silence.mp3');
const JINGLE_PATH = join(ROOT, 'assets', 'jingle.mp3');
const JINGLE_NIGHT = [
  { path: join(ROOT, 'assets', 'jingle-nightcode.mp3'), title: 'radioGAGA Nightcode', duration: 91 },
  { path: join(ROOT, 'assets', 'jingle-afterdark.mp3'), title: 'radioGAGA After Dark', duration: 126 },
];
const JINGLE_SUNRISE = [
  { path: join(ROOT, 'assets', 'jingle-sunrise-1.mp3'), title: 'radioGAGA Sunrise 1', duration: 50 },
  { path: join(ROOT, 'assets', 'jingle-sunrise-2.mp3'), title: 'radioGAGA Sunrise 2', duration: 70 },
];
const JINGLE_AIMUSIC = { path: join(ROOT, 'assets', 'jingle-aimusic.mp3'), title: 'radioGAGA AI Music', duration: 115 };
const JINGLE_INTERVAL_MS = 15 * 60 * 1000;            // daytime: every 15 min
const SPECIAL_JINGLE_INTERVAL_MS = 30 * 60 * 1000;    // night/sunrise: every 30 min
const AIMUSIC_JINGLE_INTERVAL_MS = 60 * 60 * 1000;    // hourly during daytime (9am-9pm)
const NIGHT_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4]);   // 9pm–4am
const SUNRISE_HOURS = new Set([5, 6, 7, 8]);                  // 5am–8am
const DAYTIME_HOURS = new Set([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]); // 9am–8pm

let ffmpegProc = null;
let running = false;
let silenceReady = false;
let lastFallbackTrack = null;  // track info for back-announce on archive fallback
let fallbackTrackCount = 0;     // counts archive fallback tracks for ad cadence
let lastShoutoutTime = 0;       // timestamp of last shoutout played
let lastJingleTime = 0;         // timestamp of last jingle played
let lastAiMusicJingleTime = 0;  // timestamp of last AI Music hourly jingle
let nightJingleIndex = 0;       // alternates between Nightcode and After Dark
let sunriseJingleIndex = 0;     // alternates between Sunrise 1 and 2
let lastStreamSlotId = null;    // detect show transitions
const SHOUTOUT_COOLDOWN_MS = 60_000; // max 1 shoutout per minute

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

  const MAX_MUSIC_MS = 240_000; // 4 min hard cap for music tracks
  let durationMs = await getAudioDurationMs(segment.path)
    ?? (segment.duration ? segment.duration * 1000 : 30000);

  // Cap music tracks at 4 minutes — trim file with ffmpeg if needed
  if (segment.type === 'music' && durationMs > MAX_MUSIC_MS) {
    try {
      const trimmedPath = segment.path.replace(/\.mp3$/, '-trimmed.mp3');
      await execFileAsync('ffmpeg', [
        '-i', segment.path,
        '-t', String(MAX_MUSIC_MS / 1000),
        '-af', `afade=t=out:st=${(MAX_MUSIC_MS / 1000) - 3}:d=3`,
        '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
        '-y', trimmedPath,
      ]);
      console.log(`[stream] Trimmed ${Math.round(durationMs / 1000)}s → ${MAX_MUSIC_MS / 1000}s: ${segment.title}`);
      segment.path = trimmedPath;
      durationMs = MAX_MUSIC_MS;
    } catch (err) {
      console.warn(`[stream] Trim failed, playing full: ${err.message}`);
    }
  }

  const pipeStart = Date.now();
  await pipeFile(segment.path, stdin);

  // Clean up tmp files after piping
  if (segment.path.startsWith(join(ROOT, 'tmp', 'audio'))) {
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
    // Null out immediately so runLoop stops writing to dead stdin
    if (ffmpegProc === proc) ffmpegProc = null;
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

    // 0a. Station jingle — daytime sting every 15 min, night jingles every 30 min (alternating)
    {
      const slot = getCurrentSlot();
      const hour = new Date().getHours();
      const isNight = NIGHT_HOURS.has(hour);
      const isSunrise = SUNRISE_HOURS.has(hour);
      const interval = (isNight || isSunrise) ? SPECIAL_JINGLE_INTERVAL_MS : JINGLE_INTERVAL_MS;
      const showChanged = lastStreamSlotId && slot.id !== lastStreamSlotId;
      const jingleDue = Date.now() - lastJingleTime >= interval;
      lastStreamSlotId = slot.id;

      if ((jingleDue || showChanged) && ffmpegProc) {
        let jingle;
        if (isNight) {
          jingle = JINGLE_NIGHT[nightJingleIndex % JINGLE_NIGHT.length];
          nightJingleIndex++;
        } else if (isSunrise) {
          jingle = JINGLE_SUNRISE[sunriseJingleIndex % JINGLE_SUNRISE.length];
          sunriseJingleIndex++;
        } else {
          jingle = { path: JINGLE_PATH, title: 'radioGAGA Sting', duration: 29 };
        }

        if (existsSync(jingle.path)) {
          if (showChanged) console.log(`[stream] Show transition → ${slot.name} — playing ${jingle.title}`);
          else console.log(`[stream] Periodic: ${jingle.title}`);
          logBroadcast({ type: 'jingle', title: jingle.title, slot: slot.id });
          try {
            await pipeSegment({ ...jingle, type: 'jingle' }, ffmpegProc.stdin);
          } catch (err) {
            console.error('[stream] Jingle pipe failed:', err.message);
          }
          lastJingleTime = Date.now();
        }
      }
    }

    // 0a-2. AI Music hourly jingle — 9am to 8pm, roughly every hour
    {
      const hour = new Date().getHours();
      if (DAYTIME_HOURS.has(hour) && Date.now() - lastAiMusicJingleTime >= AIMUSIC_JINGLE_INTERVAL_MS && ffmpegProc) {
        if (existsSync(JINGLE_AIMUSIC.path)) {
          console.log(`[stream] Hourly: ${JINGLE_AIMUSIC.title}`);
          logBroadcast({ type: 'jingle', title: JINGLE_AIMUSIC.title, slot: getCurrentSlot().id });
          try {
            await pipeSegment({ ...JINGLE_AIMUSIC, type: 'jingle' }, ffmpegProc.stdin);
          } catch (err) {
            console.error('[stream] AI Music jingle failed:', err.message);
          }
          lastAiMusicJingleTime = Date.now();
        }
      }
    }

    // 0b. Priority shoutouts — play between segments, max 1/min, never after adverts/decent
    if (Date.now() - lastShoutoutTime >= SHOUTOUT_COOLDOWN_MS) {
      const shoutout = getNextShoutout();
      if (shoutout) {
        console.log(`[stream] Playing shoutout (${shoutout.length} parts)`);
        for (const part of shoutout) {
          if (!ffmpegProc) break;
          logBroadcast({ type: 'shoutout', title: part.title, slot: part.slot });
          try {
            await pipeSegment(part, ffmpegProc.stdin);
          } catch (err) {
            console.error('[stream] Shoutout pipe failed:', err.message);
          }
        }
        lastShoutoutTime = Date.now();
      }
    }

    // 1. Real content from queue
    if (queue.length > 0) {
      const segment = queue.shift();
      const isAdvert = segment.type === 'advert' || (segment.title || '').toLowerCase().includes('decent');
      logBroadcast({ type: segment.type, title: segment.title, slot: segment.slot });
      try {
        if (!ffmpegProc) continue; // FFmpeg died between check and pipe
        await pipeSegment(segment, ffmpegProc.stdin);
      } catch (err) {
        console.error('[stream] Segment pipe failed:', err.message);
      }
      // Block shoutouts for 60s after adverts/decent spots
      if (isAdvert) lastShoutoutTime = Date.now();
      continue;
    }

    // 2. Archive music fallback — CC tracks with proper DJ intros/outros
    //    Mimics the produced content flow: intro → track → outro, with
    //    adverts every 3rd track to break up the music wall.
    if (archivePoolSize() > 0) {
      const track = getArchiveTrack();
      if (track && existsSync(track.path)) {
        const slot = getCurrentSlot();
        const trackInfo = { title: track.title, creator: track.creator, mood: slot.musicMood || '' };

        // Back-announce previous archive track if we have one
        if (lastFallbackTrack) {
          try {
            const outro = await generateTrackOutro(slot, lastFallbackTrack);
            if (outro.path && existsSync(outro.path)) {
              logBroadcast({ type: 'dj', title: outro.title, slot: slot.id });
              if (ffmpegProc) await pipeSegment({ ...outro, type: 'dj' }, ffmpegProc.stdin);
            }
          } catch (err) {
            console.warn(`[stream] Fallback outro failed: ${err.message}`);
          }
        }

        // Every 3rd archive track, drop in a catalog advert
        fallbackTrackCount++;
        if (fallbackTrackCount % 3 === 0 && catalogSize() > 0) {
          const ad = getFromCatalog(slot.advertHumor);
          if (ad && existsSync(ad.path)) {
            console.log(`[stream] Fallback ad break: ${ad.title}`);
            logBroadcast({ type: 'advert', title: ad.title, slot: slot.id });
            try {
              if (ffmpegProc) await pipeSegment({ ...ad, type: 'advert' }, ffmpegProc.stdin);
            } catch (err) {
              console.error('[stream] Fallback ad failed:', err.message);
            }
          }
        }

        // Track intro
        try {
          const intro = await generateTrackIntro(slot, trackInfo);
          if (intro.path && existsSync(intro.path)) {
            logBroadcast({ type: 'dj', title: intro.title, slot: slot.id });
            if (ffmpegProc) await pipeSegment({ ...intro, type: 'dj' }, ffmpegProc.stdin);
          }
        } catch (err) {
          // Minimal fallback intro via TTS
          try {
            const line = track.title.startsWith('AI Music')
              ? `Something fresh for you on radioGAGA.`
              : `This is ${track.title} by ${track.creator}.`;
            const { path } = await textToMp3(line, slot.voice);
            if (ffmpegProc) await pipeSegment({ path, type: 'dj', title: `Quick intro — ${track.title}` }, ffmpegProc.stdin);
          } catch {}
          console.warn(`[stream] Fallback intro failed: ${err.message}`);
        }

        // The actual track
        console.log(`[stream] Archive fill: ${track.title}`);
        logBroadcast({ type: 'music', title: track.title, slot: slot.id });
        try {
          if (ffmpegProc) await pipeSegment({ ...track, type: 'music' }, ffmpegProc.stdin);
        } catch (err) {
          console.error('[stream] Archive fill failed:', err.message);
        }
        lastFallbackTrack = trackInfo;
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

    // 4. Last resort — silence to keep connection alive
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
