// AI Music generator — uses MusicGen (Meta, open-source) via a Python script.
// Music mood comes from the current schedule slot, with optional topic-based refinement.

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, unlink } from 'fs';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const VENV_PYTHON = join(ROOT, 'venv', 'bin', 'python3');
const SCRIPT = join(ROOT, 'scripts', 'generate_music.py');
const AUDIO_DIR = join(ROOT, 'tmp', 'audio');

mkdirSync(AUDIO_DIR, { recursive: true });

export async function generateMusic({ slot, duration = 30 } = {}) {
  // Use the slot's musicMood as the primary prompt.
  // Fall back to a sensible default if no slot provided.
  const prompt = slot?.musicMood || 'lo-fi electronic ambient, warm, late night radio';
  const outPath = join(AUDIO_DIR, `${randomUUID()}.wav`);

  console.log(`[music] Generating ${duration}s: "${prompt}"`);

  return new Promise((resolve, reject) => {
    const proc = spawn(VENV_PYTHON, [
      SCRIPT,
      '--prompt', prompt,
      '--duration', String(duration),
      '--output', outPath,
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => {
      const line = d.toString().trim();
      if (line) console.log(`[musicgen] ${line}`);
      stderr += line;
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`MusicGen exited ${code}: ${stderr}`));
      }
      const wavPath = stdout.trim();

      // Convert WAV → MP3 for Icecast
      const mp3Path = wavPath.replace(/\.wav$/, '.mp3');
      try {
        await execFileAsync('ffmpeg', [
          '-i', wavPath,
          '-codec:a', 'libmp3lame',
          '-qscale:a', '2',
          '-y', mp3Path,
        ]);
        unlink(wavPath, () => {}); // delete WAV, keep MP3
        console.log(`[music] Ready: ${mp3Path}`);
        resolve({
          path: mp3Path,
          type: 'music',
          title: `AI Music — ${prompt.split(',')[0]}`,
          prompt,
          duration,
        });
      } catch (err) {
        reject(new Error(`WAV→MP3 conversion failed: ${err.message}`));
      }
    });

    proc.on('error', reject);
  });
}
