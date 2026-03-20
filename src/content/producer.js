// Content producer — orchestrates the full content loop with schedule awareness.
//
// Sequence per slot:  [DJ × djPerMusic] → [music] → repeat
//                     Every advertFrequency cycles, insert an advert after the music.
// Timing:             driven by schedule slot settings in schedule.yaml
// Lag compensation:   tracks rolling average generation times, buffers further
//                     ahead when generation is slow.

import { fetchHeadlines } from './rss.js';
import { generateDJSegment } from './dj.js';
import { textToMp3 } from './tts.js';
import { generateMusic } from './music.js';
import { generateAdvert } from './advert.js';
import { getCurrentSlot, logSchedule } from '../schedule.js';
import { queue } from '../queue.js';
import { getNextSongOverride, markOverrideUsed, getRecentSuggestions } from '../db.js';
import { getSubscribers } from '../bot/index.js';
import { launchCompetition } from '../bot/competitions.js';
import { startCatalogWorker, getFromCatalog, catalogSize } from './advertCatalog.js';
import { startArchiveWorker, archivePoolSize } from './archiveMusic.js';
import { generateTrackIntro, generateTrackOutro } from './trackIntro.js';
import { generateGuestSegment } from './guest.js';
import { generateNewsBulletin } from './news.js';

const POLL_INTERVAL_MS = 4000;
const HEADLINE_TTL_MS = 15 * 60 * 1000;
const EMERGENCY_BUFFER_S = 60; // pre-emptively pull from catalog if queue below this

const lagTracker = {
  dj: [],
  music: [],
  add(type, ms) {
    this[type].push(ms);
    if (this[type].length > 5) this[type].shift();
  },
  avg(type) {
    const arr = this[type];
    if (!arr.length) return type === 'music' ? 240000 : 30000;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },
};

function queuedSeconds() {
  return queue.items.reduce((acc, seg) => {
    if (seg.type === 'music')  return acc + (seg.duration || 30);
    if (seg.type === 'advert') return acc + 25; // ~20s ad
    const words = seg.script ? seg.script.split(/\s+/).length : 150;
    return acc + words / 2.5;
  }, 0);
}

const TARGET_BUFFER_S = 15 * 60; // 15-minute content buffer

function needsContent() {
  return queuedSeconds() < TARGET_BUFFER_S;
}

let headlines = [];
let lastHeadlineFetch = 0;
let djSegmentCount = 0;   // DJ segments since last music track
let cycleCount = 0;       // full DJ+music cycles since last advert
let lastSlotId = null;
let lastMusicMood = null; // remembered for track outro
let lastNewsHour = -1;   // prevent duplicate news per hour
const COMPETITION_EVERY_N_CYCLES = 5;

async function refreshHeadlines() {
  const now = Date.now();
  if (now - lastHeadlineFetch > HEADLINE_TTL_MS) {
    headlines = await fetchHeadlines(4);
    lastHeadlineFetch = now;
  }
  return headlines;
}

async function produceDJSegment(slot) {
  const current = await refreshHeadlines();
  if (!current.length) { console.warn('[producer] No headlines'); return; }

  // Inject listener suggestions into the slot context
  const suggestions = getRecentSuggestions('theme', 3);
  const slotWithSuggestions = suggestions.length
    ? { ...slot, listenerSuggestions: suggestions }
    : slot;

  const t0 = Date.now();
  const result = await generateDJSegment(current, slotWithSuggestions);
  const { script, title, headlines: used } = result;

  // Dialogue shows return a pre-rendered path; monologue shows need TTS
  const path = result.path ?? (await textToMp3(script, slot.voice)).path;
  lagTracker.add('dj', Date.now() - t0);

  queue.push({
    path, type: 'dj', title, script,
    slot: slot.id,
    sources: used.map(h => h.source),
    createdAt: new Date().toISOString(),
  });

  djSegmentCount++;
}

async function produceMusicSegment(slot) {
  const t0 = Date.now();

  // Check for a competition-won or listener-submitted song override
  const override = getNextSongOverride();
  const overrideSlot = override
    ? { ...slot, musicMood: override.prompt }
    : slot;
  if (override) {
    markOverrideUsed(override.id);
    console.log(`[producer] Using song override: "${override.prompt}"`);
  }

  const mood = overrideSlot.musicMood;

  // Track outro for previous track (if we have one)
  if (lastMusicMood) {
    try {
      const outro = await generateTrackOutro(slot, lastMusicMood);
      queue.push({ ...outro, createdAt: new Date().toISOString() });
    } catch (err) {
      console.warn('[producer] Track outro failed:', err.message);
    }
  }

  // Track intro for this track
  try {
    const intro = await generateTrackIntro({ ...slot, musicMood: mood });
    queue.push({ ...intro, createdAt: new Date().toISOString() });
  } catch (err) {
    console.warn('[producer] Track intro failed:', err.message);
  }

  // Prefer archive tracks (Suno/Udio quality) over local MusicGen.
  // Only fall back to MusicGen when the archive pool is running low.
  const archiveTrack = archivePoolSize() > 5 ? getArchiveTrack() : null;

  if (archiveTrack) {
    console.log(`[producer] Archive track: ${archiveTrack.title}`);
    queue.push({
      ...archiveTrack,
      type: 'music',
      slot: slot.id,
      createdAt: new Date().toISOString(),
    });
    lastMusicMood = mood;
    lagTracker.add('music', Date.now() - t0);
  } else {
    // Archive pool low or empty — generate locally with MusicGen
    console.log(`[producer] Archive pool low (${archivePoolSize()}), generating with MusicGen`);
    try {
      const segment = await generateMusic({ slot: overrideSlot, duration: slot.musicDuration });
      lagTracker.add('music', Date.now() - t0);
      queue.push({ ...segment, slot: slot.id, createdAt: new Date().toISOString() });
      lastMusicMood = mood;
    } catch (err) {
      console.error('[producer] Music generation failed, skipping:', err.message);
      lastMusicMood = null;
    }
  }

  djSegmentCount = 0;
  cycleCount++;

  // Launch a competition periodically
  if (cycleCount % COMPETITION_EVERY_N_CYCLES === 0) {
    launchCompetition(getSubscribers()).catch(() => {});
  }
}

async function produceGuestSegment(slot) {
  try {
    console.log(`[producer] ${slot.name}: guest interview`);
    const segment = await generateGuestSegment(slot);
    queue.push({ ...segment, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error('[producer] Guest segment failed:', err.message);
  }
}

async function produceNewsBulletin() {
  const current = await refreshHeadlines();
  if (!current.length) return;
  try {
    const bulletin = await generateNewsBulletin(current);
    queue.push(bulletin);
    lastNewsHour = new Date().getHours();
    console.log(`[producer] News bulletin queued: ${bulletin.title}`);
  } catch (err) {
    console.error('[producer] News failed:', err.message);
  }
}

async function produceAdvert(slot) {
  try {
    const advert = await generateAdvert(slot);
    queue.push(advert);
    console.log(`[producer] Advert queued: ${advert.title}`);
  } catch (err) {
    console.error('[producer] Advert failed, skipping:', err.message);
  }
}

async function loop() {
  logSchedule();
  console.log('[producer] Starting content loop');
  startCatalogWorker();
  startArchiveWorker();

  let slot = getCurrentSlot();
  lastSlotId = slot.id;
  console.log(`[producer] Current slot: ${slot.name} (${slot.hours[0]}:00) | voice: ${slot.voice}`);

  await produceDJSegment(slot);
  produceMusicSegment(slot).catch(() => {});

  while (true) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    slot = getCurrentSlot();

    if (slot.id !== lastSlotId) {
      console.log(`\n[schedule] ▶ ${slot.name} | energy:${slot.energy} | voice:${slot.voice} | humor:${slot.advertHumor}`);
      lastSlotId = slot.id;
      djSegmentCount = 0;
    }

    // Hourly news bulletin — fires within first 2 minutes of each hour
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    if (currentMinute < 2 && currentHour !== lastNewsHour) {
      console.log(`[producer] Scheduling ${currentHour}:00 news bulletin`);
      produceNewsBulletin().catch(() => {});
    }

    // Emergency gap-fill: if queue is critically thin, drop in a catalog advert
    if (queuedSeconds() < EMERGENCY_BUFFER_S && catalogSize() > 0) {
      const filler = getFromCatalog(slot.advertHumor);
      if (filler) {
        queue.push({ ...filler, type: 'advert', slot: slot.id });
        console.log(`[producer] Emergency filler: ${filler.title} (catalog: ${catalogSize()} left)`);
      }
      continue;
    }

    if (!needsContent()) continue;

    if (djSegmentCount >= slot.djPerMusic) {
      // Time for music
      console.log(`[producer] ${slot.name}: music (${slot.musicDuration}s)`);
      await produceMusicSegment(slot);

      // Insert advert after music every advertFrequency cycles
      if (slot.advertFrequency > 0 && cycleCount % slot.advertFrequency === 0) {
        console.log(`[producer] ${slot.name}: advert break (${slot.advertHumor})`);
        await produceAdvert(slot);
      }
    } else {
      // Every guestFrequency cycles, swap one DJ segment for a guest interview
      const doGuest = slot.guestFrequency > 0
        && cycleCount > 0
        && cycleCount % slot.guestFrequency === 0
        && djSegmentCount === 0; // only at the start of a DJ run

      if (doGuest) {
        await produceGuestSegment(slot);
        djSegmentCount++; // counts as one DJ slot
      } else {
        console.log(`[producer] ${slot.name}: DJ ${djSegmentCount + 1}/${slot.djPerMusic}`);
        await produceDJSegment(slot);
      }
    }
  }
}

export function startProducer() {
  loop().catch(err => console.error('[producer] Loop crashed:', err));
}
