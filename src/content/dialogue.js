// Dialogue renderer — takes a multi-speaker script and produces a single MP3.
// Script format:  [SPEAKER NAME]: spoken text here
// Each line is TTS'd with the matching voice, then all clips are concatenated.

import { textToMp3, concatAudioFiles } from './tts.js';

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

// Render a dialogue script to a single MP3.
// speakers: { [name]: voice } — map of speaker name → edge-tts voice
// Falls back to presenterVoice for any unrecognised name.
export async function renderDialogue(script, speakers, fallbackVoice) {
  const knownSpeakers = Object.keys(speakers);
  const lines = parseDialogue(script, knownSpeakers);

  if (!lines.length) {
    // No dialogue found — strip any speaker labels before monologue TTS
    const cleaned = script
      .split('\n')
      .map(l => stripSpeakerPrefix(l, knownSpeakers))
      .filter(Boolean)
      .join(' ');
    const { path } = await textToMp3(cleaned || script, fallbackVoice);
    return path;
  }

  const audioPaths = [];
  for (const { speaker, text } of lines) {
    // Case-insensitive speaker lookup
    const voiceKey = Object.keys(speakers).find(
      k => k.toLowerCase() === speaker.toLowerCase()
    );
    const voice = voiceKey ? speakers[voiceKey] : fallbackVoice;
    const { path } = await textToMp3(text, voice);
    audioPaths.push(path);
  }

  if (audioPaths.length === 1) return audioPaths[0];
  return concatAudioFiles(audioPaths);
}
