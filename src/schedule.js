// Schedule loader — reads schedule.yaml and exposes helpers for the producer.
// Edit schedule.yaml to change show configs. Restart backend to reload.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = join(__dirname, '..', 'schedule.yaml');

function loadSchedule() {
  try {
    const raw = readFileSync(YAML_PATH, 'utf8');
    const { shows } = yaml.load(raw);

    // Normalise YAML shape → internal shape used by producer/dj/music
    return shows.map(s => ({
      id:           s.id,
      name:         s.name,
      hours:        s.hours,
      energy:       s.energy,

      // presenter
      presenterName: s.presenter?.name || 'the presenter',
      voice:        s.presenter?.voice || 'en-GB-RyanNeural',
      djStyle:      (s.presenter?.style || '').trim(),

      // co-host (optional)
      coHost: s.presenter?.co_host ? {
        name:  s.presenter.co_host.name,
        voice: s.presenter.co_host.voice,
      } : null,

      // guests
      guestFrequency: s.guests?.frequency ?? 0, // every N music cycles, 0 = disabled

      // content
      contentFocus: s.content?.focus || [],
      djWordCount:  s.content?.word_count || 150,
      abstract:     s.content?.abstract ?? false,
      humor:        s.content?.humor || 'light',

      // music
      musicMood:    s.music?.mood || 'ambient electronic',
      musicDuration: s.music?.duration || 30,
      djPerMusic:   s.music?.dj_per_music || 2,
      talkRatio:    s.music?.talk_ratio ?? 0.30,

      // studio atmosphere
      studioBed:    s.studio?.bed ?? true,

      // adverts
      advertFrequency: s.adverts?.frequency ?? 4,
      advertHumor:  s.adverts?.humor || s.content?.humor || 'light',
      advertMusicBed: s.adverts?.music_bed ?? false,
    }));
  } catch (err) {
    console.error('[schedule] Failed to load schedule.yaml:', err.message);
    process.exit(1);
  }
}

export const SCHEDULE = loadSchedule();

let slotOverride = null;
let overrideClearsAt = null;

// Manually force a show — auto-expires after durationMinutes (default: end of that show's last hour)
export function setSlotOverride(id, durationMinutes = 60) {
  const slot = SCHEDULE.find(s => s.id === id);
  if (!slot) return false;
  slotOverride = id;
  overrideClearsAt = Date.now() + durationMinutes * 60 * 1000;
  console.log(`[schedule] Manual override → ${slot.name} for ${durationMinutes}min`);
  return true;
}

export function clearSlotOverride() {
  slotOverride = null;
  overrideClearsAt = null;
}

export function getCurrentSlot() {
  // Check if override is active and not expired
  if (slotOverride && overrideClearsAt && Date.now() < overrideClearsAt) {
    const override = SCHEDULE.find(s => s.id === slotOverride);
    if (override) return override;
  }
  slotOverride = null;
  const hour = new Date().getHours();
  return SCHEDULE.find(s => s.hours.includes(hour)) || SCHEDULE[0];
}

export function getSlot(id) {
  return SCHEDULE.find(s => s.id === id) || getCurrentSlot();
}

export function logSchedule() {
  console.log('\n[schedule] 24-hour broadcast schedule (from schedule.yaml):');
  SCHEDULE.forEach(s => {
    const start = String(s.hours[0]).padStart(2, '0') + ':00';
    const end   = String(s.hours[s.hours.length - 1] + 1).padStart(2, '0') + ':00';
    const flags = [
      `talk:${Math.round(s.talkRatio * 100)}%`,
      s.abstract ? 'abstract' : '',
      `humor:${s.advertHumor}`,
      s.advertFrequency > 0 ? `ads/~${s.advertFrequency}` : 'no-ads',
    ].filter(Boolean).join(' ');
    console.log(`  ${start}–${end}  ${s.name.padEnd(18)} e:${s.energy}  ${s.djWordCount}w  music:${s.musicDuration}s  ${flags}`);
  });
  console.log('');
}
