// radioGAGA — entry point
// Starts: API server, content producer, stream loop, Telegram bot

import 'dotenv/config';
import { startServer } from './server.js';
import { startProducer } from './content/producer.js';
import { startStream, stopStream } from './stream.js';
import { startBot } from './bot/index.js';
import db from './db.js';

console.log('🎙 radioGAGA starting...');

startServer();
startProducer();
startStream();
startBot();

// Graceful shutdown — stop stream (kills FFmpeg), close DB, then exit
function shutdown(signal) {
  console.log(`\n[main] ${signal} received, shutting down...`);
  stopStream();
  try { db.close(); } catch {}
  // Allow 2s for FFmpeg to terminate, then force exit
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
