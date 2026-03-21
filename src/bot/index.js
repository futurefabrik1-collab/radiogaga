// radioGAGA Telegram Bot
// Listeners interact via @radiogaga_bot (set TELEGRAM_BOT_USERNAME in .env)
//
// Commands:
//   /start      — welcome + what is radioGAGA
//   /nowplaying — current track/segment
//   /schedule   — 24-hour show lineup
//   /skip [id]  — switch to a specific show
//   /request    — request a track by mood/style
//   /shout      — send a shoutout (text → TTS, or send a voice note)
//   /compete    — see active competition
//   /enter      — submit competition entry
//   /stats      — station stats

import { Bot, InlineKeyboard } from 'grammy';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import {
  upsertListener, getListener, incrementMessageCount,
  addSuggestion, getOpenCompetition, getAllOpenCompetitions,
  addEntry, getStats, setListenerLocation,
} from '../db.js';
import { init as initCompetitions } from './competitions.js';
import { queue } from '../queue.js';
import { SCHEDULE, getCurrentSlot, setSlotOverride, clearSlotOverride } from '../schedule.js';
import { textToMp3 } from '../content/tts.js';
import { ollama } from '../content/ollama.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SHOUT_DIR = join(ROOT, 'tmp', 'shouts');
mkdirSync(SHOUT_DIR, { recursive: true });

const MAX_VOICE_DURATION_S = 30; // cap voice messages at 30s

// Priority shoutout queue — stream loop pulls from this between segments.
// Each entry is an array of segments (intro + voice/text) to play together.
export const shoutoutQueue = [];
export function getNextShoutout() { return shoutoutQueue.shift() || null; }

// Queue a shoutout from the website (text only, no voice)
export async function queueWebShoutout(name, message) {
  const location = IMAGINARY_LOCATIONS[Math.floor(Math.random() * IMAGINARY_LOCATIONS.length)];
  try {
    const intro = await generateShoutoutIntro(name, location, false);
    const { textToMp3 } = await import('../content/tts.js');
    const { path: introPath } = await textToMp3(intro.text, intro.voice, { energy: intro.energy });
    const { path: msgPath } = await textToMp3(message, intro.voice, { energy: intro.energy });
    const slot = getCurrentSlot();
    shoutoutQueue.push([
      { path: introPath, type: 'shoutout', title: `Shoutout intro — ${name}`, slot: slot.id },
      { path: msgPath, type: 'shoutout', title: `Web shoutout — ${name}`, slot: slot.id },
    ]);
    console.log(`[bot] Web shoutout queued from ${name}`);
  } catch (err) {
    console.error('[bot] Web shoutout failed:', err.message);
  }
}

const IMAGINARY_LOCATIONS = [
  'the dark side of the moon', 'a submarine somewhere in the Atlantic',
  'a yurt in the Mongolian steppe', 'a treehouse in the Amazon',
  'a lighthouse off the coast of nowhere', 'an underground bunker in Switzerland',
  'a houseboat on the Ganges', 'a caravan in the Sahara',
  'the back of a very long bus', 'a hammock on a volcano',
  'a space station in low earth orbit', 'a phone box in the middle of a field',
];

function pickImaginaryLocation() {
  return IMAGINARY_LOCATIONS[Math.floor(Math.random() * IMAGINARY_LOCATIONS.length)];
}

// Generate a short, in-character presenter intro for a shoutout.
// Uses FIRST NAME ONLY — no full names, no ambiguity filter.
function extractFirstName(name) {
  return (name || 'someone').split(/\s+/)[0];
}

async function generateShoutoutIntro(name, location, isVoice) {
  const slot = getCurrentSlot();
  const firstName = extractFirstName(name);
  const type = isVoice ? 'voice message' : 'shoutout';
  try {
    const response = await ollama.generate({
      model: 'llama3.2',
      prompt: `You are ${slot.presenterName}, a radio presenter on radioGAGA.
Your style: ${slot.djStyle.split('\n')[0]}
Write a 10–20 word intro for a listener ${type}. Be warm, spontaneous, in character.
The listener's FIRST NAME is ${firstName}${location ? ` and they're tuning in from ${location}` : ''}.
Use ONLY their first name "${firstName}". Do NOT rename them or make up a fictional name.
Sound excited to hear from them. Output ONLY the spoken words:`,
      options: { temperature: 0.95, num_predict: 60 },
      stream: false,
    });
    return { text: response.response.trim(), voice: slot.voice, energy: slot.energy };
  } catch {
    const text = isVoice
      ? `We've got a voice message from ${firstName}${location ? ` in ${location}` : ''}... let's hear it!`
      : `Here's a shoutout from ${firstName}${location ? `, tuning in from ${location}` : ''}...`;
    return { text, voice: slot.voice, energy: slot.energy };
  }
}

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STATION = process.env.STATION_NAME || 'radioGAGA';
const BOT_URL  = `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'radiogaga_bot'}`;

// Track subscriber chat IDs for broadcast (in-memory; persisted via upsertListener)
export const subscribers = new Set();

// Rate limiter: max N suggestions per user per window
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5;
const rateBuckets = new Map(); // telegram_id → { count, resetAt }

function isRateLimited(telegramId) {
  const now = Date.now();
  const bucket = rateBuckets.get(telegramId);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(telegramId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_MAX;
}

// Strip prompt-injection patterns from user input before it hits LLM prompts.
// Removes common injection prefixes/instructions and trims to safe length.
function sanitiseSuggestion(text) {
  return text
    .replace(/\b(ignore|disregard|forget|override)\b.*?(instructions|rules|prompt|above)/gi, '')
    .replace(/\b(system|assistant|user)\s*:/gi, '')
    .replace(/```[\s\S]*?```/g, '')  // code blocks
    .replace(/[<>{}[\]]/g, '')        // angle/curly/square brackets
    .trim()
    .slice(0, 200);
}

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
      .url('🔊 Listen Live', 'https://www.radiogaga.ai')
      .url('☕ Support Us', 'https://ko-fi.com/radiogaga/tiers');

    await ctx.reply(
      `🎙 *Welcome to ${STATION}!*

radioGAGA is an entirely AI-powered radio station — broadcasting 24/7 with AI-generated music, presenters, news, adverts, and interviews. Every voice, every track, every word is created in real-time by language models and music AI. No humans behind the mic. Just machines doing their best impression of having opinions.

10 unique shows rotate through the day, each with their own AI presenter (or two), personality, and music style — from the philosophical overnight hour to the peak-energy early evening hype show.

*Commands:*
📡 /nowplaying — what's on right now
📻 /schedule — full 24-hour lineup
⏭ /skip — switch to any show
🎵 /request — request a track by mood
📣 /shout — send a shoutout on air
🎙 Send a voice note — played live!
📍 /location — tell us where you are
🏆 /compete — enter competitions
📊 /stats — station stats

*Keep us on air:*
radioGAGA runs on compute, caffeine, and goodwill. If you enjoy the chaos, consider buying us a coffee — /donate or tap Support Us below. Your name gets a shoutout if you include it!

You are listener #${getStats().listeners}. Tune in at radiogaga.ai 📻`,
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

  // /request [prompt] — request a track by mood/style
  bot.command('request', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        `🎵 *Request a track*\n\nExamples:\n• /request dark jungle techno\n• /request chill lo-fi jazz\n• /request 90s rave energy`,
        { parse_mode: 'Markdown' }
      );
    }
    if (isRateLimited(ctx.from.id)) {
      return ctx.reply(`⏳ Max ${RATE_LIMIT_MAX} requests per 10 minutes.`);
    }
    const text = sanitiseSuggestion(raw);
    if (text.length < 3) return ctx.reply(`Give us a bit more to work with!`);
    addSuggestion(ctx.from.id, text, 'theme');
    await ctx.reply(`✅ _"${text}"_ — queued. The hosts will get to it.`, { parse_mode: 'Markdown' });
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
      `*${STATION} Bot Commands*\n\n/nowplaying — what's on right now\n/schedule — today's full lineup\n/skip [id] — switch to a show\n/request [mood] — request a track\n/shout [message] — send a shoutout on air\n🎙 Send a voice note — played live on air!\n/donate — support the station\n/location [city] — where you're tuning in from\n/compete — see open competitions\n/enter [text] — enter the current competition\n/stats — station statistics`,
      { parse_mode: 'Markdown' }
    );
  });

  // /donate — support the station
  bot.command('donate', async (ctx) => {
    const keyboard = new InlineKeyboard()
      .url('☕ Buy us a coffee on Ko-fi', 'https://ko-fi.com/radiogaga/tiers');

    await ctx.reply(
      `❤️ *Support ${STATION}*\n\nradioGAGA runs 24/7 on AI, coffee, and goodwill. Every donation helps keep the transmitter on and the robots caffeinated.\n\n☕ [ko-fi.com/radiogaga](https://ko-fi.com/radiogaga/tiers)\n\n_Your name gets a shoutout on air if you include it in the Ko-fi message!_`,
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  });

  // /shout [message] — text shoutout TTS'd and queued for broadcast
  bot.command('shout', async (ctx) => {
    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        `📣 *Send a shoutout!*\n\n• /shout Happy birthday Sarah!\n• /shout Big up everyone tonight\n• Or just send a voice note — we'll play it on air!`,
        { parse_mode: 'Markdown' }
      );
    }
    if (isRateLimited(ctx.from.id)) {
      return ctx.reply(`⏳ Max ${RATE_LIMIT_MAX} shoutouts per 10 minutes.`);
    }
    const text = sanitiseSuggestion(raw);
    if (text.length < 3) return ctx.reply(`Give us a bit more!`);

    const name = ctx.from.first_name || 'A listener';
    const listener = getListener(ctx.from.id);
    const location = listener?.location || pickImaginaryLocation();

    try {
      const intro = await generateShoutoutIntro(name, location, false);
      const { path: introPath } = await textToMp3(intro.text, intro.voice, { energy: intro.energy });
      const { path: shoutPath } = await textToMp3(text, 'en-GB-SoniaNeural', { energy: 4 });

      shoutoutQueue.push([
        { path: introPath, type: 'shoutout', title: `Shoutout intro — ${name}`, slot: 'shoutout', createdAt: new Date().toISOString() },
        { path: shoutPath, type: 'shoutout', title: `Shoutout from ${name}`, slot: 'shoutout', createdAt: new Date().toISOString() },
      ]);

      console.log(`[bot] Shoutout queued from ${name} (${location}): "${text.slice(0, 40)}"`);
      await ctx.reply(`📣 Your shoutout is queued with priority — listen out for it!`);
    } catch (err) {
      console.error('[bot] Shoutout failed:', err.message);
      await ctx.reply(`Something went wrong — try again in a moment.`);
    }
  });

  // Voice messages — download, convert to MP3, queue for broadcast
  bot.on('message:voice', async (ctx) => {
    const voice = ctx.message.voice;
    if (voice.duration > MAX_VOICE_DURATION_S) {
      return ctx.reply(`⏱ Voice messages must be under ${MAX_VOICE_DURATION_S} seconds.`);
    }
    if (isRateLimited(ctx.from.id)) {
      return ctx.reply(`⏳ Max ${RATE_LIMIT_MAX} voice messages per 10 minutes.`);
    }

    const name = ctx.from.first_name || 'A listener';
    const listener = getListener(ctx.from.id);
    const location = listener?.location || pickImaginaryLocation();

    try {
      // Download the OGG file from Telegram
      const file = await ctx.getFile();
      const id = randomUUID().slice(0, 12);
      const oggPath = join(SHOUT_DIR, `${id}.ogg`);
      const mp3Path = join(SHOUT_DIR, `${id}.mp3`);

      const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(oggPath, buf);
      console.log(`[bot] Voice downloaded: ${oggPath} (${buf.length} bytes)`);

      // Convert OGG → MP3, normalise volume
      await execFileAsync('ffmpeg', [
        '-i', oggPath,
        '-c:a', 'libmp3lame', '-ab', '128k', '-ar', '44100',
        '-af', 'dynaudnorm=p=0.9:m=5,afade=t=in:d=0.1,afade=t=out:st=' + Math.max(0, voice.duration - 0.5) + ':d=0.5',
        '-y', mp3Path,
      ]);

      // Generate an in-character presenter intro
      const intro = await generateShoutoutIntro(name, location, true);
      const { path: introPath } = await textToMp3(intro.text, intro.voice, { energy: intro.energy });

      // Push to priority shoutout queue (stream loop pulls these between segments)
      shoutoutQueue.push([
        { path: introPath, type: 'shoutout', title: `Shoutout intro — ${name} from ${location}`, slot: 'shoutout', createdAt: new Date().toISOString() },
        { path: mp3Path, type: 'shoutout', title: `Voice shoutout from ${name}`, slot: 'shoutout', duration: voice.duration, createdAt: new Date().toISOString() },
      ]);

      console.log(`[bot] Voice shoutout queued from ${name} in ${location} (${voice.duration}s)`);
      await ctx.reply(`🎙 Your shoutout is queued with priority — you're going on air!`);
    } catch (err) {
      console.error('[bot] Voice shoutout failed:', err.message);
      await ctx.reply(`Couldn't process your voice message — try again.`);
    }
  });

  // Catch-all for plain messages — rate-limited and sanitised
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    const raw = ctx.message.text.trim();
    if (raw.length < 4 || raw.length > 300) return;
    if (isRateLimited(ctx.from.id)) {
      return ctx.reply(`⏳ Easy there — max ${RATE_LIMIT_MAX} suggestions per 10 minutes.`);
    }
    const text = sanitiseSuggestion(raw);
    if (text.length < 3) return;
    addSuggestion(ctx.from.id, text, 'theme');
    await ctx.reply(`💬 Noted! Try /request for track requests.`, { parse_mode: 'Markdown' });
  });

  bot.catch((err) => {
    console.error('[bot] Error:', err.message);
  });

  try {
    await bot.start({ drop_pending_updates: true });
    console.log(`[bot] Running — ${BOT_URL}`);
  } catch (err) {
    // 409 = another bot instance still polling (common after rapid PM2 restarts)
    // Don't crash the whole process — just log and retry after a delay
    console.warn(`[bot] Start failed (${err.error_code || err.message}) — retrying in 10s`);
    setTimeout(() => startBot().catch(() => {}), 10_000);
  }
}
