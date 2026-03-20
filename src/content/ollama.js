// Shared Ollama client — single instance used by all content generators.
// Configure via OLLAMA_HOST env var (defaults to localhost).

import { Ollama } from 'ollama';

export const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
});
