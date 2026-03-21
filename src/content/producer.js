// Content producer — orchestrates the full content loop with schedule awareness.
//
// Ratio-aware scheduling:
//   A rolling 30-minute window tracks talk vs music time.  The producer
//   inserts DJ/banter segments when talk is below the show's talk_ratio
//   target (default 30%), and switches to music when it's at or above.
//   dj_per_music acts as a max-cap on consecutive DJ segments.
//   Every music track gets a mandatory spoken intro (with retry + fallback).
//   Every advertFrequency cycles, an advert follows the music.
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
import { getNextSongOverride, markOverrideUsed, getRecentSuggestions, markSuggestionUsed } from '../db.js';
import { getSubscribers } from '../bot/index.js';
import { launchCompetition } from '../bot/competitions.js';
import { startCatalogWorker, getFromCatalog, catalogSize } from './advertCatalog.js';
import { startArchiveWorker, getArchiveTrack, archivePoolSize } from './archiveMusic.js';
import { generateTrackIntro, generateTrackOutro } from './trackIntro.js';
import { generateGuestSegment } from './guest.js';
import { generateNewsBulletin } from './news.js';
import { generateWeatherForecast } from './weather.js';
import { generateAIAnnouncement } from './aiAnnouncement.js';
import { generateReportage } from './reportage.js';
import { existsSync } from 'node:fs';
import { getNextListenerAd, incrementAdPlayCount } from '../db.js';
import { initFoleyPool, startBedWorker } from './studioFx.js';

const POLL_INTERVAL_MS = 4000;
const HEADLINE_TTL_MS = 15 * 60 * 1000;
const EMERGENCY_BUFFER_S = 60; // pre-emptively pull from catalog if queue below this
const MAX_MUSIC_STREAK_S = 12 * 60; // force a talk segment if no talk in 12 minutes (guarantees talk every 15 min with buffer)

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

// Rolling talk-vs-music time tracker — decays over a sliding window so recent
// content weighs more than ancient history.  Used by the producer to hit the
// per-show talk_ratio target.
const RATIO_WINDOW_MS = 30 * 60 * 1000; // 30-minute sliding window
const ratioTracker = {
  entries: [],  // { type: 'talk'|'music', seconds, ts }

  add(type, seconds) {
    this.entries.push({ type, seconds, ts: Date.now() });
    this._prune();
  },

  _prune() {
    const cutoff = Date.now() - RATIO_WINDOW_MS;
    this.entries = this.entries.filter(e => e.ts >= cutoff);
  },

  talkRatio() {
    this._prune();
    if (!this.entries.length) return 0;
    let talk = 0, total = 0;
    for (const e of this.entries) {
      total += e.seconds;
      if (e.type === 'talk') talk += e.seconds;
    }
    return total > 0 ? talk / total : 0;
  },

  // Returns true when talk is below the target ratio
  needsMoreTalk(targetRatio) {
    return this.talkRatio() < targetRatio;
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
let lastTrackInfo = null; // { title, creator, mood } — for back-announce after track plays
let lastNewsHour = -1;   // prevent duplicate news per hour
let lastReportageHour = -1; // one reportage per hour
let lastTalkTime = Date.now(); // timestamp of last talk segment queued
let lastAIAnnouncementTime = 0; // timestamp of last AI announcement
const AI_ANNOUNCEMENT_INTERVAL_MS = 33 * 60 * 1000; // ~3% of airtime: one every 33 min
const COMPETITION_EVERY_N_CYCLES = 3; // more frequent competitions for engagement

async function refreshHeadlines() {
  const now = Date.now();
  if (now - lastHeadlineFetch > HEADLINE_TTL_MS) {
    headlines = await fetchHeadlines(4);
    lastHeadlineFetch = now;
  }
  return headlines;
}

async function produceDJSegment(slot) {
  let current = await refreshHeadlines();
  // If all headlines are used, generate from show's focus topics instead
  if (!current.length) {
    console.log('[producer] No fresh headlines — generating from show focus topics');
    current = slot.contentFocus.map(f => ({
      title: `Talk about something fascinating related to ${f}`,
      description: `Share an interesting thought, fact, or observation about ${f}`,
      source: 'radioGAGA topic generator',
    }));
  }

  // Inject listener suggestions into the slot context
  const suggestions = getRecentSuggestions('theme', 3);
  const slotWithSuggestions = suggestions.length
    ? { ...slot, listenerSuggestions: suggestions }
    : slot;

  const t0 = Date.now();
  const result = await generateDJSegment(current, slotWithSuggestions);
  const { script, title, headlines: used } = result;

  // Mark suggestions as used so they never repeat
  for (const s of suggestions) markSuggestionUsed(s.id);

  // Dialogue shows return a pre-rendered path (with studio bed already applied);
  // monologue shows need TTS + optional studio bed mixing.
  let path = result.path;
  if (!path) {
    // Use language-matched voice if foreign language segment, otherwise presenter voice
    const voice = result.lang ? result.lang.voice : slot.voice;
    if (result.lang) console.log(`[producer] DJ segment in ${result.lang.name}`);
    path = (await textToMp3(script, voice, { energy: slot.energy })).path;
    if (slot.studioBed) {
      const { mixStudioBed } = await import('./studioFx.js');
      const wordCount = script ? script.split(/\s+/).length : 150;
      path = await mixStudioBed(path, {
        durationS: Math.round(wordCount / 2.5),
        energy: slot.energy,
      });
    }
  }
  lagTracker.add('dj', Date.now() - t0);

  const talkSeconds = script ? script.split(/\s+/).length / 2.5 : 60;
  ratioTracker.add('talk', talkSeconds);

  queue.push({
    path, type: 'dj', title, script,
    slot: slot.id,
    sources: used.map(h => h.source),
    createdAt: new Date().toISOString(),
  });

  lastTalkTime = Date.now();
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

  // Back-announce for previous track (if we have one) — queued before the new intro
  if (lastTrackInfo) {
    try {
      const outro = await generateTrackOutro(slot, lastTrackInfo);
      const outroWords = outro.script ? outro.script.split(/\s+/).length : 30;
      ratioTracker.add('talk', outroWords / 2.5);
      queue.push({ ...outro, createdAt: new Date().toISOString() });
    } catch (err) {
      console.warn('[producer] Track outro failed:', err.message);
    }
  }

  // Pick the track first so the intro can name it
  const archiveTrack = archivePoolSize() > 5 ? getArchiveTrack() : null;

  let trackInfo;
  if (archiveTrack) {
    trackInfo = { title: archiveTrack.title, creator: archiveTrack.creator, mood };
  } else {
    trackInfo = { title: `AI Music — ${mood.split(',')[0]}`, creator: 'radioGAGA AI', mood };
  }

  // Track intro is MANDATORY — every track must be introduced.
  // Retry once on failure; if it still fails, generate a minimal fallback intro.
  let introQueued = false;
  for (let attempt = 0; attempt < 2 && !introQueued; attempt++) {
    try {
      const intro = await generateTrackIntro({ ...slot, musicMood: mood }, trackInfo);
      const introWords = intro.script ? intro.script.split(/\s+/).length : 30;
      ratioTracker.add('talk', introWords / 2.5);
      queue.push({ ...intro, createdAt: new Date().toISOString() });
      introQueued = true;
    } catch (err) {
      console.warn(`[producer] Track intro attempt ${attempt + 1} failed:`, err.message);
    }
  }
  if (!introQueued) {
    // Minimal fallback — at least say something before the track
    const fallbackText = trackInfo.title.startsWith('AI Music')
      ? `Here's something fresh for you on radioGAGA.`
      : `Coming up now, ${trackInfo.title} by ${trackInfo.creator}.`;
    try {
      const { path } = await textToMp3(fallbackText, slot.voice, { energy: slot.energy });
      ratioTracker.add('talk', fallbackText.split(/\s+/).length / 2.5);
      queue.push({
        path, type: 'dj',
        title: `Fallback intro — ${trackInfo.title}`,
        slot: slot.id,
        createdAt: new Date().toISOString(),
      });
      console.log('[producer] Fallback intro queued');
    } catch (err) {
      console.error('[producer] Even fallback intro failed:', err.message);
    }
  }

  if (archiveTrack) {
    console.log(`[producer] Archive track: ${archiveTrack.title}`);
    ratioTracker.add('music', archiveTrack.duration || slot.musicDuration);
    queue.push({
      ...archiveTrack,
      type: 'music',
      slot: slot.id,
      createdAt: new Date().toISOString(),
    });
    lastTrackInfo = trackInfo;
    lagTracker.add('music', Date.now() - t0);
  } else {
    // Archive pool low or empty — generate locally with MusicGen
    console.log(`[producer] Archive pool low (${archivePoolSize()}), generating with MusicGen`);
    try {
      const segment = await generateMusic({ slot: overrideSlot, duration: slot.musicDuration });
      lagTracker.add('music', Date.now() - t0);
      ratioTracker.add('music', segment.duration || slot.musicDuration);
      queue.push({ ...segment, slot: slot.id, createdAt: new Date().toISOString() });
      lastTrackInfo = trackInfo;
    } catch (err) {
      console.error('[producer] Music generation failed, skipping:', err.message);
      lastTrackInfo = null;
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
    lastTalkTime = Date.now();
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
    lastTalkTime = Date.now();
    console.log(`[producer] News bulletin queued: ${bulletin.title}`);

    // Follow news with weather forecast
    try {
      const weather = await generateWeatherForecast();
      queue.push(weather);
      console.log(`[producer] Weather queued: ${weather.title}`);
    } catch (err) {
      console.error('[producer] Weather failed:', err.message);
    }

    // Close news block with radioGAGA Sting
    if (bulletin.closingSting && existsSync(bulletin.closingSting)) {
      queue.push({
        path: bulletin.closingSting,
        type: 'jingle',
        title: 'radioGAGA Sting',
        duration: 29,
        generator: 'pre-produced',
        source: 'ai-generated-jingle',
      });
      console.log('[producer] News closing sting queued');
    }
  } catch (err) {
    console.error('[producer] News failed:', err.message);
  }
}

async function produceAdvert(slot) {
  // Prioritise listener-submitted ads over AI-generated ones
  try {
    const listenerAd = getNextListenerAd();
    if (listenerAd && listenerAd.approved_audio_path && existsSync(listenerAd.approved_audio_path)) {
      incrementAdPlayCount(listenerAd.id);
      queue.push({
        path: listenerAd.approved_audio_path,
        type: 'advert',
        title: `Sponsored: ${listenerAd.business_name} — ${listenerAd.product}`,
        slot: slot.id,
        generator: 'listener-submitted',
        source: 'listener-advert',
      });
      console.log(`[producer] Listener ad queued: ${listenerAd.business_name}`);
      return;
    }
  } catch (err) {
    // Fall through to AI-generated ad
  }

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
  await initFoleyPool();
  startBedWorker();

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

    // Hourly news bulletin — fires within first 5 minutes of each hour
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    if (currentMinute < 5 && currentHour !== lastNewsHour) {
      console.log(`[producer] Scheduling ${currentHour}:00 news bulletin`);
      produceNewsBulletin().catch(() => {});
    }

    // Hourly reportage — fires mid-hour (minutes 20-25), one per hour
    if (currentMinute >= 20 && currentMinute < 25 && currentHour !== lastReportageHour) {
      lastReportageHour = currentHour;
      console.log(`[producer] Scheduling reportage for ${slot.name}`);
      (async () => {
        try {
          const reportage = await generateReportage(slot, headlines);
          queue.push(reportage);
          lastTalkTime = Date.now();
          console.log(`[producer] Reportage queued: ${reportage.title}`);
        } catch (err) {
          console.error('[producer] Reportage failed:', err.message);
        }
      })();
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

    // Ratio-aware scheduling: use the rolling talk ratio to decide whether
    // to produce talk or music.  dj_per_music acts as a max-cap on consecutive
    // DJ segments (prevents runaway talk if generation is fast).
    //
    // Rules:
    //   1. If we've hit the DJ cap → play music (with mandatory intro).
    //   2. If talk ratio is below the show's target AND we haven't hit the cap → talk.
    //   3. Otherwise → play music.
    const currentRatio = ratioTracker.talkRatio();
    const talkOverdue = Date.now() - lastTalkTime >= MAX_MUSIC_STREAK_S * 1000;
    const wantsTalk = (ratioTracker.needsMoreTalk(slot.talkRatio) || talkOverdue)
                      && djSegmentCount < slot.djPerMusic;

    // Force talk if it's been more than 12 minutes — guarantees talk every ~15 min
    if (talkOverdue) {
      console.log(`[producer] Talk overdue (${Math.round((Date.now() - lastTalkTime) / 60000)}min since last) — forcing DJ/guest segment`);
    }

    try {
      if (!talkOverdue && (djSegmentCount >= slot.djPerMusic || !wantsTalk)) {
        // Time for music
        console.log(`[producer] ${slot.name}: music (${slot.musicDuration}s) [talk ratio: ${(currentRatio * 100).toFixed(0)}%/${(slot.talkRatio * 100).toFixed(0)}%]`);
        await produceMusicSegment(slot);

        // Insert advert after music every advertFrequency cycles
        if (slot.advertFrequency > 0 && cycleCount % slot.advertFrequency === 0) {
          console.log(`[producer] ${slot.name}: advert break (${slot.advertHumor})`);
          await produceAdvert(slot);
        }

        // AI announcement — ~3% airtime, one every ~33 minutes
        if (Date.now() - lastAIAnnouncementTime >= AI_ANNOUNCEMENT_INTERVAL_MS) {
          try {
            const announcement = await generateAIAnnouncement();
            queue.push(announcement);
            lastAIAnnouncementTime = Date.now();
            console.log(`[producer] AI announcement queued: ${announcement.title}`);
          } catch (err) {
            console.error('[producer] AI announcement failed:', err.message);
          }
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
          console.log(`[producer] ${slot.name}: DJ ${djSegmentCount + 1}/${slot.djPerMusic} [talk ratio: ${(currentRatio * 100).toFixed(0)}%/${(slot.talkRatio * 100).toFixed(0)}%]`);
          await produceDJSegment(slot);
        }
      }
    } catch (err) {
      console.error(`[producer] Content generation failed (will retry next cycle): ${err.message}`);
      // Wait a bit before retrying to avoid tight error loops
      await new Promise(r => setTimeout(r, 15_000));
    }
  }
}

export function startProducer() {
  loop().catch(err => {
    console.error('[producer] Loop crashed:', err);
    // Auto-restart after 30s
    console.log('[producer] Restarting in 30s...');
    setTimeout(() => startProducer(), 30_000);
  });
}
