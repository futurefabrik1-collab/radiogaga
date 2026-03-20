// Advert generator — creates fictional product ads with voice and optional music bed.
// Humor style (dark/light/dry/absurd) is inherited from the show's schedule config.

import { ollama } from './ollama.js';
import { textToMp3 } from './tts.js';
import { generateMusic } from './music.js';

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

// ── Decentralisation tech spots ───────────────────────────────────────────────

const DECENT_TOPICS = [
  'IPFS (InterPlanetary File System) and content-addressed storage',
  'Bitcoin Lightning Network and instant micropayments',
  'Ethereum smart contracts and programmable money',
  'DAO (Decentralised Autonomous Organisations) governance',
  'Self-sovereign identity and DID (Decentralised Identifiers)',
  'Nostr protocol and censorship-resistant social media',
  'Filecoin and decentralised cloud storage',
  'Uniswap and automated market makers in DeFi',
  'Zero-knowledge proofs and privacy-preserving computation',
  'The Fediverse: Mastodon, ActivityPub and federated social networks',
  'Monero and privacy-focused cryptocurrency',
  'Arweave and permanent decentralised data storage',
  'Tor network and onion routing for anonymous communication',
  'BitTorrent and peer-to-peer file distribution',
  'Ethereum Layer 2 rollups and scaling solutions',
  'Decentralised DNS with Handshake and ENS',
  'Multi-sig wallets and shared key custody',
  'Open-source hardware and RISC-V processors',
  'Federated learning and privacy-preserving AI training',
  'Secure multi-party computation and threshold cryptography',
  'Homomorphic encryption and computing on encrypted data',
  'Matrix protocol and decentralised encrypted messaging',
  'Helium network and decentralised wireless infrastructure',
  'Proof-of-work vs proof-of-stake consensus mechanisms',
  'Git and distributed version control',
  'Mesh networking and community-owned internet infrastructure',
  'Hardware security keys and passkeys replacing passwords',
  'Signal protocol and end-to-end encrypted messaging',
  'Decentralised exchanges vs centralised exchanges',
  'NFTs beyond hype: verifiable digital ownership on-chain',
];

const DECENT_PROMPT = (topic) => `You are writing a 20-second factual radio spot for radioGAGA — an AI radio station.

Topic: ${topic}

Write an informative, engaging radio spot (45–60 words) that teaches the listener one genuinely useful fact or skill about this topic.
Tone: clear, curious, slightly enthusiastic — like a knowledgeable friend explaining something interesting, not a corporate press release.
No hype. No investment advice. Facts only.

Rules:
- Output ONLY the spoken copy. No stage directions, no labels.
- Start with a hook ("Did you know…", "Right now…", "Here's something worth knowing…", or similar).
- End with one concrete takeaway or action the listener can explore.
- Keep it factual and accurate.
- USE REAL PROJECT NAMES. These are factual decentralisation promotion spots — the station
  anonymity rule does NOT apply here. Name the real technology, protocol, or project accurately.

Write the spot now:`;

export async function generateDecentAdvert(slot) {
  const topic = DECENT_TOPICS[Math.floor(Math.random() * DECENT_TOPICS.length)];
  console.log(`[advert] Generating decentralisation spot (${topic.split(' ')[0]})...`);

  const response = await ollama.generate({
    model: 'llama3.2',
    prompt: DECENT_PROMPT(topic),
    options: { temperature: 0.7, num_predict: 150 },
    stream: false,
  });

  const script = response.response.trim();
  console.log(`[advert] Decent spot: "${script.slice(0, 80)}..."`);

  const voice = slot?.voice || 'en-GB-RyanNeural';
  const { path: voicePath } = await textToMp3(script, voice);

  return {
    path: voicePath,
    type: 'advert',
    title: `Decent Tech — ${topic.split(/[ (]/)[0]}`,
    script,
    humor: 'decent',
    slot: slot?.id,
    createdAt: new Date().toISOString(),
  };
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

  // Music bed mixing — layer voice over a studio bed for ad shows that want it
  if (withMusicBed) {
    try {
      const { mixStudioBed } = await import('./studioFx.js');
      const words = script.split(/\s+/).length;
      const mixed = await mixStudioBed(voicePath, { durationS: Math.round(words / 2.5), energy: 3 });
      return {
        path: mixed,
        type: 'advert',
        title: `Ad — ${category} (${humor})`,
        script, humor,
        slot: slot?.id,
        createdAt: new Date().toISOString(),
      };
    } catch {
      // music bed is optional — fall through to voice-only
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
