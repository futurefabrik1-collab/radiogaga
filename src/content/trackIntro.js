// Track intro/outro generator — short spoken segments wrapping each music track.
// Intro: seamless handover into the track, naming it if we have real title/creator.
// Outro: back-announce — names the track, reacts briefly, bridges into what's next.
// NOTE: Track/artist names are used as-is (anonymity rule does NOT apply to music credits).

import { ollama } from './ollama.js';
import { renderDialogue } from './dialogue.js';

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

// track = { title, creator, mood }
export async function generateTrackIntro(slot, track) {
  const isDialogue = !!slot.coHost;
  const speakers = formatSpeakers(slot);
  const { title, creator, mood } = track;

  // Archive tracks have real titles; AI-generated tracks start with "AI Music"
  const hasTrackInfo = title && creator && !title.startsWith('AI Music');
  const trackLine = hasTrackInfo
    ? `The track coming up is "${title}" by ${creator}.`
    : `The next track is AI-generated. Mood/style: "${mood}".`;

  const prompt = isDialogue
    ? `You are writing a short radio handover for two co-hosts: ${speakers}.
${trackLine}
Write 2–3 lines of IMPROVISED dialogue. This is NOT an announcement — it's two friends riffing.
DON'T just name the track and artist. Instead:
- Share a personal reaction, a half-memory, a tangent the track triggers
- One host says something unexpected, the other riffs on it
- Maybe disagree about the track, or connect it to something random from earlier
- Use the track/artist name ONCE, casually buried mid-sentence — never as the opening word
${hasTrackInfo ? `Mention "${title}" and ${creator} like afterthoughts, not headlines.` : `Hype the energy without being generic — be SPECIFIC about the sound.`}
BANNED PHRASES: "here's", "coming up next", "without further ado", "let's get into", "this one's a"
Format EVERY line as: [NAME]: what they say
Keep it to 35–50 words total. Messy, alive, mid-conversation energy.
Do NOT use stage directions. Write the dialogue now:`

    : `You are ${slot.presenterName}, a radio presenter on radioGAGA.
${trackLine}
Write a 25–40 word IMPROVISED handover. You are NOT reading a fact sheet — you are FEELING something.
DON'T lead with the track name. Instead:
- Start with a personal reaction, a tangent, a half-thought that trails into the track
- Share why this track matters to YOU right now — a memory, a feeling, a moment it reminds you of
- ${hasTrackInfo ? `Mention "${title}" by ${creator} like you're mid-conversation, buried in real talk.` : `Be specific about the SOUND — what instruments, what feeling, what time of day it belongs to.`}
BANNED PHRASES: "here's", "coming up next", "without further ado", "let's get into", "this one's a"
Style: ${slot.djStyle.split('\n')[0]}
Output only the spoken words:`;

  const response = await ollama.generate({
    model: 'llama3.2',
    prompt,
    options: { temperature: 0.9, num_predict: 120 },
    stream: false,
  });

  const script = response.response.trim();
  const path = await renderDialogue(script, speakerMap(slot), slot.voice, {
    studioBed: slot.studioBed ?? true,
    energy: slot.energy,
  });
  return {
    path, type: 'dj', script,
    title: hasTrackInfo ? `Into — ${title}` : `Track intro — ${mood.split(',')[0]}`,
    slot: slot.id,
  };
}

// track = { title, creator, mood }
export async function generateTrackOutro(slot, track) {
  const isDialogue = !!slot.coHost;
  const speakers = formatSpeakers(slot);
  const { title, creator, mood } = track;

  const hasTrackInfo = title && creator && !title.startsWith('AI Music');
  const trackLine = hasTrackInfo
    ? `The track that just played was "${title}" by ${creator}.`
    : `The AI-generated track that just played had a "${mood}" mood.`;

  const prompt = isDialogue
    ? `You are writing a short back-announce for two co-hosts: ${speakers}.
${trackLine}
Write 2–3 lines of IMPROVISED dialogue. React genuinely to what you just heard — did it hit you? Remind you of something? Make you want to dance?
${hasTrackInfo ? `Drop the REAL track title and artist name mid-flow, not as a formal read-out.` : `React to how the track made you feel.`}
Sound like two people who just experienced something together, not reading a script.
Format EVERY line as: [NAME]: what they say
Keep it to 30–45 words total. Alive and unrehearsed.
Do NOT use stage directions. Write the dialogue now:`

    : `You are ${slot.presenterName}, a radio presenter on radioGAGA.
${trackLine}
Write a 20–35 word IMPROVISED back-announce. React honestly — what did that track just do to you?
${hasTrackInfo ? `Name the REAL track and artist like you're telling someone about a discovery, not reading credits.` : `React to the feeling the track left behind.`}
Bridge into what's next with natural energy, not a formula.
Style: ${slot.djStyle.split('\n')[0]}
Output only the spoken words:`;

  const response = await ollama.generate({
    model: 'llama3.2',
    prompt,
    options: { temperature: 0.9, num_predict: 100 },
    stream: false,
  });

  const script = response.response.trim();
  const path = await renderDialogue(script, speakerMap(slot), slot.voice, {
    studioBed: slot.studioBed ?? true,
    energy: slot.energy,
  });
  return {
    path, type: 'dj', script,
    title: hasTrackInfo ? `Back-announce — ${title}` : `Track outro — ${mood.split(',')[0]}`,
    slot: slot.id,
  };
}
