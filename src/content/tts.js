// TTS engine — converts text to MP3 using edge-tts (free, no API key needed).
// edge-tts uses Microsoft Edge's TTS endpoint under the hood.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);

// Good voices for a radio host feel. Rotate for variety.
const VOICES = [
  'en-GB-RyanNeural',       // British male, warm
  'en-IE-ConnorNeural',     // Irish male, lyrical
  'en-AU-WilliamNeural',    // Australian male, relaxed
  'en-GB-SoniaNeural',      // British female, clear
];

let voiceIndex = 0;

function nextVoice() {
  const voice = VOICES[voiceIndex % VOICES.length];
  voiceIndex++;
  return voice;
}

const AUDIO_DIR = join(process.cwd(), 'tmp', 'audio');
mkdirSync(AUDIO_DIR, { recursive: true });

// If a specific voice is passed (e.g. from schedule.yaml presenter.voice), use it.
// Otherwise rotate through the default pool.
export async function textToMp3(text, voiceOverride = null) {
  const voice = voiceOverride || nextVoice();
  const outPath = join(AUDIO_DIR, `${randomUUID()}.mp3`);

  console.log(`[tts] Generating audio with ${voice}...`);

  await execFileAsync('edge-tts', [
    '--voice', voice,
    '--text', text,
    '--write-media', outPath,
  ]);

  console.log(`[tts] Audio ready: ${outPath}`);
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
  ]);

  unlinkSync(listPath);
  if (!keepSources) {
    for (const p of paths) await unlink(p).catch(() => {});
  }

  return outPath;
}
