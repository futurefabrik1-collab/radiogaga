// Track intro/outro generator — short spoken segments wrapping each AI music track.
// Intro: teases the upcoming AI-generated track ("here's what we asked the machine for...")
// Outro: reacts to the track that just played ("that was something, wasn't it...")

import { Ollama } from 'ollama';
import { renderDialogue } from './dialogue.js';

const ollama = new Ollama({ host: 'http://localhost:11434' });

function speakerMap(slot) {
  const map = { [slot.presenterName]: slot.voice };
  if (slot.coHost) map[slot.coHost.name] = slot.coHost.voice;
  return map;
}

function formatSpeakers(slot) {
  if (slot.coHost) {
    return `${slot.presenterName} (the main host) and ${slot.coHost.name} (co-host)`;
  }
  return slot.presenterName;
}

export async function generateTrackIntro(slot) {
  const isDialogue = !!slot.coHost;
  const speakers = formatSpeakers(slot);
  const mood = slot.musicMood;

  const prompt = isDialogue
    ? `You are writing a short radio intro for two co-hosts: ${speakers}.
The next track is AI-generated music. The mood/style: "${mood}".
Write 2–4 lines of dialogue — one host teases the track, the other reacts briefly.
Format EVERY line as: [NAME]: what they say
Keep it to 40–55 words total. Natural, enthusiastic, specific about the vibe.
Do NOT announce song titles. Do NOT use stage directions.
Write the dialogue now:`

    : `You are ${slot.presenterName}, a radio presenter on radioGAGA.
You are about to play an AI-generated music track. Mood/style: "${mood}".
Write a short 30–45 word spoken intro in your character's voice.
Reference the vibe or feeling of the track. Tease it. Be specific.
Style: ${slot.djStyle.split('\n')[0]}
Output only the spoken words:`;

  const response = await ollama.generate({
    model: 'llama3.2',
    prompt,
    options: { temperature: 0.9, num_predict: 120 },
    stream: false,
  });

  const script = response.response.trim();
  const path = await renderDialogue(script, speakerMap(slot), slot.voice);
  return { path, type: 'dj', title: `Track intro — ${mood.split(',')[0]}`, slot: slot.id };
}

export async function generateTrackOutro(slot, mood) {
  const isDialogue = !!slot.coHost;
  const speakers = formatSpeakers(slot);

  const prompt = isDialogue
    ? `You are writing a short radio outro for two co-hosts: ${speakers}.
A piece of AI-generated music just finished. The mood was: "${mood}".
Write 2–3 lines of dialogue — one host reacts to the track, the other adds something brief.
Format EVERY line as: [NAME]: what they say
Keep it to 30–45 words total. Genuine reaction. Specific about what they just heard.
Do NOT use stage directions. Write the dialogue now:`

    : `You are ${slot.presenterName}, a radio presenter on radioGAGA.
A piece of AI-generated music just finished playing. The mood was: "${mood}".
Write a 20–35 word spoken reaction in your character's voice.
React to the feel of the track. Move naturally into what's coming next.
Style: ${slot.djStyle.split('\n')[0]}
Output only the spoken words:`;

  const response = await ollama.generate({
    model: 'llama3.2',
    prompt,
    options: { temperature: 0.9, num_predict: 90 },
    stream: false,
  });

  const script = response.response.trim();
  const path = await renderDialogue(script, speakerMap(slot), slot.voice);
  return { path, type: 'dj', title: `Track outro — ${mood.split(',')[0]}`, slot: slot.id };
}
