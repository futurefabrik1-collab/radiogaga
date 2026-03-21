// Audio segment queue — FIFO list with disk persistence.
// Survives PM2 restarts so pre-generated content isn't lost.

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const QUEUE_PATH = join(process.cwd(), 'data', 'queue.json');
mkdirSync(join(process.cwd(), 'data'), { recursive: true });

class AudioQueue extends EventEmitter {
  constructor() {
    super();
    this.currentSegment = null;
    // Load persisted queue
    try {
      this.items = JSON.parse(readFileSync(QUEUE_PATH, 'utf8'));
      if (this.items.length) console.log(`[queue] Restored ${this.items.length} segments from disk`);
    } catch {
      this.items = [];
    }
  }

  _persist() {
    // Debounced write — only persist serialisable segments (path, type, title, duration, script)
    try {
      const serialisable = this.items.map(s => ({
        path: s.path, type: s.type, title: s.title,
        duration: s.duration, slot: s.slot, script: s.script,
        voice: s.voice, generator: s.generator, source: s.source,
      }));
      writeFileSync(QUEUE_PATH, JSON.stringify(serialisable));
    } catch {}
  }

  push(segment) {
    this.items.push(segment);
    this.emit('push', segment);
    this._persist();
  }

  shift() {
    const segment = this.items.shift();
    this.currentSegment = segment || null;
    this._persist();
    return segment;
  }

  peek(index = 0) {
    return this.items[index] || null;
  }

  unshift(segment) {
    this.items.unshift(segment);
    this._persist();
  }

  get length() {
    return this.items.length;
  }

  nowPlaying() {
    return this.currentSegment;
  }

  clear() {
    this.items = [];
    this.emit('clear');
    this._persist();
  }

  status() {
    return {
      nowPlaying: this.currentSegment,
      queued: this.items.length,
      upcoming: this.items.slice(0, 3).map(s => ({ type: s.type, title: s.title })),
    };
  }
}

export const queue = new AudioQueue();
