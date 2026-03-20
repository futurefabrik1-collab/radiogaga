// Express API server — frontend polls this for now-playing info.

import express from 'express';
import { queue } from './queue.js';
import { getStats, getBroadcastHistory } from './db.js';
import { catalogStats } from './content/advertCatalog.js';
import { archivePoolSize } from './content/archiveMusic.js';
import { SCHEDULE, setSlotOverride, clearSlotOverride, getCurrentSlot } from './schedule.js';

const PORT = 3000;

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Current playing info
app.get('/api/now-playing', (req, res) => {
  const status = queue.status();
  const np = status.nowPlaying;
  res.json({
    nowPlaying: np ? { type: np.type, title: np.title, slot: np.slot } : null,
    queued: status.queued,
    upcoming: status.upcoming,
    currentShow: getCurrentSlot().id,
  });
});

// List all shows
app.get('/api/shows', (req, res) => {
  res.json(SCHEDULE.map(s => ({
    id: s.id,
    name: s.name,
    hours: s.hours,
    energy: s.energy,
    presenterName: s.presenterName,
    coHost: s.coHost?.name || null,
  })));
});

// Skip to a specific show — clears queue so new content generates immediately
app.post('/api/skip/:id', (req, res) => {
  const { id } = req.params;
  const ok = setSlotOverride(id, parseInt(req.body?.duration) || 60);
  if (!ok) return res.status(404).json({ error: 'Show not found' });
  queue.clear();
  const slot = SCHEDULE.find(s => s.id === id);
  console.log(`[server] Skip → ${slot.name}`);
  res.json({ ok: true, show: slot.name });
});

// Return to scheduled show
app.post('/api/skip/reset', (req, res) => {
  clearSlotOverride();
  queue.clear();
  res.json({ ok: true });
});

// Station stats
app.get('/api/stats', (req, res) => {
  res.json({ ...getStats(), adverts: catalogStats(), archiveTracks: archivePoolSize() });
});

// Broadcast history — last 30 played segments
app.get('/api/history', (req, res) => {
  res.json(getBroadcastHistory(30));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

export function startServer() {
  app.listen(PORT, () => {
    console.log(`[server] API running at http://localhost:${PORT}`);
  });
}
