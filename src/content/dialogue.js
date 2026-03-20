// Dialogue renderer — takes a multi-speaker script and produces a single MP3.
// Script format:  [SPEAKER NAME]: spoken text here
// Each line is TTS'd with the matching voice, then all clips are concatenated.
// Optionally layers a low-volume music bed + foley to mimic a real studio.

import { textToMp3, concatAudioFiles } from './tts.js';
import { mixStudioBed } from './studioFx.js';

// Parse dialogue lines. Accepts both [NAME]: and NAME: formats.
// knownSpeakers limits bare-name matching to prevent false positives.
function parseDialogue(script, knownSpeakers = []) {
  const lines = [];
  // Build a pattern for bare NAME: matching (only for known speakers)
  const barePattern = knownSpeakers.length
    ? new RegExp(`^(${knownSpeakers.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}):\\s*(.+)`, 'i')
    : null;

  for (const raw of script.split('\n')) {
    const trimmed = raw.trim();
    // Preferred: [NAME]: text
    let match = trimmed.match(/^\[([^\]]+)\]:\s*(.+)/);
    // Fallback: NAME: text (only for known speakers to avoid false positives)
    if (!match && barePattern) match = trimmed.match(barePattern);
    if (match) {
      lines.push({ speaker: match[1].trim(), text: match[2].trim() });
    }
  }
  return lines;
}

// Strip speaker label prefixes from a line (for monologue fallback cleanup).
function stripSpeakerPrefix(line, knownSpeakers) {
  let l = line.trim();
  // Remove [NAME]: prefix
  l = l.replace(/^\[[^\]]+\]:\s*/, '');
  // Remove NAME: prefix for known speakers
  for (const name of knownSpeakers) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    l = l.replace(new RegExp(`^${escaped}:\\s*`, 'i'), '');
  }
  return l;
}

// Generate a short silence clip for inter-line pauses.
async function generatePause(durationS = 0.4) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const { randomUUID } = await import('crypto');
  const exec = promisify(execFile);
  const pausePath = join(
    (await import('path')).dirname((await import('url')).fileURLToPath(import.meta.url)),
    '..', '..', 'tmp', 'audio', `pause-${randomUUID().slice(0, 8)}.mp3`
  );
  await exec('ffmpeg', [
    '-f', 'lavfi', '-i', `aevalsrc=0:d=${durationS}`,
    '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
    '-y', pausePath,
  ]);
  return pausePath;
}

// Render a dialogue script to a single MP3.
// speakers: { [name]: voice } — map of speaker name → edge-tts voice
// Falls back to presenterVoice for any unrecognised name.
// opts.studioBed — if true, layer background music + foley under speech.
// opts.energy    — show energy level (affects foley density and prosody).
export async function renderDialogue(script, speakers, fallbackVoice, opts = {}) {
  const knownSpeakers = Object.keys(speakers);
  const lines = parseDialogue(script, knownSpeakers);
  const energy = opts.energy ?? 3;

  let speechPath;

  if (!lines.length) {
    // No dialogue found — strip any speaker labels before monologue TTS
    const cleaned = script
      .split('\n')
      .map(l => stripSpeakerPrefix(l, knownSpeakers))
      .filter(Boolean)
      .join(' ');
    speechPath = (await textToMp3(cleaned || script, fallbackVoice, { energy })).path;
  } else {
    const audioPaths = [];
    let lastSpeaker = null;
    for (const { speaker, text } of lines) {
      // Case-insensitive speaker lookup
      const voiceKey = Object.keys(speakers).find(
        k => k.toLowerCase() === speaker.toLowerCase()
      );
      const voice = voiceKey ? speakers[voiceKey] : fallbackVoice;

      // Insert a micro-pause between lines for natural turn-taking.
      // Shorter pause for same speaker continuing, longer for speaker change.
      if (lastSpeaker !== null) {
        const pauseS = lastSpeaker === speaker
          ? 0.15 + Math.random() * 0.15   // same speaker: 0.15–0.3s breath
          : 0.25 + Math.random() * 0.35;  // speaker change: 0.25–0.6s gap
        audioPaths.push(await generatePause(pauseS));
      }

      const { path } = await textToMp3(text, voice, { energy, jitter: true });
      audioPaths.push(path);
      lastSpeaker = speaker;
    }
    speechPath = audioPaths.length === 1 ? audioPaths[0] : await concatAudioFiles(audioPaths);
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
