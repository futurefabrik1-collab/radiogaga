// Advert generator — creates fictional product ads with voice and optional music bed.
// Humor style (dark/light/dry/absurd) is inherited from the show's schedule config.

import { Ollama } from 'ollama';
import { textToMp3 } from './tts.js';
import { generateMusic } from './music.js';

const ollama = new Ollama({ host: 'http://localhost:11434' });

// Fictional product categories to rotate through
const PRODUCT_CATEGORIES = [
  'household appliance', 'personal hygiene product', 'food supplement',
  'insurance policy', 'subscription service', 'pharmaceutical',
  'luxury item', 'self-help program', 'financial product',
  'children\'s toy', 'fitness equipment', 'travel destination',
  'mobile app', 'cleaning product', 'pet accessory',
];

const HUMOR_BRIEF = {
  dark: `Dark, sardonic humour. The product solves a problem no one should have.
The benefits are suspiciously good or vaguely threatening.
The tagline should feel like a warning disguised as an invitation.
Think: late-stage capitalism meets existential dread.
Examples: "GRIEF-B-GONE: for when the feelings are getting in the way",
"VAULT INSURANCE: we can't prevent it, but we can make it profitable"`,

  light: `Warm, silly, gently absurd humour. The product is ridiculous but charming.
The announcer is enthusiastic about things that don't warrant enthusiasm.
The tagline should be cheerfully meaningless.
Examples: "BLANDSWORTH'S PASTE: for all your paste-related needs",
"FLONK: the drink that tastes like you've tried"`,

  dry: `Completely deadpan. The product is absurd but presented with total corporate
seriousness, as if it is entirely normal and necessary. No winking at the audience.
The drier the better. The tagline should be a meaningless mission statement.
Examples: "OBLIQUE SOLUTIONS: streamlining your redundancy since whenever",
"GREY MATTER QUARTERLY: a publication about publication"`,

  absurd: `Full surrealist chaos. The product may not physically exist. The benefits
are impossible. The target audience is unclear or alarming. The tagline contradicts itself.
The ad should escalate and not resolve.
Examples: "SCREAMING BUTTER: it doesn't spread, it arrives",
"THE VOID PLAN: subscribe now — cancellation is not a feature"`,
};

function pickCategory() {
  return PRODUCT_CATEGORIES[Math.floor(Math.random() * PRODUCT_CATEGORIES.length)];
}

const AD_PROMPT = (category, humor) => `You are writing a 20-second radio advertisement for radioGAGA.

The product is a completely fictional ${category}. Invent the product name, its features,
and a tagline. The ad should be 45–60 words — enough for about 20 seconds when read aloud.

HUMOR STYLE:
${HUMOR_BRIEF[humor] || HUMOR_BRIEF.light}

Rules:
- Output ONLY the spoken ad copy. No stage directions, no music cues, no [ANNOUNCER] labels.
- Include the product name at least twice.
- End with the tagline.
- Do NOT reference real brands or real people.

Write the ad now:`;

export async function generateAdvert(slot) {
  const humor = slot?.advertHumor || 'light';
  const category = pickCategory();
  const withMusicBed = slot?.advertMusicBed ?? false;

  console.log(`[advert] Generating ${humor} ad (${category})...`);

  // Generate script
  const response = await ollama.generate({
    model: 'llama3.2',
    prompt: AD_PROMPT(category, humor),
    options: { temperature: 0.95, num_predict: 150 },
    stream: false,
  });

  const script = response.response.trim();
  console.log(`[advert] Script: "${script.slice(0, 80)}..."`);

  // TTS with the show's presenter voice (ads use same voice, slightly faster)
  const voice = slot?.voice || 'en-GB-RyanNeural';
  const { path: voicePath } = await textToMp3(script, voice);

  // Optional music bed — generate a short jingle and mix with voice
  if (withMusicBed) {
    const jingleMood = humor === 'dark'
      ? 'eerie corporate jingle, unsettling major key, elevator music gone wrong'
      : humor === 'absurd'
        ? 'chaotic jingle, multiple genres colliding, triumphant and wrong'
        : 'upbeat radio jingle, catchy, slightly annoying, punchy';

    try {
      const musicSegment = await generateMusic({
        slot: { musicMood: jingleMood },
        duration: 20,
      });
      // For now queue the voice only — music bed mixing comes in a later phase
      // TODO: mix voicePath over musicSegment.path with ffmpeg
    } catch {
      // music bed is optional — proceed voice-only
    }
  }

  return {
    path: voicePath,
    type: 'advert',
    title: `Ad — ${category} (${humor})`,
    script,
    humor,
    slot: slot?.id,
    createdAt: new Date().toISOString(),
  };
}
