// RSS feed fetcher — pulls headlines from a mix of news, arts, and music feeds.
// Returns a flat array of { title, description, source } objects.

const FEEDS = [
  // Niche & weird
  { url: 'https://www.atlasobscura.com/feeds/latest', source: 'Atlas Obscura' },
  { url: 'https://www.mentalfloss.com/rss/all', source: 'Mental Floss' },
  { url: 'https://www.odditycentral.com/feed', source: 'Oddity Central' },
  { url: 'https://www.thevintagenews.com/feed/', source: 'Vintage News' },
  { url: 'https://www.iflscience.com/rss', source: 'IFL Science' },

  // Obscure international / local
  { url: 'https://www.thelocal.se/feeds/rss.php', source: 'The Local Sweden' },
  { url: 'https://www.thelocal.fr/feeds/rss.php', source: 'The Local France' },
  { url: 'https://www.thelocal.de/feeds/rss.php', source: 'The Local Germany' },
  { url: 'https://english.kyodonews.net/rss/all.xml', source: 'Kyodo News Japan' },
  { url: 'https://www.rfi.fr/en/rss', source: 'RFI English' },
  { url: 'https://www.dw.com/en/rss', source: 'Deutsche Welle' },
  { url: 'https://www.rnz.co.nz/rss/national.xml', source: 'RNZ New Zealand' },
  { url: 'https://www.abc.net.au/news/feed/51120/rss.xml', source: 'ABC Australia' },

  // Tech & AI culture
  { url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source: 'Ars Technica' },
  { url: 'https://www.wired.com/feed/rss', source: 'Wired' },
  { url: 'https://news.ycombinator.com/rss', source: 'Hacker News' },

  // Arts & culture
  { url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', source: 'BBC Arts' },
  { url: 'https://www.theguardian.com/music/rss', source: 'Guardian Music' },
  { url: 'https://www.theguardian.com/artanddesign/rss', source: 'Guardian Art' },
  { url: 'https://pitchfork.com/rss/news/', source: 'Pitchfork' },
  { url: 'https://www.theguardian.com/culture/rss', source: 'Guardian Culture' },

  // Science & nature
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

export async function fetchHeadlines(maxPerFeed = 3) {
  const results = await Promise.allSettled(FEEDS.map(f => fetchFeed(f)));
  const all = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value.slice(0, maxPerFeed))
    .filter(h => !isExcluded(h));

  // Shuffle so we don't always lead with BBC
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  console.log(`[rss] Fetched ${all.length} headlines (war/politics excluded)`);
  return all;
}
