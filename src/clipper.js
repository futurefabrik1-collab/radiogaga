// Auto-clipper — records from live Icecast stream, generates video clips
// with waveform visualiser for social media. Runs every 2 hours.

import { join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBroadcastHistory } from './db.js';
import { ollama } from './content/ollama.js';

const execFileAsync = promisify(execFile);
const CLIP_DIR = join(process.cwd(), 'data', 'clips');
const CLIP_INDEX = join(CLIP_DIR, 'clips.json');
const CLIP_DURATION_S = 45;
const MAX_CLIPS_STORED = 50;

mkdirSync(CLIP_DIR, { recursive: true });

function loadIndex() {
  try { return JSON.parse(readFileSync(CLIP_INDEX, 'utf8')); } catch { return []; }
}

function saveIndex(clips) {
  writeFileSync(CLIP_INDEX, JSON.stringify(clips, null, 2));
}

async function generateCaption(segment) {
  try {
    const res = await ollama.generate({
      prompt: `Write a punchy 10-15 word social media caption for an AI radio clip.
Segment: ${segment.type} — "${segment.title || 'live on radioGAGA'}"
Use 1-2 emojis. Include #radioGAGA #AIradio. Output ONLY the caption:`,
      options: { temperature: 0.95, num_predict: 50 },
    });
    return res.response.trim();
  } catch {
    return '🤖📻 AI radio doing its thing #radioGAGA #AIradio';
  }
}

export async function generateClips() {
  const history = getBroadcastHistory(10);
  if (!history.length) return;

  const clips = loadIndex();
  const timestamp = Date.now();
  const audioPath = join(CLIP_DIR, `clip-${timestamp}.mp3`);
  const videoPath = join(CLIP_DIR, `clip-${timestamp}.mp4`);
  const recent = history[0] || { type: 'dj', title: 'radioGAGA' };

  try {
    // Record from live stream
    console.log(`[clipper] Recording ${CLIP_DURATION_S}s from live stream...`);
    await execFileAsync('ffmpeg', [
      '-i', 'http://localhost:8000/stream',
      '-t', String(CLIP_DURATION_S),
      '-c:a', 'libmp3lame', '-ab', '128k',
      '-y', audioPath,
    ], { timeout: (CLIP_DURATION_S + 15) * 1000 });

    if (!existsSync(audioPath)) throw new Error('Audio recording failed');

    // Generate vertical video with waveform
    console.log('[clipper] Generating video...');
    const hasFont = existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf');
    const filter = hasFont
      ? `color=c=0x0A0A14:s=1080x1920:d=${CLIP_DURATION_S}[bg];[0:a]showwaves=s=900x300:mode=cline:rate=30:colors=0xFFD700[w];[bg][w]overlay=(W-w)/2:(H-h)/2[v1];[v1]drawtext=text='radioGAGA':fontcolor=0xFFD70080:fontsize=36:x=(w-text_w)/2:y=h-150:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf[v2];[v2]drawtext=text='100\\% AI Radio':fontcolor=0xFFFFFF40:fontsize=22:x=(w-text_w)/2:y=h-110:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf[vout]`
      : `color=c=0x0A0A14:s=1080x1920:d=${CLIP_DURATION_S}[bg];[0:a]showwaves=s=900x300:mode=cline:rate=30:colors=0xFFD700[w];[bg][w]overlay=(W-w)/2:(H-h)/2[vout]`;

    await execFileAsync('ffmpeg', [
      '-i', audioPath,
      '-filter_complex', filter,
      '-map', '[vout]', '-map', '0:a',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-t', String(CLIP_DURATION_S),
      '-pix_fmt', 'yuv420p',
      '-y', videoPath,
    ], { timeout: 120_000 });

    const caption = await generateCaption(recent);

    clips.push({
      id: timestamp,
      audioPath, videoPath,
      type: recent.type,
      title: recent.title || 'radioGAGA',
      caption,
      createdAt: new Date().toISOString(),
      posted: false,
    });

    // Rotate old clips
    while (clips.length > MAX_CLIPS_STORED) clips.shift();

    saveIndex(clips);
    console.log(`[clipper] Clip ready: ${caption}`);
  } catch (err) {
    console.error(`[clipper] Failed: ${err.message}`);
  }
}

export function startClipper() {
  // First run after 5 min, then every 2 hours
  setTimeout(() => generateClips().catch(e => console.error('[clipper]', e.message)), 5 * 60_000);
  setInterval(() => generateClips().catch(e => console.error('[clipper]', e.message)), 2 * 60 * 60_000);
  console.log('[clipper] Auto-clipper scheduled (every 2h, first in 5min)');
}
