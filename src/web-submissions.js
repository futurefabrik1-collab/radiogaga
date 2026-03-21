// Web submission handlers — bridges website forms to the existing
// shoutout queue and suggestion system used by the Telegram bot.

import db from './db.js';
import { queueWebShoutout } from './bot/index.js';

export function addWebSuggestion(name, prompt) {
  // Insert directly into suggestions without a listener_id (nullable FK)
  // The old approach used a fake telegram_id which failed the FK constraint
  db.prepare(`
    INSERT INTO suggestions (listener_id, text, type) VALUES (NULL, ?, ?)
  `).run(`[web: ${name || 'anonymous'}] ${prompt}`, 'theme');
}

export function addWebShoutout(name, message) {
  queueWebShoutout(name, message);
}
