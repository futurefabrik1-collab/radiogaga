// Guest segment generator — creates a fictional expert interview.
// Generates a guest name, bio, and 3–4 exchange Q&A with the host.
// Guest voice is randomly selected to differ from the host.

import { ollama } from './ollama.js';
import { renderDialogue } from './dialogue.js';

// Voices that can be used for guests (excluding typical host voices)
const GUEST_VOICES = [
  'en-US-GuyNeural',
  'en-US-AriaNeural',
  'en-AU-NatashaNeural',
  'en-GB-LibbyNeural',
  'en-US-DavisNeural',
  'en-NZ-MitchellNeural',
  'en-CA-LiamNeural',
];

function pickGuestVoice(hostVoice, coHostVoice) {
  const available = GUEST_VOICES.filter(v => v !== hostVoice && v !== coHostVoice);
  return available[Math.floor(Math.random() * available.length)];
}

// Expertise areas keyed by content focus
const EXPERTISE_BY_FOCUS = {
  arts:        ['conceptual artist', 'art critic', 'gallery curator', 'muralist', 'textile designer'],
  music:       ['session musician', 'music historian', 'sound designer', 'DJ', 'instrument maker'],
  culture:     ['cultural anthropologist', 'trend forecaster', 'satirist', 'cultural critic'],
  science:     ['theoretical physicist', 'mycologist', 'sleep researcher', 'marine biologist'],
  technology:  ['systems theorist', 'digital archaeologist', 'open-source advocate', 'hardware hacker'],
  philosophy:  ['ethicist', 'philosopher of mind', 'logician', 'existentialist lecturer'],
  film:        ['documentary filmmaker', 'film archivist', 'cinematographer', 'cult film critic'],
  books:       ['experimental novelist', 'literary translator', 'book editor', 'poet'],
  design:      ['industrial designer', 'typographer', 'urban planner', 'package designer'],
  world:       ['foreign correspondent', 'conflict mediator', 'geopolitical analyst'],
};

function pickExpertise(contentFocus) {
  const pool = contentFocus.flatMap(f => EXPERTISE_BY_FOCUS[f] || []);
  const source = pool.length ? pool : ['independent researcher'];
  return source[Math.floor(Math.random() * source.length)];
}

export async function generateGuestSegment(slot) {
  const expertise = pickExpertise(slot.contentFocus);
  const guestVoice = pickGuestVoice(slot.voice, slot.coHost?.voice);
  const hostName = slot.presenterName;
  const coHostName = slot.coHost?.name;

  // Step 1: generate guest identity
  const identityPrompt = `Invent a fictional radio guest. They are a ${expertise}.
Give them: a full name (unusual but believable), a one-sentence bio, and the specific
unusual thing they are known for or currently working on.
Format as:
NAME: [name]
BIO: [one sentence]
HOOK: [the interesting specific thing]
Nothing else.`;

  const identityResponse = await ollama.generate({
    model: 'llama3.2',
    prompt: identityPrompt,
    options: { temperature: 1.0, num_predict: 100 },
    stream: false,
  });

  const identity = identityResponse.response.trim();
  const nameMatch = identity.match(/NAME:\s*(.+)/i);
  const bioMatch = identity.match(/BIO:\s*(.+)/i);
  const hookMatch = identity.match(/HOOK:\s*(.+)/i);

  const guestName = nameMatch?.[1]?.trim() || 'the guest';
  const guestBio = bioMatch?.[1]?.trim() || `${expertise}`;
  const guestHook = hookMatch?.[1]?.trim() || 'their unusual area of work';

  console.log(`[guest] Generating interview with ${guestName} (${expertise})`);

  // Step 2: generate the interview dialogue
  const interviewerLine = coHostName
    ? `${hostName} and ${coHostName} are interviewing`
    : `${hostName} is interviewing`;

  const dialoguePrompt = `You are writing a radio interview segment for radioGAGA.
${interviewerLine} ${guestName}, a ${guestBio}.
The interesting thing about ${guestName}: ${guestHook}

Use real names of people, companies, and places accurately. Do not rename or anonymise proper nouns.

Write a natural radio interview — 3 to 4 exchanges (question + answer).
${coHostName ? `Both ${hostName} and ${coHostName} can ask questions. Mix it up.` : ''}
The interview should build — start with an intro question, get more specific, end on something surprising or memorable.

CRITICAL FORMAT — every single line must be:
[NAME]: what they say

Speakers: ${hostName}${coHostName ? ', ' + coHostName : ''}, ${guestName}
Total length: 180–220 words.
Do NOT include stage directions, descriptions, or anything outside the [NAME]: format.

Write the interview now:`;

  const dialogueResponse = await ollama.generate({
    model: 'llama3.2',
    prompt: dialoguePrompt,
    options: { temperature: 0.88, num_predict: 400 },
    stream: false,
  });

  const script = dialogueResponse.response.trim();

  // Build speaker map
  const speakers = { [hostName]: slot.voice };
  if (coHostName) speakers[coHostName] = slot.coHost.voice;
  speakers[guestName] = guestVoice;

  const path = await renderDialogue(script, speakers, slot.voice);

  return {
    path,
    type: 'dj',
    title: `Guest: ${guestName} — ${expertise}`,
    slot: slot.id,
    guestName,
    expertise,
  };
}
