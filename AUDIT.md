# radioGAGA — Comprehensive Codebase Audit

**Date:** 2026-03-21
**Auditor:** Claude Opus 4.6 (automated)
**Scope:** Full backend, frontend, streaming pipeline, database, and architecture review

---

## 1. EFFICIENCY

### 1.1 LLM Token Usage

**Finding: Double LLM call per DJ segment (HIGH impact)**

Every non-dialogue DJ segment makes TWO LLM calls:
1. `dj.js:167` — initial script generation (~300-400 tokens out)
2. `filter.js:91` — "epic chaos filter" rewrites the entire script (~same token count again)

The filter prompt at `filter.js:43-83` is enormous (~600 tokens of system prompt alone) and essentially asks the LLM to do what the DJ prompt already asks for: rename people, upscale stories, inject chaos. This doubles token spend on every monologue segment for marginal quality gain.

**Token count per content cycle (estimated):**

| Generator | LLM Calls | ~Input Tokens | ~Output Tokens |
|-----------|-----------|---------------|----------------|
| DJ segment (monologue) | 2 (dj + filter) | ~1,200 + ~800 | ~300 + ~300 |
| DJ segment (dialogue) | 1 | ~1,200 | ~400 |
| Track intro | 1 | ~400 | ~120 |
| Track outro | 1 | ~400 | ~100 |
| Advert | 1 | ~300 | ~150 |
| News bulletin | 1 | ~400 | ~400 |
| Weather | 1 | ~300 | ~200 |
| Guest segment | 2 (identity + dialogue) | ~200 + ~600 | ~100 + ~400 |
| Shoutout intro | 1 | ~200 | ~60 |
| Moderator | 1 | ~500 | ~50 |
| Catalog advert (bg) | 1 | ~300 | ~150 |
| Listener ad (bg) | 1 | ~300 | ~120 |

A typical hour with 3 DJ segments, 2 music tracks (with intros/outros), 1 advert, and hourly news/weather runs approximately 12-15 LLM calls. At OpenRouter's llama-3.3-70b pricing ($0.59/$0.79 per M tokens), this is very cheap — roughly $0.01-0.02/hour, ~$0.40/day.

**Recommendation:** Merge the filter prompt into the DJ prompt for monologue shows. The DJ prompt at `dj.js:8-84` already contains anonymity rules and chaos instructions. The filter pass is redundant. This halves monologue LLM calls with negligible quality loss.

### 1.2 Audio Processing Pipeline

**Finding: Every segment gets re-encoded through FFmpeg twice (MEDIUM impact)**

`stream.js:194-229` — `pipeSegment()` runs FFmpeg to add fade-in/fade-out on EVERY segment, creating a `-proc.mp3` file. Then `pipeFile()` at line 156 decodes that MP3 back to raw PCM for piping into the main FFmpeg process. This is:

1. Decode MP3 -> apply filter -> encode to MP3 (pipeSegment processing)
2. Decode that MP3 -> raw PCM (pipeFile)

That's three codec passes per segment. The processing step could apply filters directly in the PCM domain within the main pipeline, or the fade-in/out could be done in the decoder step.

**Finding: Archive music downloads are re-encoded unnecessarily**

`archiveMusic.js:131-137` — Downloads from Archive.org are always re-encoded with FFmpeg to 128k MP3 even if the source is already 128k MP3. The download could use `curl` or `fetch` for direct download, with FFmpeg normalisation only when needed.

**Finding: Crossfade creates yet another FFmpeg process**

`stream.js:117-150` — `crossfadeMusicVoice()` runs a full FFmpeg filter graph creating a temporary file, which then goes through the normal pipeSegment processing (another encode) and then pipeFile (decode). That's 4 codec passes for crossfaded segments.

### 1.3 Memory/CPU Patterns

**Finding: Persistent requestAnimationFrame loop in frontend (LOW)**

`RadioPlayer.tsx:79-131` — The `BufferRing` component runs a `requestAnimationFrame` loop continuously, even when the player is idle. It allocates a new `Uint8Array` every frame when playing. Consider pausing the RAF when not playing.

**Finding: RSS fetches 48+ feeds simultaneously every 15 minutes (MEDIUM)**

`rss.js:122` — `fetchHeadlines()` fires `Promise.allSettled` across all 48 RSS feeds with 8-second timeouts. On a 1 vCPU droplet, this burst of concurrent HTTP requests could momentarily spike memory and CPU. Consider batching in groups of 10-15.

**Finding: Foley pool regeneration is redundant**

`studioFx.js:82-91` — `initFoleyPool()` generates 14 foley clips at startup. These are deterministic FFmpeg filter outputs and never change. They should be generated once and persisted to disk, not regenerated every restart.

### 1.4 Database

**Finding: No indexes beyond primary keys (HIGH impact)**

`db.js` creates tables with `CREATE TABLE IF NOT EXISTS` but adds zero explicit indexes. Queries that will suffer:

- `getRecentSuggestions()` (line 186): `WHERE s.type = ? AND s.used = 0 ORDER BY s.created_at DESC` — needs index on `(type, used, created_at)`
- `getNextSongOverride()` (line 267): `WHERE used = 0 ORDER BY created_at ASC` — needs index on `(used, created_at)`
- `getNextListenerAd()` (line 380): `WHERE moderation_status = 'approved' ORDER BY play_count ASC, created_at ASC` — needs index on `(moderation_status, play_count, created_at)`
- `getBroadcastHistory()` (line 305): `ORDER BY played_at DESC` — needs index on `played_at`
- `findDonationByRef()` (line 391): `WHERE message LIKE ?` — LIKE with leading wildcard (`%${ref}%`) cannot use an index; consider a dedicated `ref_code` column

Currently fine at small scale but will degrade as `broadcast_history` grows (adds a row every few minutes, ~500/day, ~180k/year).

**Finding: WAL mode and foreign keys are correctly enabled (GOOD)**

`db.js:14-15` — `journal_mode = WAL` and `foreign_keys = ON` are set. This is correct for a concurrent read/write workload.

**Finding: Migration strategy is fragile but functional**

`db.js:18-33` — ALTER TABLE migrations that silently catch "duplicate column" errors. Works but doesn't track which migrations have run. A version table would be safer for future schema changes.

### 1.5 Frontend Bundle Size

**Finding: Massive Radix UI dependency tree (HIGH impact)**

`frontend/package.json` lists 27 `@radix-ui` packages, most of which appear unused in the main page:
- accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, menubar, navigation-menu, popover, progress, radio-group, resizable-panels, scroll-area, select, separator, slider, switch, tabs, toggle, toggle-group, tooltip

The visible UI uses none of these — it's custom-styled with Tailwind. Additionally: `three.js` (183.2), `recharts`, `embla-carousel-react`, `react-day-picker`, `input-otp`, `cmdk`, `vaul`, `react-resizable-panels`, `qrcode.react` — all appear unused or minimally used.

This likely inflates the production bundle by 500KB-1MB+ of unused JavaScript. Tree-shaking may help but Radix components often resist full tree-shaking.

**Finding: Three.js imported but only used for particle effects**

`@types/three` and `three` are listed as dependencies. `AtmosphericCanvas.tsx` and `ParticleField.tsx` likely use Three.js for visual effects. Three.js alone is ~600KB minified. Consider a lighter alternative (raw WebGL/Canvas2D) for what appears to be a particle field effect.

### 1.6 Network / Polling

**Finding: Frontend polls every 10-15 seconds across multiple endpoints (MEDIUM)**

- `RadioPlayer.tsx:37-44` — polls `/api/now-playing` every 10 seconds
- `Ticker.tsx:15-61` — polls `/api/now-playing` + `/api/history?limit=5` + `/api/shows` every 15 seconds
- `CostBanner.tsx:23-37` — polls `/api/costs` every 60 seconds

That's 3 API calls every 10 seconds and 3 more every 15 seconds from every connected browser tab. With 100 listeners, that's ~40 requests/second to the Express server. The now-playing and shows data could be served via Server-Sent Events (SSE) or a single combined endpoint.

**Finding: /api/shows is fetched on every ticker poll but never changes**

`Ticker.tsx:19` fetches `/api/shows` every 15 seconds. The show schedule is static (loaded from YAML at startup). This should be fetched once and cached.

---

## 2. ROBUSTNESS

### 2.1 Error Handling

**Finding: LLM failure handling is solid (GOOD)**

`ollama.js:19-68` — Retry with exponential backoff for 429 and 5xx errors (up to 3 retries). Rate limit respects `Retry-After` header. Network errors also retry. This is well-implemented.

**Finding: TTS failure is unhandled in several paths (HIGH)**

`tts.js:69-75` — `textToMp3()` calls `edge-tts` via `execFileAsync` with no timeout and no retry. If edge-tts hangs (which it can due to Microsoft's TTS endpoint), the entire producer loop blocks indefinitely.

- `producer.js:139` — TTS for monologue DJ segments: no timeout
- `dialogue.js:99` — TTS for each dialogue line: no timeout, and if one line fails, partial audio is orphaned
- `news.js:115` — TTS for news bulletin: no timeout

**Recommendation:** Add a 30-second timeout to the `execFileAsync` call in `textToMp3()` and wrap in try/catch with fallback.

**Finding: FFmpeg crash recovery works correctly (GOOD)**

`stream.js:295-301` — When FFmpeg exits, it auto-restarts after 2 seconds. The `runLoop()` checks for `ffmpegProc` nullity before writing. The only risk is if FFmpeg dies mid-pipe — the decoder process in `pipeFile()` would get a broken pipe, but it resolves via the `close` event handler.

**Finding: Producer loop crash recovery has a 30-second gap (MEDIUM)**

`producer.js:447-452` — If the producer loop crashes, it waits 30 seconds before restarting. Combined with the 15-minute content buffer target, this is fine unless the queue is already thin. The emergency buffer check at line 383 helps.

### 2.2 Crash Recovery / State

**Finding: Queue state is lost on restart (MEDIUM)**

`queue.js` is entirely in-memory. On PM2 restart, all queued segments (potentially 15 minutes of pre-generated content) are lost. The stream falls back to archive music immediately, so there's no dead air, but the content quality drops.

**Finding: Advert catalog persists correctly (GOOD)**

`advertCatalog.js:39-64` — Catalog index is persisted to `tmp/adverts/catalog.json` with debounced writes. Archive music pool similarly persists to `tmp/music/archive/index.json`.

**Finding: Broadcast history is persisted in SQLite (GOOD)**

Every segment is logged to `broadcast_history` via `logBroadcast()`. This survives restarts.

### 2.3 Rate Limiting

**Finding: No rate limiting on public API endpoints (HIGH)**

`server.js` has zero rate limiting on:
- `POST /api/advert` — accepts file uploads up to 5MB; an attacker could fill the disk
- `POST /api/shoutout` — each submission triggers an LLM call + TTS (expensive)
- `POST /api/request` — stores directly to SQLite
- `POST /api/show-idea` — stores directly to SQLite
- `GET /api/now-playing`, `/api/history`, etc. — could be polled aggressively

The Telegram bot has rate limiting (`bot/index.js:117-126` — 5 actions per 10 minutes), but the web API has none.

**Recommendation:** Add express-rate-limit middleware. Suggested limits:
- `/api/advert`: 3/hour per IP
- `/api/shoutout`: 5/hour per IP
- `/api/request`: 10/hour per IP
- `/api/show-idea`: 3/hour per IP
- Read endpoints: 60/minute per IP

**Finding: CORS is wide open**

`server.js:36` — `CORS_ORIGIN = process.env.CORS_ORIGIN || '*'`. In production, this should be set to `https://www.radiogaga.ai`.

**Finding: Auth is optional and disabled by default**

`server.js:50-55` — `requireAuth` middleware passes through if `API_TOKEN` is not set. The skip endpoint (`/api/skip/:id`) allows anyone to change the show without authentication if the token isn't configured.

### 2.4 Content Gaps / Dead Air

**Finding: Excellent multi-tier fallback system (GOOD)**

`stream.js:311-528` — The run loop has 4 fallback tiers:
1. Queue content (DJ/music/adverts generated by producer)
2. Archive music pool (120 CC-licensed tracks from Archive.org)
3. Advert catalog (200 pre-generated adverts)
4. 2-second silence loop

This is well-designed. Worst case dead air is 2 seconds of silence between fallback checks.

**Finding: Archive pool depletion risk**

`archiveMusic.js:223-226` — `getArchiveTrack()` picks randomly from the pool but never removes tracks. The pool only grows via weekly re-seeding. However, the pool is shared between `producer.js` (which calls `getArchiveTrack()` and removes from the pool conceptually) and `stream.js` (which also calls `getArchiveTrack()` for fallback). There's no deduplication — the same track could play twice in a row.

### 2.5 File Cleanup

**Finding: Processed audio files accumulate (MEDIUM)**

`stream.js:239-245` — Cleanup only happens for files in `tmp/audio/` and files ending in `-proc.mp3`. However:
- `crossfadeMusicVoice()` creates `-xfade.mp3` files — cleaned up at line 408
- `news.js:71` creates `-news.mp3` files — never cleaned up
- `dialogue.js:51` creates `pause-*.mp3` files — cleaned up by `concatAudioFiles`
- `studioFx.js:159` creates `studio-*.mp3` files — never explicitly cleaned up
- `bot/index.js:439-445` — OGG files from Telegram voice messages are never cleaned up

Over days/weeks, `tmp/audio/`, `tmp/shouts/`, and other directories will accumulate orphaned files.

**Recommendation:** Add a periodic cleanup task that removes files in `tmp/` older than 1 hour (except catalog and archive pools).

---

## 3. SPEED

### 3.1 Content Generation to Broadcast Latency

**Estimated pipeline latency for a DJ segment:**

| Step | Estimated Time |
|------|---------------|
| LLM generation (DJ script) | 2-4s |
| LLM filter pass (monologue) | 2-4s |
| edge-tts | 1-3s |
| Studio bed mixing (FFmpeg) | 1-2s |
| Queue wait (buffer) | 0-15 min |
| pipeSegment processing (fade) | 0.5-1s |
| pipeFile (decode + stream) | real-time |

**Total generation time: ~7-14 seconds per DJ segment.**
**Total generation time for dialogue: ~15-30 seconds** (multiple TTS calls + pauses + concat + studio bed).

The 15-minute content buffer (`TARGET_BUFFER_S = 15 * 60` at `producer.js:96`) means content is generated well ahead of broadcast. The lag tracker (`producer.js:39-51`) monitors this. Effective latency from generation to air is dominated by the buffer, not generation speed.

### 3.2 LLM Latency

OpenRouter with llama-3.3-70b-instruct: typical response times are 1-4 seconds for ~200 token outputs. The `num_predict` limits are well-calibrated:
- DJ segments: `Math.ceil(targetWords * 1.8)` — sensible headroom
- Adverts: 150 tokens
- News: 400 tokens
- Track intros: 120 tokens

No streaming is used (all `stream: false`), which is correct for this use case — the full output is needed before TTS.

### 3.3 TTS Latency

edge-tts is fast (~1-3 seconds for typical segments) since it uses Microsoft's hosted endpoint. The main risk is network latency to Microsoft's servers from the DigitalOcean droplet. No timeout is configured.

### 3.4 Frontend Performance

**Finding: Heavy animation layer (MEDIUM)**

The frontend renders:
- `AtmosphericCanvas` — likely a full-viewport Canvas element
- `ParticleField` — another canvas/WebGL layer
- 6 `LightNode` components with mouse-tracking
- Continuous `requestAnimationFrame` loop for the `BufferRing`
- CSS animation for the `Ticker`

On low-powered devices (phones), this could be heavy. The scroll handler at `Index.tsx:44-58` fires on every scroll event (though passive).

**Finding: API polling creates unnecessary work**

As noted in section 1.6, the Ticker component makes 3 fetch calls every 15 seconds. Each call parses JSON and triggers a React re-render. With the current simple data, this is fast, but it's wasteful.

---

## 4. RECOMMENDATIONS

### P0 — Critical (do now)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | **Add rate limiting to Express API** — install `express-rate-limit`, configure per-endpoint limits | 30 min | Prevents abuse, protects LLM budget |
| 2 | **Add timeout to edge-tts calls** — `execFileAsync('edge-tts', [...], { timeout: 30000 })` | 5 min | Prevents infinite hangs |
| 3 | **Set CORS_ORIGIN in production** — restrict to `https://www.radiogaga.ai` | 2 min | Basic security |
| 4 | **Add tmp file cleanup cron** — delete files in `tmp/audio/`, `tmp/shouts/` older than 1 hour | 20 min | Prevents disk fill on $12 droplet |

### P1 — High Impact (this week)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 5 | **Merge filter.js into dj.js prompt** — eliminate double LLM call for monologue shows | 1 hour | Halves LLM cost for monologues, reduces latency by 2-4s |
| 6 | **Add database indexes** — broadcast_history(played_at), suggestions(type,used,created_at), listener_adverts(moderation_status,play_count) | 15 min | Prevents future query degradation |
| 7 | **Combine frontend polling into single endpoint** — `/api/status` returns now-playing + show info + history in one call | 1 hour | Reduces API load by ~60% |
| 8 | **Persist foley clips** — generate once, save to `assets/foley/`, skip regeneration on restart | 30 min | Faster startup, less CPU waste |
| 9 | **Cache /api/shows response** — it never changes at runtime | 10 min | Eliminates redundant DB-free computation |

### P2 — Medium Impact (this month)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 10 | **Audit frontend dependencies** — remove unused Radix UI, Three.js, recharts, etc. | 2 hours | Could reduce bundle by 500KB-1MB |
| 11 | **Batch RSS fetches** — fetch in groups of 10-15 with 1s delay between batches | 30 min | Smoother CPU/memory profile |
| 12 | **Skip re-encoding for Archive.org downloads** — download directly, normalise only when needed | 1 hour | Faster seeding, less CPU |
| 13 | **Add SSE for now-playing updates** — push changes instead of polling | 2 hours | Real-time updates, less server load |
| 14 | **Persist queue to disk** — save queue state to JSON on push/shift, reload on restart | 1 hour | No content loss on PM2 restart |
| 15 | **Add findDonationByRef dedicated column** — `ref_code` column with index instead of LIKE scan | 30 min | Correct querying pattern |

### P3 — Architectural (future)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 16 | **Reduce FFmpeg codec passes** — apply fade-in/out in the PCM decoder stage instead of a separate encode step | 4 hours | ~30% less CPU per segment |
| 17 | **Add health monitoring** — expose `/api/health` with queue depth, archive pool size, last generation time, FFmpeg status | 2 hours | Operational visibility |
| 18 | **Add request deduplication for web submissions** — prevent duplicate shoutouts/requests from rapid form submission | 30 min | Better UX |
| 19 | **Consider WebSocket for player state** — replace polling with persistent connection | 4 hours | Better UX, lower server load |

### Cost Optimization

Current estimated monthly costs:
- DigitalOcean droplet: $12/mo
- Domain: ~$10/mo (amortised)
- OpenRouter LLM: ~$12/mo (at ~$0.40/day)
- edge-tts: $0 (free)
- Archive.org: $0 (free)
- Open-Meteo weather: $0 (free)

**Total: ~$34/mo**

The filter.js elimination (P1 #5) would save ~$4/mo on LLM costs. Beyond that, costs are already very lean. The biggest cost optimisation would be increasing listener count to justify the fixed costs.

---

## 5. CODE QUALITY OBSERVATIONS

### Strengths
- Clean module boundaries — each content generator is self-contained
- Excellent fallback cascade in stream.js prevents dead air
- Good use of schedule.yaml for configuration
- Prompt engineering is detailed and effective
- LLM retry logic is production-quality
- Input sanitisation for Telegram bot prevents prompt injection
- Content moderation for listener ads is a good safety measure
- WAL mode and foreign keys in SQLite are correct

### Concerns
- `web-submissions.js:9` — `addWebSuggestion` creates a pseudo Telegram ID (`web-${Date.now()}`) that will fail the foreign key constraint since no matching listener exists. The `addSuggestion` function at `db.js:177` calls `getListener(telegram_id)` which returns null, then the INSERT uses `listener.id` which is undefined. **This is a bug** — web suggestions silently fail.
- `stream.js:400` — `queue.items[0]?.type` accesses internal `items` array directly instead of using a public API method
- No TypeScript on the backend — not a problem at current scale but would help as the codebase grows
- `archiveMusic.js:223-226` — `getArchiveTrack()` picks randomly without preventing repeats within the same session

---

*Audit complete. Total files reviewed: 25+ source files across backend, frontend, and configuration.*
*radioGAGA is a well-architected system for its constraints. The recommendations above are ordered by effort-to-impact ratio.*
