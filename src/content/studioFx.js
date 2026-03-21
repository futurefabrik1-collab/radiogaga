// Studio effects — background music beds and foley for talk segments.
//
// Music beds:   short ambient loops generated via MusicGen, kept in a small
//               rotating pool.  Mixed at low volume under speech.
// Foley:        synthetic studio sounds (paper rustle, mug clink, chair creak,
//               keyboard tap, pen click, etc.) generated with ffmpeg filters.
//               Randomly scattered into the mix at natural pause points.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const AUDIO_DIR = join(ROOT, 'tmp', 'audio');
const FOLEY_DIR = join(ROOT, 'tmp', 'foley');
const BED_DIR   = join(ROOT, 'tmp', 'beds');

mkdirSync(FOLEY_DIR, { recursive: true });
mkdirSync(BED_DIR, { recursive: true });

// ── Foley generation (synthetic, ffmpeg-only, zero cost) ─────────────────────

// Each foley type is an ffmpeg lavfi filter graph that produces a short sound.
const FOLEY_RECIPES = [
  {
    name: 'paper-rustle',
    // Band-limited white noise with fast envelope — sounds like paper
    filter: 'anoisesrc=d=0.4:c=pink:a=0.03,highpass=f=2000,lowpass=f=8000,afade=t=in:d=0.05,afade=t=out:st=0.25:d=0.15',
  },
  {
    name: 'mug-clink',
    // Short sine ping with harmonics — ceramic tap
    filter: 'aevalsrc=sin(2200*2*PI*t)*exp(-18*t)+0.3*sin(4400*2*PI*t)*exp(-25*t):d=0.3,volume=0.04',
  },
  {
    name: 'chair-creak',
    // Low frequency sweep — leather/wood creak
    filter: 'aevalsrc=sin((120+80*sin(6*PI*t))*2*PI*t)*exp(-4*t):d=0.6,volume=0.025,lowpass=f=400',
  },
  {
    name: 'keyboard-tap',
    // Very short click — mechanical key
    filter: 'anoisesrc=d=0.08:c=white:a=0.04,highpass=f=3000,afade=t=out:d=0.08',
  },
  {
    name: 'pen-click',
    // Two-click pen sound
    filter: 'aevalsrc=sin(3500*2*PI*t)*exp(-40*t):d=0.15,volume=0.03',
  },
  {
    name: 'page-turn',
    // Slightly longer paper sound with different character
    filter: 'anoisesrc=d=0.6:c=pink:a=0.02,highpass=f=1500,lowpass=f=6000,afade=t=in:d=0.1,afade=t=out:st=0.35:d=0.25',
  },
  {
    name: 'mic-bump',
    // Low thump — accidental mic touch
    filter: 'aevalsrc=sin(80*2*PI*t)*exp(-12*t):d=0.25,volume=0.03,lowpass=f=200',
  },
];

// Pre-generate a batch of foley clips at startup (fast, <1s total).
let foleyPool = []; // { name, path }

async function generateFoleyClip(recipe) {
  const outPath = join(FOLEY_DIR, `${recipe.name}-${randomUUID().slice(0, 8)}.mp3`);
  await execFileAsync('ffmpeg', [
    '-f', 'lavfi', '-i', recipe.filter,
    '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
    '-y', outPath,
  ]);
  return { name: recipe.name, path: outPath };
}

export async function initFoleyPool(count = 14) {
  // Check if persisted foley clips exist — skip regeneration
  const PERSIST_DIR = join(ROOT, 'assets', 'foley');
  mkdirSync(PERSIST_DIR, { recursive: true });
  const existing = readdirSync(PERSIST_DIR).filter(f => f.endsWith('.mp3'));
  if (existing.length >= count) {
    foleyPool = existing.map(f => ({ name: f.replace('.mp3', ''), path: join(PERSIST_DIR, f) }));
    console.log(`[studioFx] Foley pool loaded from disk (${foleyPool.length} clips)`);
    return;
  }

  console.log('[studioFx] Generating foley pool...');
  const promises = [];
  for (let i = 0; i < count; i++) {
    const recipe = FOLEY_RECIPES[i % FOLEY_RECIPES.length];
    promises.push(generateFoleyClip(recipe));
  }
  foleyPool = await Promise.all(promises);

  // Persist to assets/foley/ for future restarts
  for (const clip of foleyPool) {
    const dest = join(PERSIST_DIR, `${clip.name}.mp3`);
    try { await execFileAsync('cp', [clip.path, dest]); } catch {}
  }
  console.log(`[studioFx] Foley pool ready (${foleyPool.length} clips, persisted)`);
}

function pickRandomFoley(n = 2) {
  if (!foleyPool.length) return [];
  const shuffled = [...foleyPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// ── Music bed pool ───────────────────────────────────────────────────────────

// We keep a small pool of pre-generated ambient beds.  The producer's
// archiveMusic worker or a dedicated bed worker can fill this.  For now
// we generate beds on-demand via MusicGen (short, 15s ambient loops) or
// fall back to a synthetic pad if MusicGen is unavailable.

const BED_POOL_TARGET = 4;

function existingBeds() {
  try {
    return readdirSync(BED_DIR).filter(f => f.endsWith('.mp3')).map(f => join(BED_DIR, f));
  } catch { return []; }
}

// Generate a synthetic ambient pad using ffmpeg (zero-cost fallback).
// A warm chord built from sine waves with slow fade — serviceable background.
async function generateSyntheticBed(durationS = 30) {
  const outPath = join(BED_DIR, `synth-bed-${randomUUID().slice(0, 8)}.mp3`);
  // C major 7th chord with detuning for warmth
  const chord = [
    'sin(261.6*2*PI*t)',   // C4
    'sin(329.6*2*PI*t)',   // E4
    'sin(392.0*2*PI*t)',   // G4
    'sin(493.9*2*PI*t)',   // B4
    'sin(523.2*2*PI*t)',   // C5
  ].join('+');
  const expr = `(${chord})*0.008`;

  await execFileAsync('ffmpeg', [
    '-f', 'lavfi', '-i', `aevalsrc=${expr}:d=${durationS},lowpass=f=800,afade=t=in:d=3,afade=t=out:st=${durationS - 4}:d=4`,
    '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
    '-y', outPath,
  ]);
  return outPath;
}

// Pick a random bed from the pool, or generate a synthetic one.
async function pickBed(durationS) {
  const beds = existingBeds();
  if (beds.length > 0) {
    return beds[Math.floor(Math.random() * beds.length)];
  }
  return generateSyntheticBed(durationS);
}

// ── Main mixing function ─────────────────────────────────────────────────────

// Mix a studio atmosphere under a speech MP3:
//   1. Bed music at -18dB under speech (ducked)
//   2. 1–3 random foley clips scattered at random offsets
//
// Returns the path to the mixed MP3.  Cleans up intermediates.
// If mixing fails for any reason, returns the original speech path unchanged.

export async function mixStudioBed(speechPath, { durationS = 60, energy = 3 } = {}) {
  try {
    const bedPath = await pickBed(durationS + 5);
    const foleyClips = pickRandomFoley(Math.ceil(energy / 2)); // more energy = more foley

    const outPath = join(AUDIO_DIR, `studio-${randomUUID().slice(0, 8)}.mp3`);

    // Build ffmpeg filter graph:
    //   [0] = speech (main)
    //   [1] = bed music (looped to match speech length, volume-reduced)
    //   [2..N] = foley clips (delayed to random offsets)
    const inputs = ['-i', speechPath, '-i', bedPath];
    const filterParts = [];

    // Speech: boost to ensure it clearly dominates the mix
    filterParts.push(`[0:a]volume=2.5[speech]`);

    // Bed: loop to cover speech duration, subtle background texture
    filterParts.push(`[1:a]aloop=loop=-1:size=2e+09,atrim=duration=${durationS + 2},volume=0.06,afade=t=in:d=2,afade=t=out:st=${Math.max(0, durationS - 3)}:d=3[bed]`);

    let mixInputs = '[speech][bed]';
    let streamIdx = 2;

    for (const foley of foleyClips) {
      inputs.push('-i', foley.path);
      const delayMs = Math.floor(Math.random() * Math.max(1000, (durationS - 2) * 1000));
      filterParts.push(`[${streamIdx}:a]adelay=${delayMs}|${delayMs},volume=0.3[f${streamIdx}]`);
      mixInputs += `[f${streamIdx}]`;
      streamIdx++;
    }

    const totalInputs = streamIdx;
    // Speech-dominant mix — speech at full weight, bed/foley barely audible
    filterParts.push(`${mixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=2:weights=${['1', ...Array(totalInputs - 1).fill('0.15')].join(' ')},alimiter=limit=0.95:level=false[out]`);

    const filterGraph = filterParts.join(';');

    await execFileAsync('ffmpeg', [
      ...inputs,
      '-filter_complex', filterGraph,
      '-map', '[out]',
      '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
      '-y', outPath,
    ], { timeout: 30000 });

    console.log(`[studioFx] Mixed: ${outPath}`);
    return outPath;
  } catch (err) {
    console.warn(`[studioFx] Mix failed, using dry speech: ${err.message}`);
    return speechPath;
  }
}

// ── Background bed worker ────────────────────────────────────────────────────
// Keeps the bed pool topped up with synthetic pads.  Runs every few minutes.

let bedWorkerRunning = false;

export function stopBedWorker() {
  bedWorkerRunning = false;
}

export async function startBedWorker() {
  if (bedWorkerRunning) return;
  bedWorkerRunning = true;
  console.log('[studioFx] Bed worker started');

  while (bedWorkerRunning) {
    const beds = existingBeds();
    if (beds.length < BED_POOL_TARGET) {
      try {
        // Vary the chord/mood slightly by randomising duration
        const dur = 20 + Math.floor(Math.random() * 20); // 20–40s
        await generateSyntheticBed(dur);
        console.log(`[studioFx] Bed pool: ${existingBeds().length}/${BED_POOL_TARGET}`);
      } catch (err) {
        console.warn('[studioFx] Bed generation failed:', err.message);
      }
    }
    // Prune excess beds
    const current = existingBeds();
    while (current.length > BED_POOL_TARGET * 2) {
      const old = current.shift();
      try { unlinkSync(old); } catch {}
    }
    await new Promise(r => setTimeout(r, 5 * 60 * 1000)); // check every 5 min
  }
}
