// Express API server — frontend polls this for now-playing info.

import express from 'express';
import { queue } from './queue.js';
import { getStats, getBroadcastHistory, getProvenanceLog, getProvenanceCount, submitShowIdea, submitAdvert, logDonation, getTotalDonations, getRecentDonations } from './db.js';
import { addWebSuggestion, addWebShoutout } from './web-submissions.js';
import { catalogStats } from './content/advertCatalog.js';
import { archivePoolSize } from './content/archiveMusic.js';
import { SCHEDULE, setSlotOverride, clearSlotOverride, getCurrentSlot } from './schedule.js';

const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth middleware for admin/mutation endpoints
function requireAuth(req, res, next) {
  if (!API_TOKEN) return next(); // auth disabled if no token configured
  const header = req.headers.authorization;
  if (header === `Bearer ${API_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

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

// Return to scheduled show — must be registered before the :id param route
app.post('/api/skip/reset', requireAuth, (req, res) => {
  clearSlotOverride();
  queue.clear();
  res.json({ ok: true });
});

// Skip to a specific show — clears queue so new content generates immediately
app.post('/api/skip/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (id.length > 40) return res.status(400).json({ error: 'Invalid show ID' });
  const ok = setSlotOverride(id, parseInt(req.body?.duration) || 60);
  if (!ok) return res.status(404).json({ error: 'Show not found' });
  queue.clear();
  const slot = SCHEDULE.find(s => s.id === id);
  console.log(`[server] Skip → ${slot.name}`);
  res.json({ ok: true, show: slot.name });
});

// Station stats
app.get('/api/stats', (req, res) => {
  res.json({ ...getStats(), adverts: catalogStats(), archiveTracks: archivePoolSize() });
});

// Broadcast history — last N played segments (default 30, max 500)
app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 500);
  res.json(getBroadcastHistory(limit));
});

// Full provenance log — public proof that all content is AI-generated
app.get('/api/provenance', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const offset = parseInt(req.query.offset) || 0;
  const rows = getProvenanceLog(limit, offset);
  const total = getProvenanceCount();
  res.json({ total, offset, limit, entries: rows });
});

// Show idea submission
app.post('/api/show-idea', (req, res) => {
  const { show_name, presenter_name, presenter_style, music_mood, energy, humor, time_slot, submitter_name, submitter_email } = req.body;
  if (!show_name || !presenter_name || !presenter_style || !music_mood) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    submitShowIdea({ show_name, presenter_name, presenter_style, music_mood, energy, humor, time_slot, submitter_name, submitter_email });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listener advert submission
app.post('/api/advert', (req, res) => {
  const { business_name, product, description, tone, target_audience, website, submitter_name } = req.body;
  if (!business_name || !product || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    submitAdvert({ business_name, product, description: description.slice(0, 500), tone, target_audience, website, submitter_name });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Web shoutout submission
app.post('/api/shoutout', (req, res) => {
  const { name, message } = req.body;
  if (!message || message.length < 1) return res.status(400).json({ error: 'Message required' });
  try {
    addWebShoutout(name || 'Anonymous', message.slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Web track request submission
app.post('/api/request', (req, res) => {
  const { name, prompt } = req.body;
  if (!prompt || prompt.length < 1) return res.status(400).json({ error: 'Prompt required' });
  try {
    addWebSuggestion(name || 'A listener', prompt.slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ko-fi webhook — receives donation/subscription notifications
// Ko-fi sends POST with form-encoded body containing a 'data' field with JSON
app.post('/api/kofi-webhook', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const payload = JSON.parse(req.body.data || '{}');

    // Verify token matches (set KOFI_VERIFICATION_TOKEN in .env)
    const expectedToken = process.env.KOFI_VERIFICATION_TOKEN;
    if (expectedToken && payload.verification_token !== expectedToken) {
      console.warn('[kofi] Invalid verification token');
      return res.status(403).json({ error: 'Invalid token' });
    }

    const amount = parseFloat(payload.amount) || 0;
    if (amount <= 0) return res.status(200).json({ ok: true }); // ignore zero amounts

    logDonation({
      kofi_tx_id: payload.kofi_transaction_id,
      from_name: payload.from_name,
      amount,
      currency: payload.currency || 'GBP',
      message: payload.message,
      type: payload.type, // Donation, Subscription, Shop Order
      tier_name: payload.tier_name,
      is_subscription: payload.is_subscription_payment,
      email: payload.email,
    });

    console.log(`[kofi] ${payload.type}: £${amount} from ${payload.from_name}${payload.tier_name ? ` (${payload.tier_name})` : ''}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[kofi] Webhook error:', err.message);
    res.status(400).json({ error: 'Bad payload' });
  }
});

// Recent donations (public — no emails)
app.get('/api/donations', (req, res) => {
  res.json(getRecentDonations(20));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Live cost tracker (all amounts in EUR)
// Droplet: €12/mo, Domain: €10/mo, LLM: OpenRouter estimated from token usage
// Build cost: one-time AI development token spend (Claude Code sessions)
const LAUNCH_DATE = new Date('2026-03-19T00:00:00Z'); // station launch
const DROPLET_MONTHLY_EUR = 12;   // DigitalOcean $12 ≈ €11, round to €12
const DOMAIN_MONTHLY_EUR = 10;    // domain annual cost amortised monthly
const BUILD_COST_EUR = 45;        // one-time Claude Code token cost to build the station
const OPENROUTER_INPUT_PER_M = 0.59;  // $/M input tokens (llama-3.3-70b)
const OPENROUTER_OUTPUT_PER_M = 0.79; // $/M output tokens

app.get('/api/costs', (req, res) => {
  const now = new Date();
  const uptimeMs = now - LAUNCH_DATE;
  const uptimeDays = uptimeMs / (1000 * 60 * 60 * 24);
  const uptimeMonths = uptimeDays / 30.44;

  // Fixed infra cost accrued so far
  const infraCost = uptimeMonths * DROPLET_MONTHLY_EUR;
  const domainCost = uptimeMonths * DOMAIN_MONTHLY_EUR;

  // Estimate LLM cost from broadcast history count (rough: ~1100 tokens per segment)
  const totalSegments = getProvenanceCount();
  const estInputTokens = totalSegments * 800;
  const estOutputTokens = totalSegments * 300;
  const llmCost = (estInputTokens / 1_000_000) * OPENROUTER_INPUT_PER_M
                + (estOutputTokens / 1_000_000) * OPENROUTER_OUTPUT_PER_M;

  const totalCost = infraCost + domainCost + llmCost + BUILD_COST_EUR;

  // Donations — pulled live from DB (fed by Ko-fi webhook)
  const donations = getTotalDonations();

  res.json({
    totalCost: parseFloat(totalCost.toFixed(4)),
    infraCost: parseFloat(infraCost.toFixed(4)),
    domainCost: parseFloat(domainCost.toFixed(4)),
    llmCost: parseFloat(llmCost.toFixed(4)),
    buildCost: BUILD_COST_EUR,
    donations,
    deficit: parseFloat((totalCost - donations).toFixed(4)),
    uptimeDays: parseFloat(uptimeDays.toFixed(2)),
    totalSegments,
    launchDate: LAUNCH_DATE.toISOString(),
  });
});

export function startServer() {
  app.listen(PORT, () => {
    console.log(`[server] API running at http://localhost:${PORT}`);
  });
}
