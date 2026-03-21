// Hourly news bulletin — positive news, warm humanity, classic radio style.
// Dedicated news anchor voice distinct from all presenters.
// Runs once per hour on the hour.
//
// Audio flow: News Pulse sting plays → voice blends in at 3s over sting →
// sting fades to background under voice → news ends → radioGAGA Sting closer.

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ollama } from './ollama.js';
import { textToMp3 } from './tts.js';
import { markHeadlinesUsed } from './rss.js';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();

// News pulse stings — randomly alternated
const NEWS_PULSES = [
  join(ROOT, 'assets', 'news-pulse-a.mp3'),
  join(ROOT, 'assets', 'news-pulse-b.mp3'),
];

// Closing sting
const CLOSING_STING = join(ROOT, 'assets', 'jingle.mp3');

// Single dedicated news anchor — voice NOT used by any presenter
const NEWS_ANCHOR = {
  name: 'Clara Fontaine',
  voice: 'en-US-JennyNeural',
  style: 'Classic BBC World Service newsreader — authoritative yet warm. Clear diction, measured pace, genuinely uplifted by good news. Occasional gentle smile audible in the voice. Professional but deeply human.',
};

const NEWS_PROMPT = (headlines, hour) => `You are writing a POSITIVE news bulletin for radioGAGA, an AI-generated radio station.

ANCHOR: Clara Fontaine — classic, warm, authoritative newsreader.
TIME: the news.

CONTENT RULES:
1. Select 3–4 stories from the headlines below that are POSITIVE — breakthroughs, kindness, achievements, progress, community, nature, science wins, cultural milestones.
2. If a headline is negative, SKIP IT entirely. Only cover good news.
3. Cover each story briefly in classic radio news style (1-2 sentences each).
4. Then pick the MOST POSITIVE story and go into detail — expand on why it matters, what it means for people, the human impact. This is the "deep dive" — 3-4 sentences of warm, engaged storytelling. Make the listener feel the significance.
5. End with ONE positive affirmation or uplifting thought.
6. The tone should make the listener feel hopeful about the world.

Use real names of people, places, companies, and organisations accurately.

FORMAT:
- Open with: "This is the news on radioGAGA. I'm Clara Fontaine."
- After the headlines, transition to the deep dive: "And now, a story that caught my eye today..." or similar
- End with: "And that's the news. More throughout the day on radioGAGA."
- Total length: 250–350 words. Warm, clear, classic radio delivery.
- Output ONLY the spoken bulletin. No stage directions.

HEADLINES (pick only the positive ones):
${headlines}

Write the bulletin now:`;

/**
 * Overlay voice onto news pulse sting.
 * Sting plays from 0s, voice starts at voiceDelayS, sting ducks under voice.
 */
async function overlayVoiceOnSting(voicePath, stingPath, voiceDelayS = 3) {
  const outPath = voicePath.replace(/\.mp3$/, '-news.mp3');

  // Use ffmpeg to:
  // 1. Delay the voice by voiceDelayS seconds
  // 2. Duck (lower volume of) the sting once voice starts
  // 3. Mix both together
  const args = [
    '-i', stingPath,               // input 0: news pulse sting
    '-i', voicePath,               // input 1: voice
    '-filter_complex',
    [
      // Pad voice with silence at the start so it begins after the sting intro
      `[1:a]adelay=${voiceDelayS * 1000}|${voiceDelayS * 1000}[voice]`,
      // Duck the sting volume down once the voice starts
      `[0:a]volume=1.0:enable='lt(t,${voiceDelayS})'[sting_full]`,
      `[0:a]volume=0.15:enable='gte(t,${voiceDelayS})'[sting_duck]`,
      // Mix full-volume sting (first 3s) with ducked sting (rest) — amix merges them
      `[sting_full][sting_duck]amix=inputs=2:duration=longest[sting_mixed]`,
      // Final mix: ducked sting + delayed voice
      `[sting_mixed][voice]amix=inputs=2:duration=longest:dropout_transition=2`,
    ].join(';'),
    '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100', '-y', outPath,
  ];

  await execFileAsync('ffmpeg', args);
  return outPath;
}

export async function generateNewsBulletin(headlines) {
  const hour = new Date().getHours();

  const newsHeadlines = headlines.slice(0, 8);
  markHeadlinesUsed(newsHeadlines); // archive so they won't repeat
  const headlineList = newsHeadlines
    .map(h => `- ${h.title}`)
    .join('\n');

  console.log(`[news] Generating ${hour}:00 bulletin — anchor: ${NEWS_ANCHOR.name}`);

  const response = await ollama.generate({
    prompt: NEWS_PROMPT(headlineList, hour),
    options: { temperature: 0.85, num_predict: 600 },
  });

  const script = response.response.trim();
  let { path } = await textToMp3(script, NEWS_ANCHOR.voice, { energy: 3 });

  // Overlay voice onto a random news pulse sting
  const pulse = NEWS_PULSES[Math.floor(Math.random() * NEWS_PULSES.length)];
  if (existsSync(pulse)) {
    try {
      const mixed = await overlayVoiceOnSting(path, pulse, 3);
      if (existsSync(mixed)) {
        path = mixed;
        console.log(`[news] Voice overlaid on news pulse sting`);
      }
    } catch (err) {
      console.warn('[news] Pulse overlay failed, using raw voice:', err.message);
    }
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
    generator: 'openrouter+edge-tts',
    model: 'llama-3.3-70b-instruct',
    source: 'ai-generated-news',
    createdAt: new Date().toISOString(),
    closingSting: CLOSING_STING, // stream loop plays this after news block
  };
}
