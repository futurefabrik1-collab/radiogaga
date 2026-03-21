// Hourly news bulletin — positive news, warm humanity, classic radio style.
// Dedicated news anchor voice distinct from all presenters.
// Runs once per hour on the hour.

import { ollama } from './ollama.js';
import { textToMp3 } from './tts.js';
import { mixStudioBed } from './studioFx.js';

// Single dedicated news anchor — voice NOT used by any presenter
const NEWS_ANCHOR = {
  name: 'Clara Fontaine',
  voice: 'en-US-JennyNeural',
  style: 'Classic BBC World Service newsreader — authoritative yet warm. Clear diction, measured pace, genuinely uplifted by good news. Occasional gentle smile audible in the voice. Professional but deeply human.',
};

const NEWS_PROMPT = (headlines, hour) => `You are writing a POSITIVE news bulletin for radioGAGA, an AI-generated radio station.

ANCHOR: Clara Fontaine — classic, warm, authoritative newsreader.
TIME: The ${hour}:00 news.

CONTENT RULES:
1. Select 3–4 stories from the headlines below that are POSITIVE — breakthroughs, kindness, achievements, progress, community, nature, science wins, cultural milestones.
2. If a headline is negative, SKIP IT entirely. Only cover good news.
3. Rewrite each story in classic radio news style — clear, factual, but with warmth.
4. After the news stories, include ONE positive affirmation or uplifting thought.
   Examples: "And a reminder: you are exactly where you need to be today."
   "Take a breath. You're doing better than you think."
   "Remember: small acts of kindness change the world more than headlines ever will."
5. The tone should make the listener feel hopeful about the world.

ANONYMITY RULE (MANDATORY):
RENAME **ALL** real people with silly fictional names that echo the original sound.
RENAME **ALL** real places, companies, and organisations similarly.
SOLE EXCEPTION: real decentralisation / open-source project names may be used when discussing the technology itself.

FORMAT:
- Open with: "This is the ${hour}:00 news on radioGAGA. I'm Clara Fontaine."
- End with: "And that's the news. More throughout the day on radioGAGA."
- Total length: 150–200 words. Warm, clear, classic radio delivery.
- Output ONLY the spoken bulletin. No stage directions.

HEADLINES (pick only the positive ones):
${headlines}

Write the bulletin now:`;

export async function generateNewsBulletin(headlines) {
  const hour = new Date().getHours();

  const headlineList = headlines
    .slice(0, 8) // give LLM more to choose positive ones from
    .map(h => `- ${h.title}`)
    .join('\n');

  console.log(`[news] Generating ${hour}:00 bulletin — anchor: ${NEWS_ANCHOR.name}`);

  const response = await ollama.generate({
    prompt: NEWS_PROMPT(headlineList, hour),
    options: { temperature: 0.85, num_predict: 400 },
  });

  const script = response.response.trim();
  let { path } = await textToMp3(script, NEWS_ANCHOR.voice, { energy: 3 });

  // Add a subtle news bed underneath
  try {
    const wordCount = script.split(/\s+/).length;
    path = await mixStudioBed(path, {
      durationS: Math.round(wordCount / 2.5),
      energy: 2,
    });
  } catch (err) {
    console.warn('[news] Studio bed mixing failed:', err.message);
  }

  console.log(`[news] Bulletin ready (${script.split(/\s+/).length} words)`);

  return {
    path,
    type: 'news',
    title: `${hour}:00 News — ${NEWS_ANCHOR.name}`,
    script,
    anchor: NEWS_ANCHOR.name,
    voice: NEWS_ANCHOR.voice,
    slot: null,
    generator: 'groq+edge-tts',
    model: 'llama-3.3-70b-versatile',
    source: 'ai-generated-news',
    createdAt: new Date().toISOString(),
  };
}
