// radioGAGA — entry point
// Starts: API server, content producer, stream loop, Telegram bot

import 'dotenv/config';
import { startServer } from './server.js';
import { startProducer } from './content/producer.js';
import { startStream } from './stream.js';
import { startBot } from './bot/index.js';

console.log('🎙 radioGAGA starting...');

startServer();
startProducer();
startStream();
startBot();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[main] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[main] SIGTERM received, shutting down...');
  process.exit(0);
});
