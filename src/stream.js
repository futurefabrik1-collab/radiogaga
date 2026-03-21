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
const SILENCE_PAD_PATH = join(TMP_DIR, 'silence-pad.mp3');
const JINGLE_SHORT = { path: join(ROOT, 'assets', 'jingle-aimusic-short.mp3'), title: 'radioGAGA', duration: 24 };
const JINGLE_LONG = { path: join(ROOT, 'assets', 'jingle-aimusic-long.mp3'), title: 'radioGAGA AI Music', duration: 118 };
const STING_NEWSFLASH = { path: join(ROOT, 'assets', 'jingle-newsflash.mp3'), title: 'radioGAGA Newsflash', duration: 10 };
const STING_CHANCE = 0.2; // 20% chance to play sting between segments
const JINGLE_INTERVAL_MS = 15 * 60 * 1000;            // play short jingle every 15 min
const NIGHT_HOURS = new Set([21, 22, 23, 0, 1, 2, 3, 4]);   // 9pm–4am

let ffmpegProc = null;
let running = false;
let silenceReady = false;
let lastFallbackTrack = null;  // track info for back-announce on archive fallback
let fallbackTrackCount = 0;     // counts archive fallback tracks for ad cadence
let lastShoutoutTime = 0;       // timestamp of last shoutout played
let lastJingleTime = 0;         // timestamp of last jingle played
let firstJinglePlayed = false;   // play long jingle only on first load
let lastStreamSlotId = null;    // detect show transitions
let pendingIntro = null;         // pre-generated intro for next archive track
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
    // Tiny silence pad (~100ms) used between piped files to prevent MP3 frame boundary errors
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', 'aevalsrc=0',
      '-t', '0.1',
      '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
      '-y', SILENCE_PAD_PATH,
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

// Decode an MP3 file to raw s16le PCM and pipe into FFmpeg's stdin.
// This eliminates MP3 frame boundary errors when concatenating files.
function pipeFile(filePath, stdin) {
  return new Promise((resolve) => {
    const decoder = spawn('ffmpeg', [
      '-i', filePath,
      '-f', 's16le',
      '-ar', '44100',
      '-ac', '2',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    decoder.stderr.on('data', () => {}); // suppress ffmpeg stderr
    decoder.stdout.on('error', () => {});
    decoder.on('error', (err) => { console.error('[stream] Decode error:', err.message); resolve(); });

    decoder.stdout.pipe(stdin, { end: false });
    decoder.on('close', resolve);
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

  // Use raw s16le PCM on stdin to avoid MP3 frame boundary errors when
  // concatenating multiple files. Each segment is decoded to PCM before piping.
  const proc = spawn('ffmpeg', [
    '-re',
    '-f', 's16le',
    '-ar', '44100',
    '-ac', '2',
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

    // 0a. Station jingle — long on first load (cold start buffer), short every 15 min after
    {
      const slot = getCurrentSlot();
      const showChanged = lastStreamSlotId && slot.id !== lastStreamSlotId;
      const jingleDue = Date.now() - lastJingleTime >= JINGLE_INTERVAL_MS;
      lastStreamSlotId = slot.id;

      if ((!firstJinglePlayed || jingleDue || showChanged) && ffmpegProc) {
        // First jingle after start: play the long version (buffer for new listeners)
        const jingle = !firstJinglePlayed ? JINGLE_LONG : JINGLE_SHORT;

        if (existsSync(jingle.path)) {
          if (!firstJinglePlayed) console.log(`[stream] Cold start: ${jingle.title} (long)`);
          else if (showChanged) console.log(`[stream] Show transition → ${slot.name}`);
          else console.log(`[stream] Periodic: ${jingle.title}`);
          logBroadcast({ type: 'jingle', title: jingle.title, slot: slot.id, generator: 'pre-produced', source: 'ai-generated-jingle' });
          try {
            await pipeSegment({ ...jingle, type: 'jingle' }, ffmpegProc.stdin);
          } catch (err) {
            console.error('[stream] Jingle pipe failed:', err.message);
          }
          firstJinglePlayed = true;
          lastJingleTime = Date.now();
        }
      }
    }

    // 0b. Priority shoutouts — play between segments, max 1/min, never after adverts/decent
    if (Date.now() - lastShoutoutTime >= SHOUTOUT_COOLDOWN_MS) {
      const shoutout = getNextShoutout();
      if (shoutout) {
        // Extract the sender's first name from the shoutout title
        const nameMatch = shoutout[0]?.title?.match(/— (\w+)/);
        const firstName = nameMatch?.[1] || 'that';

        console.log(`[stream] Playing shoutout (${shoutout.length} parts)`);
        for (const part of shoutout) {
          if (!ffmpegProc) break;
          logBroadcast({ type: 'shoutout', title: part.title, slot: part.slot, generator: 'openrouter+edge-tts', voice: part.voice });
          try {
            await pipeSegment(part, ffmpegProc.stdin);
          } catch (err) {
            console.error('[stream] Shoutout pipe failed:', err.message);
          }
        }

        // Generate a short thank-you from the current presenter
        try {
          const slot = getCurrentSlot();
          const { ollama: llm } = await import('./content/ollama.js');
          const { textToMp3 } = await import('./content/tts.js');
          const thanks = await llm.generate({
            prompt: `You are ${slot.presenterName} on radioGAGA. Write a warm 8-15 word thank-you to a listener named ${firstName} who just sent a shoutout. Be genuine, brief, in character. Output ONLY the spoken words:`,
            options: { temperature: 0.95, num_predict: 40 },
          });
          const { path } = await textToMp3(thanks.response.trim(), slot.voice, { energy: slot.energy });
          if (ffmpegProc) await pipeSegment({ path, type: 'dj', title: `Thanks — ${firstName}` }, ffmpegProc.stdin);
        } catch (err) {
          console.warn('[stream] Shoutout thank-you failed:', err.message);
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
      if (segment.type === 'music' && queue.length > 0 && queue.peek()?.type === 'dj') {
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
        queue.unshift(nextDJ);
      }

      logBroadcast({ type: segment.type, title: segment.title, slot: segment.slot, generator: segment.generator || 'groq+edge-tts', model: segment.model || 'llama-3.3-70b-versatile', voice: segment.voice, source: segment.source || 'ai-generated' });
      try {
        if (!ffmpegProc) continue; // FFmpeg died between check and pipe
        await pipeSegment(segment, ffmpegProc.stdin);
      } catch (err) {
        console.error('[stream] Segment pipe failed:', err.message);
      }

      // Random sting between segments (~20% chance, not after jingles/stings)
      if (segment.type !== 'jingle' && Math.random() < STING_CHANCE && existsSync(STING_NEWSFLASH.path) && ffmpegProc) {
        try {
          console.log(`[stream] Random sting: ${STING_NEWSFLASH.title}`);
          logBroadcast({ type: 'jingle', title: STING_NEWSFLASH.title, slot: getCurrentSlot().id, generator: 'pre-produced', source: 'ai-generated-jingle' });
          await pipeSegment({ ...STING_NEWSFLASH, type: 'jingle' }, ffmpegProc.stdin);
        } catch (err) {
          console.error('[stream] Sting pipe failed:', err.message);
        }
      }

      // Block shoutouts for 60s after adverts/decent spots
      if (isAdvert) lastShoutoutTime = Date.now();
      continue;
    }

    // 2. Archive music fallback — CC tracks with DJ intros/outros.
    //    KEY: play music IMMEDIATELY, generate voice in parallel to avoid gaps.
    //    Adverts every 3rd track to break up the music wall.
    if (archivePoolSize() > 0) {
      const track = getArchiveTrack();
      if (track && existsSync(track.path)) {
        const slot = getCurrentSlot();
        const trackInfo = { title: track.title, creator: track.creator, mood: slot.musicMood || '' };

        // If we have a pre-generated intro from the previous iteration, play it first
        if (pendingIntro && existsSync(pendingIntro.path)) {
          logBroadcast({ type: 'dj', title: pendingIntro.title, slot: slot.id, generator: 'openrouter+edge-tts', model: 'llama-3.3-70b-instruct', voice: slot.voice });
          try {
            if (ffmpegProc) await pipeSegment(pendingIntro, ffmpegProc.stdin);
          } catch {}
        }
        pendingIntro = null;

        // Every 3rd archive track, drop in a catalog advert before the music
        fallbackTrackCount++;
        if (fallbackTrackCount % 3 === 0 && catalogSize() > 0) {
          const ad = getFromCatalog(slot.advertHumor);
          if (ad && existsSync(ad.path)) {
            console.log(`[stream] Fallback ad break: ${ad.title}`);
            logBroadcast({ type: 'advert', title: ad.title, slot: slot.id, generator: 'openrouter+edge-tts', source: 'ai-generated-advert' });
            try {
              if (ffmpegProc) await pipeSegment({ ...ad, type: 'advert' }, ffmpegProc.stdin);
            } catch (err) {
              console.error('[stream] Fallback ad failed:', err.message);
            }
          }
        }

        // Play the music track NOW — no waiting for LLM
        console.log(`[stream] Archive fill: ${track.title}`);
        logBroadcast({ type: 'music', title: track.title, slot: slot.id, generator: 'ai-composed', source: track.source || 'cc-licensed-ai-music', model: track.model || null });
        try {
          if (ffmpegProc) await pipeSegment({ ...track, type: 'music' }, ffmpegProc.stdin);
        } catch (err) {
          console.error('[stream] Archive fill failed:', err.message);
        }

        // While the track was playing, generate an intro for the NEXT track
        // (non-blocking — if it fails, the next iteration just skips the intro)
        try {
          const nextTrack = getArchiveTrack();
          if (nextTrack) {
            const nextInfo = { title: nextTrack.title, creator: nextTrack.creator, mood: slot.musicMood || '' };
            // Put the peeked track back (we'll re-get it next iteration)
            // Actually we can't put it back, so generate outro for current + intro for next
            const intro = await generateTrackIntro(slot, nextInfo);
            if (intro.path && existsSync(intro.path)) {
              pendingIntro = { path: intro.path, type: 'dj', title: intro.title };
            }
            // Store the peeked track info for next iteration
            lastFallbackTrack = trackInfo;
          }
        } catch (err) {
          console.warn(`[stream] Intro pre-generation failed: ${err.message}`);
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
