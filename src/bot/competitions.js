// Competition engine — creates, runs, and draws competitions automatically.
// Competitions are triggered on a schedule (every N music cycles from producer).
// Winners' submissions become song prompt overrides or show theme inputs.

import {
  createCompetition, getOpenCompetition, getEntries,
  drawWinner, closeCompetition, addSongOverride,
} from '../db.js';

const COMPETITION_TYPES = [
  {
    type: 'song_prompt',
    title: '🎵 Prompt the next AI track!',
    description: 'Describe a sound, a feeling, a scene — the winner\'s words become the music prompt. Use /enter [your prompt] to enter.',
    duration_ms: 10 * 60 * 1000,
  },
  {
    type: 'theme',
    title: '🎙 Set the next show theme!',
    description: 'Suggest a theme, topic, or vibe for the next DJ segment. Most creative entry wins. Use /enter [your theme] to enter.',
    duration_ms: 8 * 60 * 1000,
  },
  {
    type: 'question',
    title: '❓ Ask the DJ anything!',
    description: 'Ask a question or pose a philosophical challenge. The winning question becomes part of the next monologue. Use /enter [your question] to enter.',
    duration_ms: 6 * 60 * 1000,
  },
  {
    type: 'priority_request',
    title: '⚡ Priority Track Request!',
    description: 'Describe your dream track — mood, genre, energy, instruments. The winning entry gets generated and played NEXT. Use /enter [your request] to enter.',
    duration_ms: 8 * 60 * 1000,
  },
  {
    type: 'poll',
    title: '📊 Hot Take Poll!',
    description: 'We\'re asking the big questions. Reply with your take — the most interesting answer gets read on air. Use /enter [your opinion] to enter.',
    duration_ms: 10 * 60 * 1000,
  },
  {
    type: 'shoutout_chain',
    title: '📣 Shoutout Chain!',
    description: 'Send a shoutout to someone — could be anyone, anywhere, for any reason. Best shoutout gets read live. Use /enter [your shoutout] to enter.',
    duration_ms: 5 * 60 * 1000,
  },
  {
    type: 'finish_the_sentence',
    title: '✍️ Finish the Sentence!',
    description: 'Complete this: "AI radio is better than human radio because..." Most creative answer wins. Use /enter [your answer] to enter.',
    duration_ms: 6 * 60 * 1000,
  },
  {
    type: 'name_the_show',
    title: '🏷 Name That Show!',
    description: 'If you could name a new radioGAGA show, what would you call it? Best name gets used. Use /enter [your show name] to enter.',
    duration_ms: 8 * 60 * 1000,
  },
];

let bot = null; // set by init()

export function init(botInstance) {
  bot = botInstance;
}

export async function launchCompetition(subscriberChatIds = []) {
  // Don't launch if one is already open
  const existing = getOpenCompetition();
  if (existing) return existing;

  const template = COMPETITION_TYPES[Math.floor(Math.random() * COMPETITION_TYPES.length)];
  const ends_at = new Date(Date.now() + template.duration_ms).toISOString();

  const result = createCompetition({
    type: template.type,
    title: template.title,
    description: template.description,
    ends_at,
  });
  const competition = { id: result.lastInsertRowid, ...template, ends_at };

  const minutes = Math.round(template.duration_ms / 60000);
  const announcement = `🔴 *radioGAGA COMPETITION*\n\n*${template.title}*\n\n${template.description}\n\n⏱ You have ${minutes} minutes. Type /enter followed by your submission.`;

  // Broadcast to all known subscribers
  for (const chatId of subscriberChatIds) {
    try {
      await bot?.api.sendMessage(chatId, announcement, { parse_mode: 'Markdown' });
    } catch {}
  }

  // Auto-draw after duration
  setTimeout(() => drawAndAnnounce(competition.id, subscriberChatIds), template.duration_ms);

  console.log(`[competition] Launched: "${template.title}" (${minutes}min, id:${competition.id})`);
  return competition;
}

export async function drawAndAnnounce(competition_id, subscriberChatIds = []) {
  const winner = drawWinner(competition_id);

  if (!winner) {
    console.log(`[competition] No entries for id:${competition_id}, closing.`);
    closeCompetition(competition_id);
    const msg = `🎲 The competition closed with no entries. Better luck next time!`;
    for (const chatId of subscriberChatIds) {
      try { await bot?.api.sendMessage(chatId, msg); } catch {}
    }
    return;
  }

  // Get competition type to know what to do with winning entry
  const entries = getEntries(competition_id);
  const comp = entries[0]; // we just need the type — get it from DB query if needed

  // Add winning song prompt to override queue
  if (winner.submission) {
    addSongOverride(winner.submission, winner.telegram_id, 'competition');
    console.log(`[competition] Winner: ${winner.username || winner.first_name} → "${winner.submission}"`);
  }

  const name = winner.username ? `@${winner.username}` : winner.first_name || 'a listener';
  const announcement = `🏆 *WINNER DRAWN!*\n\n${name} wins with:\n_"${winner.submission}"_\n\nThis will shape the next radioGAGA broadcast. Stay tuned! 🎙`;

  for (const chatId of subscriberChatIds) {
    try {
      await bot?.api.sendMessage(chatId, announcement, { parse_mode: 'Markdown' });
    } catch {}
  }
}
