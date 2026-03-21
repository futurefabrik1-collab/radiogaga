// radioGAGA — entry point
// Starts: API server, content producer, stream loop, Telegram bot

import 'dotenv/config';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.js';
import { startProducer } from './content/producer.js';
import { startStream, stopStream } from './stream.js';
import { startBot, stopBot } from './bot/index.js';
import { startClipper } from './clipper.js';
import { startBufferPoster } from './buffer.js';
import { startProducerBrain } from './producer-brain.js';
import db from './db.js';

console.log('🎙 radioGAGA starting...');

startServer();
startProducer();
startStream();
startBot();
startClipper();
startBufferPoster();
startProducerBrain();

// Periodic tmp cleanup — remove audio files older than 1 hour
// Protects the $12 droplet from disk fill. Runs every 30 minutes.
function cleanupTmp() {
  const dirs = ['tmp/audio', 'tmp/shouts'].map(d => join(process.cwd(), d));
  const maxAge = 60 * 60 * 1000; // 1 hour
  let cleaned = 0;
  for (const dir of dirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (f === '.gitkeep') continue;
        const fp = join(dir, f);
        try {
          const age = Date.now() - statSync(fp).mtimeMs;
          if (age > maxAge) { unlinkSync(fp); cleaned++; }
        } catch {}
      }
    } catch {}
  }
  if (cleaned > 0) console.log(`[cleanup] Removed ${cleaned} stale tmp files`);
}
setInterval(cleanupTmp, 30 * 60 * 1000);
setTimeout(cleanupTmp, 60_000); // first run 1 min after start

// Graceful shutdown — stop stream (kills FFmpeg), close DB, then exit
function shutdown(signal) {
  console.log(`\n[main] ${signal} received, shutting down...`);
  stopBot();
  stopStream();
  try { db.close(); } catch {}
  // Allow 2s for FFmpeg to terminate, then force exit
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
