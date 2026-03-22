// TTS engine — converts text to MP3 using edge-tts (free, no API key needed).
// edge-tts uses Microsoft Edge's TTS endpoint under the hood.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const execFileAsync = promisify(execFile);

// Good voices for a radio host feel. Rotate for variety.
// Prefer Multilingual variants where available — they have better prosody.
const VOICES = [
  'en-GB-RyanNeural',                  // British male, warm
  'en-US-AndrewMultilingualNeural',    // warm, confident, authentic
  'en-US-AvaMultilingualNeural',       // expressive, caring, friendly
  'en-US-BrianMultilingualNeural',     // approachable, casual, sincere
];

let voiceIndex = 0;

function nextVoice() {
  const voice = VOICES[voiceIndex % VOICES.length];
  voiceIndex++;
  return voice;
}

const AUDIO_DIR = join(ROOT, 'tmp', 'audio');
mkdirSync(AUDIO_DIR, { recursive: true });

// Prosody presets by energy level (1–5).
// Rate/pitch offsets fed to edge-tts --rate / --pitch flags.
const PROSODY = {
  1: { rate: '-8%',  pitch: '-2Hz' },   // late night, slow and low
  2: { rate: '-3%',  pitch: '+0Hz' },   // gentle, unhurried
  3: { rate: '+0%',  pitch: '+0Hz' },   // neutral
  4: { rate: '+8%',  pitch: '+2Hz' },   // upbeat, energetic
  5: { rate: '+14%', pitch: '+4Hz' },   // peak hype, fast and bright
};

// Add slight per-line variation so consecutive lines don't sound identical.
function jitterProsody(base) {
  const rateNum = parseInt(base.rate) + Math.floor(Math.random() * 7 - 3); // ±3%
  const pitchNum = parseInt(base.pitch) + Math.floor(Math.random() * 3 - 1); // ±1Hz
  return {
    rate: `${rateNum >= 0 ? '+' : ''}${rateNum}%`,
    pitch: `${pitchNum >= 0 ? '+' : ''}${pitchNum}Hz`,
  };
}

// If a specific voice is passed (e.g. from schedule.yaml presenter.voice), use it.
// Otherwise rotate through the default pool.
// opts.energy — show energy level (1–5), controls rate/pitch prosody.
// opts.jitter — if true, add small random variation (good for dialogue lines).
export async function textToMp3(text, voiceOverride = null, opts = {}) {
  // Guard: edge-tts crashes on empty or punctuation-only input
  const speakable = (text || '').replace(/[\s\p{P}\p{S}]/gu, '');
  if (!speakable || speakable.length < 2) {
    throw new Error(`TTS input too short or punctuation-only: "${(text || '').slice(0, 30)}"`);
  }
  const voice = voiceOverride || nextVoice();
  const outPath = join(AUDIO_DIR, `${randomUUID()}.mp3`);

  const energy = opts.energy ?? 3;
  const baseProsody = PROSODY[energy] || PROSODY[3];
  const prosody = opts.jitter ? jitterProsody(baseProsody) : baseProsody;

  await execFileAsync('edge-tts', [
    '--voice', voice,
    `--rate=${prosody.rate}`,
    `--pitch=${prosody.pitch}`,
    '--text', text,
    '--write-media', outPath,
  ], { timeout: 30_000 }); // 30s timeout — edge-tts can hang on Microsoft endpoint

  return { path: outPath, voice };
}

// Concatenate multiple MP3s into one using ffmpeg concat demuxer.
// Cleans up the source files after joining.
export async function concatAudioFiles(paths, keepSources = false) {
  const outPath = join(AUDIO_DIR, `${randomUUID()}.mp3`);
  const listPath = outPath + '.txt';

  writeFileSync(listPath, paths.map(p => `file '${p}'`).join('\n'));

  await execFileAsync('ffmpeg', [
    '-f', 'concat', '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-y', outPath,
  ], { timeout: 60_000 });

  unlinkSync(listPath);
  if (!keepSources) {
    for (const p of paths) await unlink(p).catch(() => {});
  }

  return outPath;
}
