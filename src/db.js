// SQLite database — stores listener interactions, suggestions, and competitions.
// File lives at data/radiogaga.db (auto-created on first run).

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'radiogaga.db');
mkdirSync(join(__dirname, '..', 'data'), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Add location column to existing DBs (no-op if already present)
try {
  db.exec(`ALTER TABLE listeners ADD COLUMN location TEXT`);
} catch (err) {
  // Expected: "duplicate column name" on subsequent runs — only warn on unexpected errors
  if (!err.message.includes('duplicate column')) {
    console.warn('[db] ALTER TABLE listeners failed:', err.message);
  }
}

// ── Schema ─────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS listeners (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT    UNIQUE NOT NULL,
    username    TEXT,
    first_name  TEXT,
    joined_at   TEXT    DEFAULT (datetime('now')),
    message_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    listener_id INTEGER REFERENCES listeners(id),
    text        TEXT    NOT NULL,
    type        TEXT    DEFAULT 'theme',  -- 'theme' | 'music' | 'topic'
    used        INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS competitions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL,         -- 'song_prompt' | 'theme' | 'question'
    title       TEXT    NOT NULL,
    description TEXT,
    status      TEXT    DEFAULT 'open',   -- 'open' | 'closed' | 'drawn'
    winner_id   INTEGER REFERENCES listeners(id),
    winning_entry TEXT,
    created_at  TEXT    DEFAULT (datetime('now')),
    ends_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER REFERENCES competitions(id),
    listener_id    INTEGER REFERENCES listeners(id),
    submission     TEXT,
    created_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(competition_id, listener_id)   -- one entry per listener per comp
  );

  CREATE TABLE IF NOT EXISTS song_queue_overrides (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt       TEXT    NOT NULL,
    submitted_by INTEGER REFERENCES listeners(id),
    source       TEXT    DEFAULT 'competition', -- 'competition' | 'suggestion'
    used         INTEGER DEFAULT 0,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS broadcast_history (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    type      TEXT    NOT NULL,
    title     TEXT,
    slot      TEXT,
    played_at TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Listener helpers ────────────────────────────────────────────────────────

export function upsertListener({ telegram_id, username, first_name, location }) {
  return db.prepare(`
    INSERT INTO listeners (telegram_id, username, first_name, location)
    VALUES (@telegram_id, @username, @first_name, @location)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username   = excluded.username,
      first_name = excluded.first_name,
      location   = COALESCE(excluded.location, listeners.location)
  `).run({ telegram_id: String(telegram_id), username, first_name, location: location || null });
}

export function setListenerLocation(telegram_id, location) {
  db.prepare(`UPDATE listeners SET location = ? WHERE telegram_id = ?`)
    .run(location, String(telegram_id));
}

export function getListener(telegram_id) {
  return db.prepare('SELECT * FROM listeners WHERE telegram_id = ?').get(String(telegram_id));
}

export function incrementMessageCount(telegram_id) {
  db.prepare('UPDATE listeners SET message_count = message_count + 1 WHERE telegram_id = ?')
    .run(String(telegram_id));
}

export function listenerCount() {
  return db.prepare('SELECT COUNT(*) as n FROM listeners').get().n;
}

// ── Suggestions ─────────────────────────────────────────────────────────────

export function addSuggestion(telegram_id, text, type = 'theme') {
  const listener = getListener(telegram_id);
  if (!listener) return null;
  return db.prepare(`
    INSERT INTO suggestions (listener_id, text, type) VALUES (?, ?, ?)
  `).run(listener.id, text, type);
}

// Fetch recent unused suggestions of a given type
export function getRecentSuggestions(type = 'theme', limit = 5) {
  return db.prepare(`
    SELECT s.text, l.first_name, l.location
    FROM suggestions s JOIN listeners l ON s.listener_id = l.id
    WHERE s.type = ? AND s.used = 0
    ORDER BY s.created_at DESC LIMIT ?
  `).all(type, limit);
}

export function markSuggestionUsed(id) {
  db.prepare('UPDATE suggestions SET used = 1 WHERE id = ?').run(id);
}

// ── Competitions ─────────────────────────────────────────────────────────────

export function createCompetition({ type, title, description, ends_at }) {
  return db.prepare(`
    INSERT INTO competitions (type, title, description, ends_at)
    VALUES (@type, @title, @description, @ends_at)
  `).run({ type, title, description: description || null, ends_at: ends_at || null });
}

export function getOpenCompetition() {
  return db.prepare(`
    SELECT * FROM competitions WHERE status = 'open'
    ORDER BY created_at DESC LIMIT 1
  `).get();
}

export function getAllOpenCompetitions() {
  return db.prepare(`SELECT * FROM competitions WHERE status = 'open'`).all();
}

export function addEntry(competition_id, telegram_id, submission) {
  const listener = getListener(telegram_id);
  if (!listener) return { error: 'listener_not_found' };
  try {
    db.prepare(`
      INSERT INTO entries (competition_id, listener_id, submission)
      VALUES (?, ?, ?)
    `).run(competition_id, listener.id, submission);
    return { ok: true };
  } catch {
    return { error: 'already_entered' };
  }
}

export function getEntries(competition_id) {
  return db.prepare(`
    SELECT e.*, l.username, l.first_name, l.telegram_id
    FROM entries e JOIN listeners l ON e.listener_id = l.id
    WHERE e.competition_id = ?
  `).all(competition_id);
}

export function drawWinner(competition_id) {
  const entries = getEntries(competition_id);
  if (!entries.length) return null;
  const winner = entries[Math.floor(Math.random() * entries.length)];
  db.prepare(`
    UPDATE competitions
    SET status = 'drawn', winner_id = ?, winning_entry = ?
    WHERE id = ?
  `).run(winner.listener_id, winner.submission, competition_id);
  return winner;
}

export function closeCompetition(competition_id) {
  db.prepare(`UPDATE competitions SET status = 'closed' WHERE id = ?`).run(competition_id);
}

// ── Song queue overrides ────────────────────────────────────────────────────

export function addSongOverride(prompt, telegram_id, source = 'competition') {
  const listener = getListener(telegram_id);
  return db.prepare(`
    INSERT INTO song_queue_overrides (prompt, submitted_by, source)
    VALUES (?, ?, ?)
  `).run(prompt, listener?.id || null, source);
}

export function getNextSongOverride() {
  return db.prepare(`
    SELECT * FROM song_queue_overrides WHERE used = 0
    ORDER BY created_at ASC LIMIT 1
  `).get();
}

export function markOverrideUsed(id) {
  db.prepare('UPDATE song_queue_overrides SET used = 1 WHERE id = ?').run(id);
}

// ── Broadcast history ────────────────────────────────────────────────────────

export function logBroadcast({ type, title, slot }) {
  db.prepare(`INSERT INTO broadcast_history (type, title, slot) VALUES (?, ?, ?)`)
    .run(type, title || null, slot || null);
}

export function getBroadcastHistory(limit = 30) {
  return db.prepare(`
    SELECT id, type, title, slot, played_at
    FROM broadcast_history
    ORDER BY played_at DESC LIMIT ?
  `).all(limit);
}

// ── Stats ───────────────────────────────────────────────────────────────────

export function getStats() {
  return {
    listeners:    listenerCount(),
    suggestions:  db.prepare('SELECT COUNT(*) as n FROM suggestions').get().n,
    competitions: db.prepare('SELECT COUNT(*) as n FROM competitions').get().n,
    entries:      db.prepare('SELECT COUNT(*) as n FROM entries').get().n,
  };
}

export default db;
