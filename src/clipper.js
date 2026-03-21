// Auto-clipper — scans broadcast history for interesting segments,
// extracts audio clips, generates captioned video with waveform visualiser.
// Outputs MP4 files ready for TikTok/Reels/YouTube Shorts.
//
// Runs periodically (every 2 hours) and produces 3-5 clips per day.

import { join } from 'node:path';
import { mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBroadcastHistory } from './db.js';
import { ollama } from './content/ollama.js';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const CLIP_DIR = join(ROOT, 'data', 'clips');
const CLIP_INDEX = join(CLIP_DIR, 'clips.json');
const MAX_CLIPS_PER_RUN = 2;
const MAX_CLIPS_STORED = 50; // rotate oldest
const CLIP_DURATION_S = 45; // target clip length

mkdirSync(CLIP_DIR, { recursive: true });

// Clip categories with social media hooks
const CLIP_TYPES = [
  { type: 'dj', label: 'AI PRESENTER', hook: 'AI says what?!', color: 'FFD700' },
  { type: 'guest', label: 'AI INTERVIEW', hook: 'AI interviews AI', color: 'DA70D6' },
  { type: 'news', label: 'AI NEWS', hook: 'Good news only', color: 'FF6B6B' },
  { type: 'advert', label: 'FAKE AD', hook: 'This product doesn\'t exist', color: '66CCFF' },
  { type: 'shoutout', label: 'SHOUTOUT', hook: 'Listener love', color: '90EE90' },
  { type: 'weather', label: 'AI WEATHER', hook: 'Weather from nowhere', color: '87CEEB' },
];

async function loadClipIndex() {
  try {
    return JSON.parse(await readFile(CLIP_INDEX, 'utf8'));
  } catch {
    return [];
  }
}

async function saveClipIndex(clips) {
  await writeFile(CLIP_INDEX, JSON.stringify(clips, null, 2));
}

// Generate a social media caption via LLM
async function generateCaption(segment) {
  try {
    const res = await ollama.generate({
      prompt: `Write a punchy 10-15 word social media caption for this AI radio clip.
The clip is from radioGAGA, a 24/7 fully AI-generated radio station.
Segment type: ${segment.type}
Title: ${segment.title}
Make it intriguing, funny, or thought-provoking. Use 1-2 relevant emojis.
Include #radioGAGA #AIradio and one relevant hashtag.
Output ONLY the caption:`,
      options: { temperature: 0.95, num_predict: 60 },
    });
    return res.response.trim();
  } catch {
    const clipType = CLIP_TYPES.find(c => c.type === segment.type);
    return `${clipType?.hook || 'AI radio is wild'} 🤖📻 #radioGAGA #AIradio`;
  }
}

// Create a video clip with waveform visualiser from an audio segment
async function createVideoClip(audioPath, outputPath, title, color = 'FFD700') {
  // Generate 9:16 vertical video (1080x1920) with:
  // - Dark background
  // - Audio waveform visualiser in the center
  // - Title text at the top
  // - "radioGAGA" branding at the bottom
  const args = [
    '-i', audioPath,
    '-filter_complex', [
      // Create dark background
      `color=c=0x0A0A14:s=1080x1920:d=${CLIP_DURATION_S}[bg]`,
      // Audio waveform visualiser
      `[0:a]showwaves=s=900x300:mode=cline:rate=30:colors=0x${color}[waves]`,
      // Overlay waveform on background
      `[bg][waves]overlay=(W-w)/2:(H-h)/2[v1]`,
      // Add title text
      `[v1]drawtext=text='${title.replace(/'/g, "\\'")}':fontcolor=0x${color}:fontsize=36:x=(w-text_w)/2:y=200:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[v2]`,
      // Add branding
      `[v2]drawtext=text='radioGAGA':fontcolor=0xFFFFFF40:fontsize=28:x=(w-text_w)/2:y=h-150:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf[v3]`,
      // Add "100% AI Generated" subtitle
      `[v3]drawtext=text='100\\% AI Generated Radio':fontcolor=0xFFFFFF30:fontsize=20:x=(w-text_w)/2:y=h-110:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf[vout]`,
    ].join(';'),
    '-map', '[vout]',
    '-map', '0:a',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k',
    '-t', String(CLIP_DURATION_S),
    '-pix_fmt', 'yuv420p',
    '-y', outputPath,
  ];

  await execFileAsync('ffmpeg', args, { timeout: 120_000 });
}

// Pick the most interesting segments from recent history
function pickClipCandidates(history) {
  // Prefer DJ segments, guests, news — skip music (boring as clips)
  const interesting = history.filter(s =>
    ['dj', 'guest', 'news', 'advert', 'weather', 'shoutout'].includes(s.type)
  );

  // Shuffle and pick top candidates
  return interesting
    .sort(() => Math.random() - 0.5)
    .slice(0, MAX_CLIPS_PER_RUN * 2); // extra candidates in case some fail
}

// Find the audio file for a broadcast history entry
function findAudioFile(segment) {
  // Check tmp/audio for recent files matching the segment
  const audioDir = join(ROOT, 'tmp', 'audio');
  if (!existsSync(audioDir)) return null;

  // We can't directly map broadcast_history to audio files since they're cleaned up.
  // Instead, we'll clip directly from the Icecast stream.
  return null;
}

// Record a clip directly from the live stream
async function recordStreamClip(outputPath, durationS = CLIP_DURATION_S) {
  const streamUrl = 'http://localhost:8000/stream';
  await execFileAsync('ffmpeg', [
    '-i', streamUrl,
    '-t', String(durationS),
    '-c:a', 'libmp3lame', '-ab', '128k',
    '-y', outputPath,
  ], { timeout: (durationS + 10) * 1000 });
}

export async function generateClips() {
  const clips = await loadClipIndex();
  const history = getBroadcastHistory(20);

  if (!history.length) {
    console.log('[clipper] No broadcast history yet');
    return;
  }

  // Get current on-air info for context
  const recent = history[0];
  const clipType = CLIP_TYPES.find(c => c.type === recent.type) || CLIP_TYPES[0];

  let generated = 0;

  for (let i = 0; i < MAX_CLIPS_PER_RUN && i < 2; i++) {
    const timestamp = Date.now();
    const audioPath = join(CLIP_DIR, `clip-${timestamp}.mp3`);
    const videoPath = join(CLIP_DIR, `clip-${timestamp}.mp4`);

    try {
      // Record live from stream
      console.log(`[clipper] Recording ${CLIP_DURATION_S}s from live stream...`);
      await recordStreamClip(audioPath, CLIP_DURATION_S);

      if (!existsSync(audioPath)) continue;

      // Generate video with waveform
      console.log(`[clipper] Generating video clip...`);

      // Check if font exists, use fallback
      const fontExists = existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');

      if (fontExists) {
        await createVideoClip(audioPath, videoPath, clipType.label, clipType.color);
      } else {
        // Simplified video without text (no fonts available)
        await execFileAsync('ffmpeg', [
          '-i', audioPath,
          '-filter_complex',
          `color=c=0x0A0A14:s=1080x1920:d=${CLIP_DURATION_S}[bg];[0:a]showwaves=s=900x300:mode=cline:rate=30:colors=0x${clipType.color}[waves];[bg][waves]overlay=(W-w)/2:(H-h)/2[vout]`,
          '-map', '[vout]', '-map', '0:a',
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-c:a', 'aac', '-b:a', '128k',
          '-t', String(CLIP_DURATION_S),
          '-pix_fmt', 'yuv420p',
          '-y', videoPath,
        ], { timeout: 120_000 });
      }

      // Generate caption
      const caption = await generateCaption(recent);

      const clip = {
        id: timestamp,
        audioPath,
        videoPath: existsSync(videoPath) ? videoPath : null,
        type: recent.type,
        title: recent.title,
        caption,
        createdAt: new Date().toISOString(),
        posted: false,
      };

      clips.push(clip);
      generated++;
      console.log(`[clipper] Clip ready: ${clip.caption}`);

      // Wait before next clip to get different content
      if (i < MAX_CLIPS_PER_RUN - 1) {
        await new Promise(r => setTimeout(r, 60_000)); // 1 min gap
      }
    } catch (err) {
      console.error(`[clipper] Clip generation failed:`, err.message);
    }
  }

  // Rotate old clips
  while (clips.length > MAX_CLIPS_STORED) {
    const old = clips.shift();
    try {
      const { unlink } = await import('node:fs/promises');
      if (old.audioPath) await unlink(old.audioPath).catch(() => {});
      if (old.videoPath) await unlink(old.videoPath).catch(() => {});
    } catch {}
  }

  await saveClipIndex(clips);
  if (generated > 0) console.log(`[clipper] ${generated} clips generated (${clips.length} total stored)`);
}

// API: get recent clips with captions (for social posting)
export function getRecentClips(limit = 10) {
  try {
    const clips = JSON.parse(require('fs').readFileSync(CLIP_INDEX, 'utf8'));
    return clips.slice(-limit).reverse();
  } catch {
    return [];
  }
}

export function startClipper() {
  // First run after 5 minutes (let the station warm up)
  setTimeout(() => generateClips().catch(err => console.error('[clipper] Error:', err.message)), 5 * 60_000);

  // Then every 2 hours
  setInterval(() => generateClips().catch(err => console.error('[clipper] Error:', err.message)), 2 * 60 * 60_000);

  console.log('[clipper] Auto-clipper scheduled (every 2 hours, first run in 5 min)');
}
