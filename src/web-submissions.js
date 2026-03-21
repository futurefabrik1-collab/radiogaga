// Web submission handlers — bridges website forms to the existing
// shoutout queue and suggestion system used by the Telegram bot.

import { addSuggestion } from './db.js';
import { queueWebShoutout } from './bot/index.js';

export function addWebSuggestion(name, prompt) {
  // Store as a theme suggestion with a web- prefixed pseudo-ID
  const pseudoId = `web-${Date.now()}`;
  addSuggestion(pseudoId, prompt, 'theme');
}

export function addWebShoutout(name, message) {
  queueWebShoutout(name, message);
}
