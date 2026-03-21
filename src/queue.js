// Audio segment queue — FIFO list of MP3 file paths
// The stream player pulls from the front, content generators push to the back.

import { EventEmitter } from 'events';

class AudioQueue extends EventEmitter {
  constructor() {
    super();
    this.items = [];
    this.currentSegment = null;
  }

  push(segment) {
    // segment: { path, type, title, duration }
    this.items.push(segment);
    this.emit('push', segment);
  }

  shift() {
    const segment = this.items.shift();
    this.currentSegment = segment || null;
    return segment;
  }

  peek(index = 0) {
    return this.items[index] || null;
  }

  unshift(segment) {
    this.items.unshift(segment);
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
