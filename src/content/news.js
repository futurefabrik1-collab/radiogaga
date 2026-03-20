// Hourly news bulletin — satirical, ambiguity-filtered, with one bizarre invented story.
// Four rotating anchors with distinct styles. Runs once per hour.

import { Ollama } from 'ollama';
import { textToMp3 } from './tts.js';

const ollama = new Ollama({ host: 'http://localhost:11434' });

// Four news anchors — rotate through them each hour
const ANCHORS = [
  {
    name: 'Philippa Holst',
    voice: 'en-GB-SoniaNeural',
    style: 'Formal BBC News presenter. Precise, slightly supercilious. Reads the most absurd things with total composure.',
  },
  {
    name: 'Marcus Webb',
    voice: 'en-GB-RyanNeural',
    style: 'Authoritative and measured. Slightly world-weary. Has seen everything and is quietly appalled by all of it.',
  },
  {
    name: 'Aoife Brennan',
    voice: 'en-IE-ConnorNeural',
    style: 'Warm and wry. Barely keeping it together. Occasionally lets a hint of disbelief into an otherwise straight delivery.',
  },
  {
    name: 'Dex Calloway',
    voice: 'en-US-GuyNeural',
    style: 'American cable-news energy. Treats everything as breaking news of maximum urgency. Slightly unhinged.',
  },
];

let anchorIndex = 0;

function getAnchor() {
  const anchor = ANCHORS[anchorIndex % ANCHORS.length];
  anchorIndex++;
  return anchor;
}

const NEWS_PROMPT = (headlines, anchorStyle, hour) => `You are writing a satirical radio news bulletin for radioGAGA.

ANCHOR STYLE: ${anchorStyle}
TIME: The ${hour}:00 news.

RULES — read carefully:
1. RENAME all real people with silly-but-close fictional names that echo the original sound.
   Examples: "Donald Trump" → "Ronold Grump", "Keir Starmer" → "Keer Blartner",
   "Elon Musk" → "Felon Dusk", "Taylor Swift" → "Sailor Drift"
2. RENAME all real places similarly.
   Examples: "Washington" → "Splashington", "London" → "Blondon", "France" → "Prance"
3. REWRITE 2 real headlines as SATIRE — exaggerate, expose the absurdity, treat the ridiculous as normal.
4. INVENT one completely BIZARRE story that has no basis in reality. Present it with total deadpan gravity.
   Examples: "Scientists confirm Tuesday is getting longer", "Parliament votes to replace gravity",
   "A local man has been found to be 40% cheese"
5. Open with: "This is the [hour]:00 news on radioGAGA. I'm [anchor name]."
6. End with: "More throughout the day. You're listening to radioGAGA."
7. Total length: 130–160 words. Deadpan throughout. No winking at the audience.
8. Output ONLY the spoken bulletin. No stage directions.

REAL HEADLINES TO SATIRISE (use 2 of these):
${headlines}

Write the bulletin now:`;

export async function generateNewsBulletin(headlines) {
  const anchor = getAnchor();
  const hour = new Date().getHours();

  const headlineList = headlines
    .slice(0, 5)
    .map(h => `- ${h.title}`)
    .join('\n');

  console.log(`[news] Generating ${hour}:00 bulletin — anchor: ${anchor.name}`);

  const response = await ollama.generate({
    model: 'llama3.2',
    prompt: NEWS_PROMPT(headlineList, anchor.style, hour),
    options: { temperature: 0.95, num_predict: 350 },
    stream: false,
  });

  const script = response.response.trim();
  const { path } = await textToMp3(script, anchor.voice);

  console.log(`[news] Bulletin ready (${script.split(/\s+/).length} words)`);

  return {
    path,
    type: 'news',
    title: `${hour}:00 News — ${anchor.name}`,
    script,
    anchor: anchor.name,
    createdAt: new Date().toISOString(),
  };
}
