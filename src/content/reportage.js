// Reportage generator — long-form 10-20 minute segments.
// Formats: interview, panel discussion, field report, deep dive, debate.
// Generated in chapters (3-5 chunks), each rendered as multi-voice dialogue
// with studio bed and foley. One per show hour.

import { ollama } from './ollama.js';
import { textToMp3, concatAudioFiles } from './tts.js';
import { renderDialogue } from './dialogue.js';
import { mixStudioBed } from './studioFx.js';
import { rollLanguage, languagePromptBlock } from './languages.js';

// Guest voice pool — distinct from presenters
const GUEST_VOICES = [
  'en-US-GuyNeural', 'en-US-AriaNeural', 'en-AU-NatashaNeural',
  'en-GB-LibbyNeural', 'en-US-DavisNeural', 'en-NZ-MitchellNeural',
  'en-CA-LiamNeural', 'en-US-AndrewMultilingualNeural',
];

function pickVoices(exclude = [], count = 3) {
  const available = GUEST_VOICES.filter(v => !exclude.includes(v));
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const FORMATS = [
  {
    type: 'interview',
    label: 'In-Depth Interview',
    setup: (topic, host, guest) => `${host} conducts an in-depth interview with ${guest.name}, a ${guest.bio}. The topic: ${topic}.`,
    speakers: (host, coHost, guest) => {
      const s = { [host]: null, [guest.name]: null };
      if (coHost) s[coHost] = null;
      return s;
    },
  },
  {
    type: 'panel',
    label: 'Panel Discussion',
    setup: (topic, host, guests) => `${host} moderates a panel discussion on "${topic}" with ${guests.map(g => `${g.name} (${g.bio})`).join(', ')}.`,
    speakers: (host, coHost, ...guests) => {
      const s = { [host]: null };
      if (coHost) s[coHost] = null;
      guests.flat().forEach(g => { s[g.name] = null; });
      return s;
    },
  },
  {
    type: 'report',
    label: 'Field Report',
    setup: (topic, host) => `${host} delivers a detailed field report on "${topic}", interviewing witnesses and experts along the way.`,
    speakers: (host, coHost) => {
      const s = { [host]: null };
      if (coHost) s[coHost] = null;
      return s;
    },
  },
  {
    type: 'debate',
    label: 'The Debate',
    setup: (topic, host, guests) => `${host} referees a structured debate on "${topic}" between ${guests[0].name} (FOR) and ${guests[1].name} (AGAINST).`,
    speakers: (host, coHost, ...guests) => {
      const s = { [host]: null };
      if (coHost) s[coHost] = null;
      guests.flat().forEach(g => { s[g.name] = null; });
      return s;
    },
  },
];

// Generate a fictional expert identity
async function generateExpert(focusArea) {
  const res = await ollama.generate({
    prompt: `Invent a fictional expert for a radio segment about ${focusArea}.
Give them: a full name, a one-sentence bio, and their hot take on the topic.
Format: NAME: [name] | BIO: [bio] | TAKE: [their position]
Nothing else.`,
    options: { temperature: 1.0, num_predict: 80 },
  });
  const text = res.response.trim();
  const name = text.match(/NAME:\s*([^|]+)/i)?.[1]?.trim() || 'Dr. Alex Rivera';
  const bio = text.match(/BIO:\s*([^|]+)/i)?.[1]?.trim() || `${focusArea} specialist`;
  const take = text.match(/TAKE:\s*(.+)/i)?.[1]?.trim() || 'It depends on how you look at it.';
  return { name, bio, take };
}

// Generate one chapter of dialogue (~400-600 words, ~3 min)
async function generateChapter(chapterNum, totalChapters, format, topic, speakerNames, context, langBlock = '') {
  const phaseGuide = chapterNum === 1
    ? 'OPENING: Introduce the topic, set the scene, first impressions. Build curiosity.'
    : chapterNum === totalChapters
    ? 'CLOSING: Bring it together. Final thoughts, surprising conclusion, call-back to the opening.'
    : `MIDDLE (${chapterNum}/${totalChapters}): Go deeper. Challenge assumptions. Share specifics. Disagree productively.`;

  const prompt = `You are writing Chapter ${chapterNum} of ${totalChapters} of a radio ${format.type} for radioGAGA.
${langBlock}
TOPIC: ${topic}
SETUP: ${context}
${phaseGuide}

SPEAKERS: ${speakerNames.join(', ')}

RULES:
- 400-600 words of dialogue (approximately 3 minutes when spoken)
- Every line MUST be: [SPEAKER NAME]: what they say
- Natural radio conversation — interruptions, reactions, laughter, disagreement
- Use "..." for trailing off, "—" for interruptions, ALL CAPS for emphasis
- Include reactions: "Ha!", "Wait, what?", "No no no—", "Exactly!"
- Reference what was said before. Build on each other's points.
- Be specific — name real people, real research, real examples
- No stage directions. Just dialogue.
- This must flow naturally from ${chapterNum === 1 ? 'nothing (this is the opening)' : 'the previous chapter'}.

Write Chapter ${chapterNum} now:`;

  const res = await ollama.generate({
    prompt,
    options: { temperature: 0.9, num_predict: 900 },
  });

  return res.response.trim();
}

// Pick a topic from the show's focus areas + current headlines
function pickReportageTopic(slot, headlines = []) {
  const focusTopics = [
    'How your brain rewires itself while you sleep — the latest neuroscience',
    'The future of creativity: can AI make art that matters?',
    'Why loneliness is a public health crisis and what we can do about it',
    'The hidden psychology of music — why certain sounds change your mood',
    'Digital detox: myth or medicine? What the research actually says',
    'The science of habits — why we do what we do and how to change',
    'Street art vs galleries: where does real culture live?',
    'The attention economy: how your focus became a commodity',
    'What ancient philosophy can teach us about modern anxiety',
    'The microbiome revolution — how gut bacteria shape your personality',
    'Why we procrastinate and what neuroscience says about fixing it',
    'The death of expertise — do we still trust scientists?',
    'How architecture shapes mental health without you noticing',
    'The psychology of conspiracy theories — why smart people believe weird things',
    'Synesthesia, memory palaces, and the outer limits of human perception',
  ];

  // Mix in a headline-inspired topic if available
  if (headlines.length > 0) {
    const h = headlines[Math.floor(Math.random() * headlines.length)];
    focusTopics.push(`Deep dive: ${h.title} — what it means and why it matters`);
  }

  return focusTopics[Math.floor(Math.random() * focusTopics.length)];
}

export async function generateReportage(slot, headlines = []) {
  const format = FORMATS[Math.floor(Math.random() * FORMATS.length)];
  const topic = pickReportageTopic(slot, headlines);
  const lang = rollLanguage();
  const langBlock = languagePromptBlock(lang);
  const langLabel = lang ? ` [${lang.name}]` : '';

  const hostName = slot.presenterName;
  const coHostName = slot.coHost?.name;
  const excludeVoices = [slot.voice, slot.coHost?.voice].filter(Boolean);

  // Generate experts based on format
  const expertCount = format.type === 'panel' ? 3 : format.type === 'debate' ? 2 : 1;
  const experts = [];
  for (let i = 0; i < expertCount; i++) {
    const focus = slot.contentFocus[i % slot.contentFocus.length] || 'culture';
    experts.push(await generateExpert(focus));
  }

  // Build speaker map with voices
  const guestVoices = pickVoices(excludeVoices, expertCount);
  const speakerMap = { [hostName]: lang ? (lang.voices?.[0] || lang.voice) : slot.voice };
  if (coHostName) speakerMap[coHostName] = lang ? (lang.voices?.[1] || lang.voice) : slot.coHost.voice;
  experts.forEach((g, i) => { speakerMap[g.name] = lang ? lang.voice : guestVoices[i]; });

  const speakerNames = Object.keys(speakerMap);
  const context = format.setup(topic, hostName, format.type === 'panel' || format.type === 'debate' ? experts : experts[0]);

  console.log(`[reportage] ${format.label}: "${topic.slice(0, 50)}..."${langLabel}`);
  console.log(`[reportage] Speakers: ${speakerNames.join(', ')}`);

  // Generate 3 chapters (~5-10 minutes total)
  const CHAPTERS = 3;
  const chapterAudioPaths = [];

  for (let i = 1; i <= CHAPTERS; i++) {
    console.log(`[reportage] Chapter ${i}/${CHAPTERS}...`);
    const script = await generateChapter(i, CHAPTERS, format, topic, speakerNames, context, langBlock);

    // Render dialogue with overlapping voices + studio bed
    const audioPath = await renderDialogue(script, speakerMap, slot.voice, {
      studioBed: true,
      energy: slot.energy,
    });

    chapterAudioPaths.push(audioPath);
  }

  // Concatenate all chapters
  const fullPath = await concatAudioFiles(chapterAudioPaths, true);

  console.log(`[reportage] Complete: ${format.label} — "${topic.slice(0, 40)}..." (${CHAPTERS} chapters)`);

  return {
    path: fullPath,
    type: 'reportage',
    title: `${format.label}: ${topic.slice(0, 50)}`,
    format: format.type,
    topic,
    speakers: speakerNames,
    slot: slot.id,
    lang: lang?.name || 'English',
    generator: 'openrouter+edge-tts',
    source: 'ai-generated-reportage',
    createdAt: new Date().toISOString(),
  };
}
