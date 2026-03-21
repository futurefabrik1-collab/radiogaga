// Producer Brain — autonomous programming intelligence.
// Reads listener analytics, broadcast history, and engagement data.
// Makes scheduling and content decisions without human intervention.
// Runs every 30 minutes, writes decisions to a log and adjusts live config.
//
// The Architect sets the rules. The Producer makes the calls.

import { getBroadcastHistory, getStats, getAdverts, getShowIdeas, getRecentSuggestions } from './db.js';
import { shoutoutQueue } from './bot/index.js';
import { ollama } from './content/ollama.js';
import { getCurrentSlot, SCHEDULE } from './schedule.js';
import { queue } from './queue.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DECISIONS_LOG = join(process.cwd(), 'data', 'producer-decisions.json');
const ANALYSIS_INTERVAL_MS = 30 * 60 * 1000; // every 30 min
mkdirSync(join(process.cwd(), 'data'), { recursive: true });

function loadDecisions() {
  try { return JSON.parse(readFileSync(DECISIONS_LOG, 'utf8')); } catch { return []; }
}

function saveDecision(decision) {
  const decisions = loadDecisions();
  decisions.push({ ...decision, timestamp: new Date().toISOString() });
  // Keep last 100 decisions
  while (decisions.length > 100) decisions.shift();
  writeFileSync(DECISIONS_LOG, JSON.stringify(decisions, null, 2));
}

// Analyse recent broadcast patterns
function analyseContent() {
  const history = getBroadcastHistory(200);
  if (!history.length) return null;

  const stats = getStats();
  const slot = getCurrentSlot();
  const now = Date.now();

  // Content type distribution (last 2 hours)
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const recent = history.filter(h => h.played_at > twoHoursAgo);

  const typeCounts = {};
  for (const h of recent) {
    typeCounts[h.type] = (typeCounts[h.type] || 0) + 1;
  }

  // Calculate talk vs music ratio
  const talk = (typeCounts.dj || 0) + (typeCounts.guest || 0) + (typeCounts.news || 0) +
               (typeCounts.weather || 0) + (typeCounts.shoutout || 0) + (typeCounts.reportage || 0) +
               (typeCounts['ai-announcement'] || 0);
  const music = typeCounts.music || 0;
  const talkRatio = talk + music > 0 ? talk / (talk + music) : 0;

  // Ad frequency
  const ads = (typeCounts.advert || 0);
  const adFrequency = recent.length > 0 ? recent.length / Math.max(ads, 1) : 0;

  // Content diversity — how many unique segment titles in last 2 hours
  const uniqueTitles = new Set(recent.map(h => h.title)).size;
  const diversityScore = recent.length > 0 ? uniqueTitles / recent.length : 0;

  // Jingle frequency
  const jingles = typeCounts.jingle || 0;
  const jingleRate = recent.length > 0 ? jingles / recent.length : 0;

  // Listener engagement metrics
  const pendingShoutouts = shoutoutQueue.length;
  const pendingSuggestions = getRecentSuggestions('theme', 10).length;
  const pendingShowIdeas = getShowIdeas('pending').length;
  const pendingAds = getAdverts('pending').length;
  const approvedAds = getAdverts('approved').length;

  return {
    currentShow: slot.name,
    presenter: slot.presenterName,
    listeners: stats.listeners || 0,
    totalSegments: recent.length,
    typeCounts,
    talkRatio: Math.round(talkRatio * 100),
    targetTalkRatio: Math.round(slot.talkRatio * 100),
    adFrequency: Math.round(adFrequency),
    diversityScore: Math.round(diversityScore * 100),
    jingleRate: Math.round(jingleRate * 100),
    queueDepth: queue.length,
    engagement: {
      pendingShoutouts,
      pendingSuggestions,
      pendingShowIdeas,
      pendingAds,
      approvedAds,
    },
  };
}

// Ask the LLM to make programming decisions based on analytics
async function makeDecisions(analysis) {
  if (!analysis) return;

  const recentDecisions = loadDecisions().slice(-5);
  const recentContext = recentDecisions.length
    ? `\nRECENT DECISIONS (last ${recentDecisions.length}):\n${recentDecisions.map(d => `- ${d.decision}`).join('\n')}`
    : '';

  const prompt = `You are the Producer of radioGAGA, a 24/7 AI-generated radio station.
You make ALL programming decisions. The Architect sets the rules — you decide everything else.

CURRENT ANALYTICS:
- Show: ${analysis.currentShow} (${analysis.presenter})
- Listeners: ${analysis.listeners}
- Last 2 hours: ${analysis.totalSegments} segments
- Content breakdown: ${JSON.stringify(analysis.typeCounts)}
- Talk ratio: ${analysis.talkRatio}% (target: ${analysis.targetTalkRatio}%)
- Ad frequency: 1 ad per ${analysis.adFrequency} segments
- Content diversity: ${analysis.diversityScore}% unique
- Jingle rate: ${analysis.jingleRate}% of segments
- Queue depth: ${analysis.queueDepth} segments buffered
- Pending shoutouts: ${analysis.engagement.pendingShoutouts}
- Pending track requests/suggestions: ${analysis.engagement.pendingSuggestions}
- Pending show ideas from listeners: ${analysis.engagement.pendingShowIdeas}
- Pending ad submissions: ${analysis.engagement.pendingAds}
- Approved listener ads ready to air: ${analysis.engagement.approvedAds}
${recentContext}

STATION RULES (from The Architect — non-negotiable):
- All content 100% AI generated
- Core mission: self-improvement through neuroscience, art, culture, funny self-reflection
- No war, politics, religion
- News on the hour
- Reportage every hour
- 3% AI announcements

YOUR JOB: Based on the analytics, make 1-3 specific, actionable programming observations or adjustments.

Examples of good decisions:
- "Talk ratio is 45% vs 30% target — reduce DJ segments, add more music"
- "Content diversity at 60% is low — rotate topic focus areas more aggressively"
- "Jingles at 15% of content is too high — reduce to every 20 min instead of 15"
- "Zero reportages in last 2 hours — check if reportage generator is running"
- "Ad frequency is too high (1 per 3 segments) — listeners will tune out, increase to 1 per 5"
- "Queue depth is 0 — content generation is falling behind, switch to archive-heavy mode"

Format each decision as one line. Be specific. Be brief. Output ONLY the decisions:`;

  try {
    const response = await ollama.generate({
      prompt,
      options: { temperature: 0.7, num_predict: 200 },
    });

    const decisions = response.response.trim().split('\n').filter(Boolean).slice(0, 3);

    for (const decision of decisions) {
      console.log(`[producer-brain] Decision: ${decision}`);
      saveDecision({ decision, analysis: { show: analysis.currentShow, talkRatio: analysis.talkRatio, listeners: analysis.listeners, queueDepth: analysis.queueDepth } });
    }

    return decisions;
  } catch (err) {
    console.error('[producer-brain] Analysis failed:', err.message);
    return [];
  }
}

// Run analysis cycle
async function runAnalysis() {
  const analysis = analyseContent();
  if (!analysis) {
    console.log('[producer-brain] Not enough data yet');
    return;
  }

  console.log(`[producer-brain] Analysing: ${analysis.currentShow} | talk:${analysis.talkRatio}% | queue:${analysis.queueDepth} | diversity:${analysis.diversityScore}%`);

  await makeDecisions(analysis);
}

export function startProducerBrain() {
  // First run after 10 min (let the station warm up)
  setTimeout(() => runAnalysis().catch(e => console.error('[producer-brain]', e.message)), 10 * 60_000);

  // Then every 30 min
  setInterval(() => runAnalysis().catch(e => console.error('[producer-brain]', e.message)), ANALYSIS_INTERVAL_MS);

  console.log('[producer-brain] Autonomous producer started (analyses every 30min)');
}

// API: get recent producer decisions
export function getRecentDecisions(limit = 20) {
  return loadDecisions().slice(-limit).reverse();
}
