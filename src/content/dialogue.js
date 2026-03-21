// Dialogue renderer — takes a multi-speaker script and produces a single MP3.
// Script format:  [SPEAKER NAME]: spoken text here
// Each line is TTS'd with the matching voice, then mixed with overlapping
// speaker transitions for natural conversational flow.
// Optionally layers a low-volume music bed + foley to mimic a real studio.

import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { textToMp3, concatAudioFiles } from './tts.js';
import { mixStudioBed } from './studioFx.js';

const execFileAsync = promisify(execFile);
const TMP = () => join(process.cwd(), 'tmp', 'audio');

// Parse dialogue lines. Accepts both [NAME]: and NAME: formats.
function parseDialogue(script, knownSpeakers = []) {
  const lines = [];
  const barePattern = knownSpeakers.length
    ? new RegExp(`^(${knownSpeakers.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):\\s*(.+)`, 'i')
    : null;

  for (const raw of script.split('\n')) {
    const trimmed = raw.trim();
    let match = trimmed.match(/^\[([^\]]+)\]:\s*(.+)/);
    if (!match && barePattern) match = trimmed.match(barePattern);
    if (match) {
      lines.push({ speaker: match[1].trim(), text: match[2].trim() });
    }
  }
  return lines;
}

function stripSpeakerPrefix(line, knownSpeakers) {
  let l = line.trim();
  l = l.replace(/^\[[^\]]+\]:\s*/, '');
  for (const name of knownSpeakers) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    l = l.replace(new RegExp(`^${escaped}:\\s*`, 'i'), '');
  }
  return l;
}

// Get duration of an audio file in seconds
async function getDuration(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', filePath,
    ]);
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

// Mix two audio clips with overlap: clipB starts overlapS before clipA ends.
// Creates natural "jumping in" conversational feel.
async function overlapMix(clipA, clipB, overlapS) {
  const outPath = join(TMP(), `overlap-${randomUUID().slice(0, 8)}.mp3`);
  const durA = await getDuration(clipA);

  if (durA <= 0 || overlapS <= 0 || overlapS >= durA) {
    // Can't overlap — just concat
    return concatAudioFiles([clipA, clipB], true);
  }

  // clipB starts at (durA - overlapS) seconds
  // Fade down clipA in the overlap zone, fade up clipB
  const startB = Math.max(0, durA - overlapS);

  try {
    await execFileAsync('ffmpeg', [
      '-i', clipA,
      '-i', clipB,
      '-filter_complex', [
        // Fade out the tail of clip A during overlap
        `[0:a]afade=t=out:st=${startB}:d=${overlapS}[a]`,
        // Delay clip B to start at the overlap point, with quick fade-in
        `[1:a]adelay=${Math.round(startB * 1000)}|${Math.round(startB * 1000)},afade=t=in:d=0.08[b]`,
        // Mix both together
        `[a][b]amix=inputs=2:duration=longest:dropout_transition=0.5`,
      ].join(';'),
      '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
      '-y', outPath,
    ], { timeout: 30_000 });
    return outPath;
  } catch (err) {
    console.warn('[dialogue] Overlap mix failed, concatenating:', err.message);
    return concatAudioFiles([clipA, clipB], true);
  }
}

// Render a dialogue script to a single MP3 with natural overlapping transitions.
export async function renderDialogue(script, speakers, fallbackVoice, opts = {}) {
  const knownSpeakers = Object.keys(speakers);
  const lines = parseDialogue(script, knownSpeakers);
  const energy = opts.energy ?? 3;

  let speechPath;

  if (!lines.length) {
    const cleaned = script
      .split('\n')
      .map(l => stripSpeakerPrefix(l, knownSpeakers))
      .filter(Boolean)
      .join(' ');
    speechPath = (await textToMp3(cleaned || script, fallbackVoice, { energy })).path;
  } else {
    // Generate all TTS clips first
    const clips = [];
    for (const { speaker, text } of lines) {
      const voiceKey = Object.keys(speakers).find(
        k => k.toLowerCase() === speaker.toLowerCase()
      );
      const voice = voiceKey ? speakers[voiceKey] : fallbackVoice;
      const { path } = await textToMp3(text, voice, { energy, jitter: true });
      clips.push({ path, speaker });
    }

    if (clips.length === 1) {
      speechPath = clips[0].path;
    } else {
      // Get durations of all clips
      const durations = [];
      for (const c of clips) durations.push(await getDuration(c.path));

      // Build a single ffmpeg command that places all clips on a timeline
      // with controlled delays — overlapping on speaker changes, tiny gaps on same speaker
      const outPath = join(TMP(), `dialogue-${randomUUID().slice(0, 8)}.mp3`);
      let timeline = 0; // current position in seconds
      const inputs = [];
      const delays = [];

      for (let i = 0; i < clips.length; i++) {
        inputs.push('-i', clips[i].path);
        const delayMs = Math.round(timeline * 1000);
        delays.push(`[${i}:a]adelay=${delayMs}|${delayMs}[a${i}]`);

        if (i < clips.length - 1) {
          const nextSameSpeaker = clips[i].speaker.toLowerCase() === clips[i + 1].speaker.toLowerCase();
          if (nextSameSpeaker) {
            // Same speaker: advance by full duration + tiny breath (0.05-0.12s)
            timeline += durations[i] + 0.05 + Math.random() * 0.07;
          } else {
            // Speaker change: overlap by 0.1-0.3s (more at higher energy)
            const overlap = 0.1 + Math.random() * 0.1 + Math.min(energy * 0.03, 0.1);
            timeline += Math.max(durations[i] - overlap, durations[i] * 0.85);
          }
        }
      }

      try {
        const mixInputs = delays.join(';') + ';' +
          delays.map((_, i) => `[a${i}]`).join('') +
          `amix=inputs=${clips.length}:duration=longest:dropout_transition=0.3`;

        await execFileAsync('ffmpeg', [
          ...inputs,
          '-filter_complex', mixInputs,
          '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
          '-y', outPath,
        ], { timeout: 60_000 });

        speechPath = outPath;
      } catch (err) {
        console.warn('[dialogue] Timeline mix failed, using simple concat:', err.message);
        speechPath = await concatAudioFiles(clips.map(c => c.path), true);
      }
    }
  }

  // Layer studio atmosphere if requested
  if (opts.studioBed) {
    const wordCount = script.split(/\s+/).length;
    const durationS = Math.round(wordCount / 2.5);
    speechPath = await mixStudioBed(speechPath, {
      durationS,
      energy: opts.energy ?? 3,
    });
  }

  return speechPath;
}
