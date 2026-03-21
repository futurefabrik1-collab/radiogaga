// RSS feed fetcher — pulls headlines from a mix of news, arts, and music feeds.
// Returns a flat array of { title, description, source } objects.

const FEEDS = [
  // ── Satirical & comedy ────────────────────────────────────────────────────
  { url: 'https://www.theonion.com/rss', source: 'The Onion' },
  { url: 'https://clickhole.com/feed/', source: 'ClickHole' },
  { url: 'https://reductress.com/feed/', source: 'Reductress' },
  { url: 'https://thehardtimes.net/feed/', source: 'The Hard Times' },
  { url: 'https://hard-drive.net/feed/', source: 'Hard Drive' },
  { url: 'https://www.thedailymash.co.uk/feed', source: 'The Daily Mash' },
  { url: 'https://defector.com/rss', source: 'Defector' },
  { url: 'https://aftermath.site/rss', source: 'Aftermath' },
  { url: 'https://www.404media.co/rss/', source: '404 Media' },
  { url: 'https://www.newyorker.com/feed/humor', source: 'New Yorker Humor' },
  { url: 'https://chaser.com.au/feed/', source: 'The Chaser' },
  { url: 'https://www.newsthump.com/feed/', source: 'NewsThump' },
  { url: 'https://babylonbee.com/feed', source: 'Babylon Bee' },

  // ── Niche & weird ─────────────────────────────────────────────────────────
  { url: 'https://www.atlasobscura.com/feeds/latest', source: 'Atlas Obscura' },
  { url: 'https://www.odditycentral.com/feed', source: 'Oddity Central' },
  { url: 'https://www.thevintagenews.com/feed/', source: 'Vintage News' },
  { url: 'https://www.livescience.com/feeds/all', source: 'Live Science' },

  // ── Obscure international / local ─────────────────────────────────────────
  { url: 'https://www.thelocal.se/feeds/rss.php', source: 'The Local Sweden' },
  { url: 'https://www.thelocal.fr/feeds/rss.php', source: 'The Local France' },
  { url: 'https://www.thelocal.de/feeds/rss.php', source: 'The Local Germany' },
  { url: 'https://www.rfi.fr/en/rss', source: 'RFI English' },
  { url: 'https://rss.dw.com/rdf/rss-en-all', source: 'Deutsche Welle' },
  { url: 'https://www.rnz.co.nz/rss/national.xml', source: 'RNZ New Zealand' },
  { url: 'https://www.abc.net.au/news/feed/51120/rss.xml', source: 'ABC Australia' },
  { url: 'https://mainichi.jp/english/rss/etc/nationalnews.rss', source: 'Mainichi Japan' },

  // ── Random local outlets from around the world ────────────────────────────
  { url: 'https://www.bangkokpost.com/rss/data/most-recent.xml', source: 'Bangkok Post' },
  { url: 'https://www.irishtimes.com/cmlink/the-irish-times-news-1.1319192', source: 'Irish Times' },
  { url: 'https://www.jamaicaobserver.com/feed/', source: 'Jamaica Observer' },
  { url: 'https://www.scmp.com/rss/91/feed', source: 'South China Morning Post' },
  { url: 'https://www.dailymaverick.co.za/rss/', source: 'Daily Maverick' },
  { url: 'https://balkaninsight.com/feed/', source: 'Balkan Insight' },
  { url: 'https://www.france24.com/en/middle-east/rss', source: 'France 24 Middle East' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  { url: 'https://www.taipeitimes.com/xml/index.rss', source: 'Taipei Times' },
  { url: 'https://mexiconewsdaily.com/feed/', source: 'Mexico News Daily' },
  { url: 'https://www.dailystar.co.uk/news/?service=rss', source: 'Daily Star UK' },

  // ── Tech & AI culture ─────────────────────────────────────────────────────
  { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source: 'Ars Technica' },
  { url: 'https://www.wired.com/feed/rss', source: 'Wired' },
  { url: 'https://news.ycombinator.com/rss', source: 'Hacker News' },

  // ── Arts & culture ────────────────────────────────────────────────────────
  { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', source: 'BBC Arts' },
  { url: 'https://www.theguardian.com/music/rss', source: 'Guardian Music' },
  { url: 'https://www.theguardian.com/artanddesign/rss', source: 'Guardian Art' },
  { url: 'https://pitchfork.com/rss/news/', source: 'Pitchfork' },
  { url: 'https://www.theguardian.com/culture/rss', source: 'Guardian Culture' },

  // ── Science & nature ──────────────────────────────────────────────────────
  { url: 'https://www.sciencedaily.com/rss/all.xml', source: 'Science Daily' },
  { url: 'https://www.newscientist.com/feed/home/', source: 'New Scientist' },
];

function parseItems(xml, source) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
  const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/;

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = titleRegex.exec(block);
    const descMatch = descRegex.exec(block);

    const title = (titleMatch?.[1] || titleMatch?.[2] || '').trim();
    const description = (descMatch?.[1] || descMatch?.[2] || '')
      .replace(/<[^>]+>/g, '')  // strip HTML tags
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim()
      .slice(0, 200);

    if (title) items.push({ title, description, source });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'radioGAGA/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseItems(xml, feed.source);
  } catch (err) {
    console.warn(`[rss] Failed to fetch ${feed.source}: ${err.message}`);
    return [];
  }
}

// Keywords that indicate war or politics content — excluded from the station.
const EXCLUDED_KEYWORDS = [
  'war', 'warfare', 'military', 'troops', 'soldier', 'missile', 'bomb', 'airstrike',
  'nuclear', 'weapon', 'battlefield', 'invasion', 'ceasefire', 'ukraine', 'gaza',
  'israel', 'hamas', 'hezbollah', 'taliban', 'isis', 'conflict zone',
  'election', 'vote', 'voting', 'ballot', 'parliament', 'congress', 'senate',
  'president', 'prime minister', 'chancellor', 'minister', 'government',
  'republican', 'democrat', 'labour', 'conservative', 'political party',
  'sanctions', 'nato', 'un security council', 'diplomacy', 'treaty',
];

function isExcluded(headline) {
  const text = `${headline.title} ${headline.description}`.toLowerCase();
  return EXCLUDED_KEYWORDS.some(kw => text.includes(kw));
}

// Track used headlines — persisted to disk so they survive PM2 restarts.
// Each entry has a timestamp. Headlines older than 24h are pruned on load.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const USED_FILE = join(process.cwd(), 'data', 'used-headlines.json');
const USED_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours — allows headlines to recirculate faster
let usedHeadlines = new Map(); // title → timestamp

// Load from disk on startup
try {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  const raw = JSON.parse(readFileSync(USED_FILE, 'utf8'));
  const now = Date.now();
  for (const [title, ts] of Object.entries(raw)) {
    if (now - ts < USED_MAX_AGE_MS) usedHeadlines.set(title, ts);
  }
  console.log(`[rss] Loaded ${usedHeadlines.size} used headlines from disk`);
} catch {
  // First run or corrupt file — start fresh
}

function persistUsed() {
  try {
    writeFileSync(USED_FILE, JSON.stringify(Object.fromEntries(usedHeadlines)));
  } catch {}
}

export function markHeadlineUsed(headline) {
  usedHeadlines.set(headline.title.toLowerCase().trim(), Date.now());
}

export function markHeadlinesUsed(headlines) {
  for (const h of headlines) markHeadlineUsed(h);
  persistUsed(); // save to disk after each batch
}

function isUsed(headline) {
  const key = headline.title.toLowerCase().trim();
  const ts = usedHeadlines.get(key);
  if (!ts) return false;
  if (Date.now() - ts > USED_MAX_AGE_MS) {
    usedHeadlines.delete(key);
    return false;
  }
  return true;
}

export async function fetchHeadlines(maxPerFeed = 3) {
  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  const all = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.slice(0, maxPerFeed))
    .filter(h => !isExcluded(h))
    .filter(h => !isUsed(h)); // exclude already-used headlines

  // Shuffle so we don't always lead with BBC
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  console.log(`[rss] Fetched ${all.length} headlines (${usedHeadlines.size} used, war/politics excluded)`);
  return all;
}
