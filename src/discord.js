// Discord integration — posts twice per day (morning + evening).

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
let lastPostDate = '';
let postsToday = 0;
const MAX_POSTS_PER_DAY = 2;
const POST_HOURS = [8, 19]; // 8am and 7pm

const EMOJI = {
  dj: '🎙',
  music: '🎵',
  advert: '📢',
  news: '📰',
  weather: '🌤',
  guest: '🎤',
  shoutout: '📣',
  jingle: '📻',
};

export async function postNowPlaying(segment, showName, presenterName) {
  if (!WEBHOOK_URL) return;

  // Reset counter daily
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastPostDate) { postsToday = 0; lastPostDate = today; }

  // Only post at designated hours, max 2/day
  const hour = new Date().getHours();
  if (postsToday >= MAX_POSTS_PER_DAY || !POST_HOURS.includes(hour)) return;
  const showChanged = showName !== lastPostedShow;
  if (!showChanged) return;

  lastPostedShow = showName;
  postsToday++;

  const emoji = EMOJI[segment.type] || '●';
  const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

  const embed = {
    title: showChanged ? `📻 Now on air: ${showName}` : `${emoji} ${segment.title?.slice(0, 80) || 'Live on radioGAGA'}`,
    description: showChanged
      ? `${presenterName} is on the mic. Tune in at **radiogaga.ai**`
      : segment.type === 'music'
        ? `Now playing on radioGAGA`
        : segment.type === 'news'
          ? `Positive news only — every hour on radioGAGA`
          : `Live on radioGAGA`,
    color: showChanged ? 0xFFD700 : segment.type === 'news' ? 0xFF6B6B : segment.type === 'music' ? 0x66CCFF : 0xFFD700,
    footer: { text: `${now} London · radiogaga.ai · 100% AI Generated` },
    url: 'https://www.radiogaga.ai',
  };

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'radioGAGA',
        embeds: [embed],
      }),
    });
  } catch (err) {
    console.warn('[discord] Webhook failed:', err.message);
  }
}
