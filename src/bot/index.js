// radioGAGA Telegram Bot
// Listeners interact via @radiogaga_bot (set TELEGRAM_BOT_USERNAME in .env)
//
// Commands:
//   /start      — welcome + what is radioGAGA
//   /nowplaying — current track/segment
//   /schedule   — 24-hour show lineup
//   /skip [id]  — switch to a specific show
//   /suggest    — suggest a theme or topic
//   /compete    — see active competition
//   /enter      — submit competition entry
//   /stats      — station stats

import { Bot, InlineKeyboard } from 'grammy';
import {
  upsertListener, getListener, incrementMessageCount,
  addSuggestion, getOpenCompetition, getAllOpenCompetitions,
  addEntry, getStats, setListenerLocation,
} from '../db.js';
import { init as initCompetitions } from './competitions.js';
import { queue } from '../queue.js';
import { SCHEDULE, setSlotOverride, clearSlotOverride } from '../schedule.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STATION = process.env.STATION_NAME || 'radioGAGA';
const BOT_URL  = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'radiogaga_bot'}`;

// Track subscriber chat IDs for broadcast (in-memory; persisted via upsertListener)
export const subscribers = new Set();

let bot = null;

export function getBot() { return bot; }
export function getSubscribers() { return [...subscribers]; }

// ── Middleware ───────────────────────────────────────────────────────────────

function requireToken() {
  if (!TOKEN || TOKEN === 'your_token_here') {
    console.warn('[bot] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return false;
  }
  return true;
}

// ── Start ────────────────────────────────────────────────────────────────────

export async function startBot() {
  if (!requireToken()) return;

  bot = new Bot(TOKEN);
  initCompetitions(bot);

  // Register every messaging user
  bot.use(async (ctx, next) => {
    if (ctx.from) {
      upsertListener({
        telegram_id: ctx.from.id,
        username:    ctx.from.username,
        first_name:  ctx.from.first_name,
      });
      incrementMessageCount(ctx.from.id);
      subscribers.add(ctx.chat?.id || ctx.from.id);
    }
    await next();
  });

  // /start
  bot.command('start', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text('🎵 Now Playing', 'nowplaying')
      .text('🏆 Competition', 'compete').row()
      .url('🔊 Listen Live', 'https://www.radiogaga.ai');

    await ctx.reply(
      `🎙 *Welcome to ${STATION}!*\n\nAn AI-powered radio station broadcasting 24/7 — entirely generated music, dialogue, news, and adverts.\n\n*What you can do:*\n• 🎧 Listen at radiogaga.ai\n• 📻 Browse shows with /schedule\n• ⏭ Switch shows with /skip\n• 💡 Suggest themes with /suggest\n• 📍 Tell us where you're from with /location\n• 🏆 Win competitions to prompt our next song\n• 📡 Check what's on with /nowplaying\n\nYou are listener #${getStats().listeners}. Make yourself at home.`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // /nowplaying
  bot.command('nowplaying', async (ctx) => {
    const np = queue.nowPlaying();
    if (!np) {
      return ctx.reply('📻 Warming up the transmitter... try again in a moment.');
    }
    const type = np.type === 'music' ? '🎵 AI Music' : np.type === 'advert' ? '📢 Ad break' : '🎙 DJ';
    const slot = np.slot ? ` · ${np.slot}` : '';
    await ctx.reply(
      `*Now on ${STATION}*\n\n${type}${slot}\n_${np.title}_\n\n🔊 Listen: radiogaga.ai`,
      { parse_mode: 'Markdown' }
    );
  });

  // Inline button handler for nowplaying
  bot.callbackQuery('nowplaying', async (ctx) => {
    const np = queue.nowPlaying();
    const type = np?.type === 'music' ? '🎵 AI Music' : np?.type === 'advert' ? '📢 Ad break' : '🎙 DJ';
    await ctx.answerCallbackQuery(np ? `${type}: ${np.title?.slice(0, 40)}` : 'Starting up...');
  });

  // /suggest [theme]
  bot.command('suggest', async (ctx) => {
    const text = ctx.match?.trim();
    if (!text) {
      return ctx.reply(
        `💡 *Suggest a theme, topic, or mood*\n\nExamples:\n• /suggest the loneliness of late-night cities\n• /suggest something about AI and creativity\n• /suggest dark jazz vibes\n\nYour suggestion may influence the next DJ segment or music style.`,
        { parse_mode: 'Markdown' }
      );
    }
    addSuggestion(ctx.from.id, text, 'theme');
    await ctx.reply(`✅ Got it! _"${text}"_ is in the mix. The hosts may pick it up in a future segment.`, { parse_mode: 'Markdown' });
  });

  // /compete
  bot.command('compete', async (ctx) => {
    const comps = getAllOpenCompetitions();
    if (!comps.length) {
      return ctx.reply(`🎲 No competitions open right now — check back soon!\n\nCompetitions run regularly. When one opens you can enter with /enter.`);
    }
    for (const comp of comps) {
      const ends = comp.ends_at ? `\n⏱ Closes: ${new Date(comp.ends_at).toLocaleTimeString()}` : '';
      await ctx.reply(
        `🏆 *${comp.title}*\n\n${comp.description}${ends}`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // Inline button for compete
  bot.callbackQuery('compete', async (ctx) => {
    const comp = getOpenCompetition();
    await ctx.answerCallbackQuery(comp ? comp.title : 'No competition open right now');
  });

  // /enter [submission]
  bot.command('enter', async (ctx) => {
    const submission = ctx.match?.trim();
    const comp = getOpenCompetition();

    if (!comp) {
      return ctx.reply(`No competition is open right now. Check /compete for updates.`);
    }
    if (!submission) {
      return ctx.reply(
        `📝 *${comp.title}*\n\n${comp.description}\n\nSend: /enter [your submission]`,
        { parse_mode: 'Markdown' }
      );
    }

    const result = addEntry(comp.id, ctx.from.id, submission);
    if (result.error === 'already_entered') {
      return ctx.reply(`You've already entered this competition! Good luck 🤞`);
    }

    await ctx.reply(
      `🎉 Entry received!\n\n_"${submission}"_\n\nGood luck! Winner announced soon.`,
      { parse_mode: 'Markdown' }
    );
  });

  // /stats
  bot.command('stats', async (ctx) => {
    const s = getStats();
    await ctx.reply(
      `📊 *${STATION} Stats*\n\n👂 Listeners: ${s.listeners}\n💡 Suggestions: ${s.suggestions}\n🏆 Competitions run: ${s.competitions}\n📝 Total entries: ${s.entries}`,
      { parse_mode: 'Markdown' }
    );
  });

  // /location [city]
  bot.command('location', async (ctx) => {
    const city = ctx.match?.trim();
    if (!city) {
      return ctx.reply(`📍 Tell us where you're tuning in from!\n\nSend: /location [your city]\nExample: /location Tokyo\n\nWe'll mention you by first name and city if your suggestion goes on air.`);
    }
    setListenerLocation(ctx.from.id, city);
    await ctx.reply(`📍 Got it — you're tuning in from *${city}*. The hosts will know where to send the shoutout.`, { parse_mode: 'Markdown' });
  });

  // /schedule — show the full 24-hour lineup
  bot.command('schedule', async (ctx) => {
    const lines = SCHEDULE.map(s => {
      const start = String(s.hours[0]).padStart(2, '0') + ':00';
      const end   = String(s.hours[s.hours.length - 1] + 1).padStart(2, '0') + ':00';
      const hosts = s.coHost ? `${s.presenterName} & ${s.coHost.name}` : s.presenterName;
      return `*${start}–${end}* ${s.name}\n_${hosts}_`;
    }).join('\n\n');

    await ctx.reply(
      `📻 *${STATION} — Today's Schedule*\n\n${lines}\n\nSwitch shows: /skip [show-id]`,
      { parse_mode: 'Markdown' }
    );
  });

  // /skip [show-id] — switch to a specific show
  bot.command('skip', async (ctx) => {
    const id = ctx.match?.trim().toLowerCase();

    if (id === 'reset') {
      clearSlotOverride();
      queue.clear();
      return ctx.reply(`✅ Returned to scheduled programming.`);
    }

    if (!id) {
      const list = SCHEDULE.map(s => {
        const start = String(s.hours[0]).padStart(2, '0') + ':00';
        return `• \`${s.id}\` — ${s.name} (from ${start})`;
      }).join('\n');
      return ctx.reply(
        `📻 *Available Shows*\n\nSend /skip [show-id] to switch:\n\n${list}`,
        { parse_mode: 'Markdown' }
      );
    }

    const ok = setSlotOverride(id, 60);
    if (!ok) {
      return ctx.reply(`❌ Show not found. Send /skip to see the list.`);
    }
    queue.clear();
    const slot = SCHEDULE.find(s => s.id === id);
    console.log(`[bot] Skip command → ${slot.name} by ${ctx.from?.username || ctx.from?.first_name}`);
    await ctx.reply(
      `✅ Switching to *${slot.name}* now.\n_Valid for 60 minutes. Send /skip reset to return to schedule._`,
      { parse_mode: 'Markdown' }
    );
  });

  // /help
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `*${STATION} Bot Commands*\n\n/nowplaying — what's on right now\n/schedule — today's full lineup\n/skip [id] — switch to a show\n/suggest [theme] — suggest a topic or vibe\n/location [city] — tell us where you're tuning in from\n/compete — see open competitions\n/enter [text] — enter the current competition\n/stats — station statistics\n/start — welcome message`,
      { parse_mode: 'Markdown' }
    );
  });

  // Catch-all for plain messages
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    // Treat freeform messages as theme suggestions
    const text = ctx.message.text.trim();
    if (text.length > 3 && text.length < 300) {
      addSuggestion(ctx.from.id, text, 'theme');
      await ctx.reply(`💬 Noted! I've passed _"${text.slice(0, 60)}..."_ to the producers.`, { parse_mode: 'Markdown' });
    }
  });

  bot.catch((err) => {
    console.error('[bot] Error:', err.message);
  });

  await bot.start({ drop_pending_updates: true });
  console.log(`[bot] Running — ${BOT_URL}`);
}
