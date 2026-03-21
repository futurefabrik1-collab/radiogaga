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
      '-t', '2',
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

// Crossfade: mix a voice file over the tail of a music file.
// The music fades out over the last `overlapS` seconds while the voice fades in.
// Returns the path to the merged file.
async function crossfadeMusicVoice(musicPath, voicePath, overlapS = 4) {
  const musicDurMs = await getAudioDurationMs(musicPath);
  const voiceDurMs = await getAudioDurationMs(voicePath);
  if (!musicDurMs || !voiceDurMs) return null;

  const musicDurS = musicDurMs / 1000;
  const voiceDurS = voiceDurMs / 1000;
  const actualOverlap = Math.min(overlapS, musicDurS * 0.3, voiceDurS); // don't overlap more than 30% of track or full voice

  // Voice starts at (musicDur - overlap), music fades out over that period
  const voiceStartS = musicDurS - actualOverlap;
  const fadeStartS = Math.max(0, musicDurS - actualOverlap - 1); // start fade 1s before voice

  const outPath = musicPath.replace(/\.mp3$/, '-xfade.mp3');
  try {
    await execFileAsync('ffmpeg', [
      '-i', musicPath,
      '-i', voicePath,
      '-filter_complex',
      // Music: fade out starting just before the voice comes in
      `[0:a]afade=t=out:st=${fadeStartS}:d=${actualOverlap + 1}[music];` +
      // Voice: delay to start at the overlap point, with fade-in
      `[1:a]adelay=${Math.round(voiceStartS * 1000)}|${Math.round(voiceStartS * 1000)},afade=t=in:d=0.3[voice];` +
      // Mix together
      `[music][voice]amix=inputs=2:duration=longest:dropout_transition=1[out]`,
      '-map', '[out]',
      '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100', '-y', outPath,
    ], { timeout: 30000 });
    return outPath;
  } catch (err) {
    console.warn(`[stream] Crossfade failed: ${err.message}`);
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
  const FADE_OUT_S = 4;   // fade-out duration for music tracks
  const FADE_IN_S = 0.5;  // subtle fade-in on all segments to prevent click/pop
  let durationMs = await getAudioDurationMs(segment.path)
    ?? (segment.duration ? segment.duration * 1000 : 30000);

  const durationS = durationMs / 1000;
  const isMusic = segment.type === 'music';
  const needsProcessing = isMusic || segment.type === 'jingle';

  // Music and jingles: apply fade-out (and trim if over 4 min)
  // All other segments: apply a subtle fade-in to prevent pops
  {
    try {
      const processedPath = segment.path.replace(/\.mp3$/, '-proc.mp3');
      const filters = [];

      // Fade-in on everything (prevents click between segments)
      filters.push(`afade=t=in:d=${FADE_IN_S}`);

      if (isMusic) {
        const effectiveDuration = Math.min(durationS, MAX_MUSIC_MS / 1000);
        // Fade-out on music tracks
        filters.push(`afade=t=out:st=${effectiveDuration - FADE_OUT_S}:d=${FADE_OUT_S}`);

        const args = ['-i', segment.path];
        if (durationMs > MAX_MUSIC_MS) {
          args.push('-t', String(MAX_MUSIC_MS / 1000));
          console.log(`[stream] Trimmed ${Math.round(durationS)}s → ${MAX_MUSIC_MS / 1000}s: ${segment.title}`);
        }
        args.push('-af', filters.join(','),
          '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100', '-y', processedPath);
        await execFileAsync('ffmpeg', args);
        segment.path = processedPath;
        if (durationMs > MAX_MUSIC_MS) durationMs = MAX_MUSIC_MS;
      } else {
        // Non-music: just fade-in
        await execFileAsync('ffmpeg', [
          '-i', segment.path,
          '-af', filters.join(','),
          '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100', '-y', processedPath,
        ]);
        segment.path = processedPath;
      }
    } catch (err) {
      // If processing fails, play the original file unchanged
      console.warn(`[stream] Audio processing failed, playing raw: ${err.message}`);
    }
  }

  // Re-measure duration after processing (ffmpeg can slightly change it)
  const finalDurationMs = await getAudioDurationMs(segment.path) ?? durationMs;

  const pipeStart = Date.now();
  await pipeFile(segment.path, stdin);

  // Clean up tmp files after piping
  if (segment.path.startsWith(join(ROOT, 'tmp', 'audio'))) {
    await unlink(segment.path).catch(() => {});
  }
  // Also clean up -proc files
  if (segment.path.endsWith('-proc.mp3')) {
    await unlink(segment.path).catch(() => {});
  }

  // Wait for playback to complete before advancing.
  // Add 300ms safety buffer — FFmpeg's -re flag plays in real time but
  // the pipe completes nearly instantly, so we must wait the full duration
  // plus a small margin to prevent the tail of speech being cut off.
  const elapsed = Date.now() - pipeStart;
  const remaining = finalDurationMs - elapsed + 100; // 100ms safety buffer (tight)
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
  await new Promise(r => setTimeout(r, 1000)); // silence is 2s but only wait 1s to keep checking queue
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
          logBroadcast({ type: 'jingle', title: jingle.title, slot: slot.id, generator: 'pre-produced', source: 'ai-generated-jingle' });
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
          logBroadcast({ type: 'jingle', title: JINGLE_AIMUSIC.title, slot: getCurrentSlot().id, generator: 'pre-produced', source: 'ai-generated-jingle' });
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
          logBroadcast({ type: 'shoutout', title: part.title, slot: part.slot, generator: 'groq+edge-tts', model: 'llama-3.3-70b-versatile', voice: part.voice });
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

      // Crossfade: if this is a music segment and the next queued item is DJ/talk,
      // merge the voice over the music tail for seamless radio flow
      if (segment.type === 'music' && queue.length > 0 && queue.items[0]?.type === 'dj') {
        const nextDJ = queue.shift();
        const merged = await crossfadeMusicVoice(segment.path, nextDJ.path, 5);
        if (merged && existsSync(merged)) {
          logBroadcast({ type: 'music', title: segment.title, slot: segment.slot, generator: segment.generator || 'groq+edge-tts', model: segment.model || 'llama-3.3-70b-versatile', voice: segment.voice, source: segment.source || 'ai-generated' });
          logBroadcast({ type: 'dj', title: nextDJ.title, slot: nextDJ.slot, generator: 'groq+edge-tts', model: 'llama-3.3-70b-versatile', voice: nextDJ.voice });
          try {
            if (ffmpegProc) await pipeSegment({ path: merged, type: 'music', title: `${segment.title} → ${nextDJ.title}` }, ffmpegProc.stdin);
            await unlink(merged).catch(() => {});
          } catch (err) {
            console.error('[stream] Queue crossfade failed:', err.message);
          }
          continue;
        }
        // Crossfade failed — put DJ segment back and play separately
        queue.items.unshift(nextDJ);
      }

      logBroadcast({ type: segment.type, title: segment.title, slot: segment.slot, generator: segment.generator || 'groq+edge-tts', model: segment.model || 'llama-3.3-70b-versatile', voice: segment.voice, source: segment.source || 'ai-generated' });
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

        // Generate the outro (back-announce) for the previous track and
        // the intro for the upcoming track BEFORE playing — we'll try to
        // crossfade them over the music.
        let outroPath = null;
        let outroTitle = null;
        if (lastFallbackTrack) {
          try {
            const outro = await generateTrackOutro(slot, lastFallbackTrack);
            if (outro.path && existsSync(outro.path)) {
              outroPath = outro.path;
              outroTitle = outro.title;
            }
          } catch (err) {
            console.warn(`[stream] Fallback outro failed: ${err.message}`);
          }
        }

        let introPath = null;
        let introTitle = null;
        try {
          const intro = await generateTrackIntro(slot, trackInfo);
          if (intro.path && existsSync(intro.path)) {
            introPath = intro.path;
            introTitle = intro.title;
          }
        } catch (err) {
          // Minimal fallback intro via TTS
          try {
            const line = track.title.startsWith('AI Music')
              ? `Something fresh for you on radioGAGA.`
              : `This is ${track.title} by ${track.creator}.`;
            const { path } = await textToMp3(line, slot.voice);
            introPath = path;
            introTitle = `Quick intro — ${track.title}`;
          } catch {}
          console.warn(`[stream] Fallback intro failed: ${err.message}`);
        }

        // Every 3rd archive track, drop in a catalog advert
        fallbackTrackCount++;
        if (fallbackTrackCount % 3 === 0 && catalogSize() > 0) {
          const ad = getFromCatalog(slot.advertHumor);
          if (ad && existsSync(ad.path)) {
            console.log(`[stream] Fallback ad break: ${ad.title}`);
            logBroadcast({ type: 'advert', title: ad.title, slot: slot.id, generator: 'groq+edge-tts', model: 'llama-3.3-70b-versatile', source: 'ai-generated-advert' });
            try {
              if (ffmpegProc) await pipeSegment({ ...ad, type: 'advert' }, ffmpegProc.stdin);
            } catch (err) {
              console.error('[stream] Fallback ad failed:', err.message);
            }
          }
        }

        // Try to crossfade the outro voice over the end of the music track
        // If crossfade works, play the merged file; otherwise play separately
        let crossfadedPath = null;
        if (outroPath) {
          crossfadedPath = await crossfadeMusicVoice(track.path, outroPath, 5);
        }

        if (crossfadedPath && existsSync(crossfadedPath)) {
          // Play music+outro as one merged file
          console.log(`[stream] Archive fill (with voice-over): ${track.title}`);
          logBroadcast({ type: 'dj', title: outroTitle, slot: slot.id, generator: 'groq+edge-tts', model: 'llama-3.3-70b-versatile', voice: slot.voice });
          logBroadcast({ type: 'music', title: track.title, slot: slot.id, generator: 'ai-composed', source: track.source || 'cc-licensed-ai-music', model: track.model || null });
          try {
            if (ffmpegProc) await pipeSegment({ path: crossfadedPath, type: 'music', title: track.title }, ffmpegProc.stdin);
            await unlink(crossfadedPath).catch(() => {});
          } catch (err) {
            console.error('[stream] Crossfade playback failed:', err.message);
          }
        } else {
          // Fallback: play outro then music separately
          if (outroPath) {
            logBroadcast({ type: 'dj', title: outroTitle, slot: slot.id, generator: 'groq+edge-tts', model: 'llama-3.3-70b-versatile', voice: slot.voice });
            if (ffmpegProc) await pipeSegment({ path: outroPath, type: 'dj', title: outroTitle }, ffmpegProc.stdin);
          }
          console.log(`[stream] Archive fill: ${track.title}`);
          logBroadcast({ type: 'music', title: track.title, slot: slot.id, generator: 'ai-composed', source: track.source || 'cc-licensed-ai-music', model: track.model || null });
          try {
            if (ffmpegProc) await pipeSegment({ ...track, type: 'music' }, ffmpegProc.stdin);
          } catch (err) {
            console.error('[stream] Archive fill failed:', err.message);
          }
        }

        // Play intro for the next track (this sits between tracks)
        if (introPath) {
          logBroadcast({ type: 'dj', title: introTitle, slot: slot.id, generator: 'groq+edge-tts', model: 'llama-3.3-70b-versatile', voice: slot.voice });
          if (ffmpegProc) await pipeSegment({ path: introPath, type: 'dj', title: introTitle }, ffmpegProc.stdin);
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
        logBroadcast({ type: 'advert', title: filler.title, slot: null, generator: 'groq+edge-tts', source: 'ai-generated-advert' });
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
