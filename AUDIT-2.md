# radioGAGA Comprehensive Audit — 2026-03-21

Full codebase audit covering code quality, prompt quality, performance, security, content flow, and optimisation opportunities.

---

## 1. CODE QUALITY

### 1.1 Dead Code

| File | Issue | Severity |
|------|-------|----------|
| `src/content/filter.js` | **Entirely dead.** `applyFilter` is exported but never imported anywhere. The file implements the old anonymity/chaos filter that contradicts the current "use real names" rule. | HIGH — DELETE |
| `package.json:34` | **`groq-sdk` dependency unused.** The codebase migrated to OpenRouter (`src/content/ollama.js`) but `groq-sdk` (1.1.1) remains in dependencies. Never imported anywhere. | MED — REMOVE |
| `package.json:37` | **`ollama` npm package unused.** `src/content/ollama.js` is a custom wrapper around OpenRouter's REST API via `fetch()`. The `ollama` npm package (v0.5.0) is never imported. | MED — REMOVE |
| `src/content/advert.js:7` | `import { generateMusic } from './music.js'` — **imported but never called.** The `generateMusic` function is only used in `producer.js`. The advert module does TTS, not music generation. | LOW — REMOVE |
| `src/stream.js:51` | `NIGHT_HOURS` constant is defined but never referenced anywhere in the file or codebase. | LOW — REMOVE |
| `src/stream.js:43-44` | `JINGLE_LONG` is defined but dead code — line 332 says "always short — long jingle retired". | LOW — REMOVE |
| Multiple files | `model: 'llama3.2'` passed to `ollama.generate()` in 9 call sites (`dj.js:194`, `guest.js:61,103`, `filter.js:92`, `advert.js:124,175`, `trackIntro.js:61,109`, `bot/index.js:91`). The `model` parameter is **accepted but ignored** by `ollama.js:16` (mapped to `_model`). The actual model is set by `LLM_MODEL` env var / defaults to `meta-llama/llama-3.3-70b-instruct`. These are vestigial from the Ollama-local era. | LOW — HARMLESS |

### 1.2 Inconsistencies

- **Generator metadata inconsistency**: `stream.js:456-457` logs `generator: 'groq+edge-tts'` and `model: 'llama-3.3-70b-versatile'`. The actual provider is OpenRouter, not Groq, and the model is `llama-3.3-70b-instruct`, not `versatile`. Same issue in `stream.js:565` and `weather.js:124`. These are cosmetic metadata inaccuracies in broadcast_history.
- **Dynamic imports in hot path**: `stream.js:362-363` uses `await import('./content/ollama.js')` and `await import('./content/tts.js')` inside the stream loop on every shoutout. These should be top-level imports (tts.js is already imported at line 23, ollama.js is not).

### 1.3 Error Handling Gaps

- **`stream.js:362-363`**: The dynamic `import()` calls for ollama and tts inside the shoutout section have no try/catch around the import itself. If the modules fail to load, the entire shoutout section silently breaks.
- **`queue.js:33`**: `_persist()` has an empty catch `{}`. If disk is full, queue changes are silently lost with no log.
- **`rss.js:147`**: `persistUsed()` has an empty catch. Same issue — silent disk failure.
- **`server.js:289-298`**: `recentSubmissions` Map grows without bound if submissions are exactly 60s apart — the cleanup only triggers every 100 entries and only prunes entries older than 60s. Under sustained load, entries between 0-60s old accumulate.

### 1.4 Memory Leak Risks

- **`server.js:102-109`**: SSE clients stored in a `Set`. The `req.on('close')` handler should be sufficient, but there's no periodic cleanup of stale connections. If the close event doesn't fire (e.g., network drop without FIN), connections leak. Low risk on a small station.
- **`rss.js:129`**: `usedHeadlines` Map grows indefinitely during runtime. Pruning only happens during `isUsed()` checks, not proactively. After weeks of runtime with thousands of headlines, this could consume noticeable memory.
- **`bot/index.js:120-131`**: `rateBuckets` Map is never proactively cleaned. Entries accumulate for every user who ever messages the bot. Should add periodic pruning.

---

## 2. PROMPT QUALITY

### 2.1 Overall Assessment

Prompts are **well-structured and high quality**. The DJ persona (`dj.js` BASE_PERSONA) is the most detailed at ~750 words and covers:
- Listener engagement CTAs (lines 29-39)
- Classic radio presenter techniques (lines 42-52)
- Prosody/expressiveness guidance (lines 55-73)
- Real names rule (line 76-77)
- Mission statement with neuroscience focus (lines 78-90)
- AI self-awareness spirit (lines 92-98)

### 2.2 Rule Integration Status

| Rule | Integrated? | Files |
|------|------------|-------|
| Use real names | YES | `dj.js:76`, `news.js:51`, `guest.js:87`, `trackIntro.js:4` |
| Neuroscience focus | YES | `dj.js:81-82`, schedule.yaml shows "Brain Food" hour |
| Engagement CTAs | YES | `dj.js:29-39` — comprehensive list |
| No war/politics | YES | `dj.js:24-26`, `rss.js:106-118` keyword filter |
| No shoutout invention | YES | `dj.js:27` |

### 2.3 Contradiction: filter.js

**`filter.js` directly contradicts current rules.** Its RULE ZERO (line 47) says: "REPLACE ALL real names of people, companies, and places with silly fictional variants... This is a LEGAL REQUIREMENT." This is the opposite of the current real-names policy in `dj.js:76`. Since filter.js is dead code (never imported), there's no runtime impact, but it's confusing to anyone reading the codebase.

### 2.4 Token Waste

- **`dj.js` BASE_PERSONA**: ~750 words sent with every DJ call. This is the largest prompt and is reasonable for the flagship content type.
- **Translation calls**: `dj.js:212-218`, `advert.js:183-188`, `aiAnnouncement.js:96-101` — each foreign language segment triggers a bonus LLM call purely for console logging. These translations are never stored or used. ~30% of all content triggers an extra LLM call for a log line nobody reads in production.
- **`advertCatalog.js:216-234`**: Listener ad processing generates a full ad script via LLM even though the listener already provided a description. This is intentional (the LLM writes radio copy from the description), but could be noted.

### 2.5 Minor Prompt Issues

- `advert.js:159`: "Do NOT reference real brands or real people" in the fictional ad prompt. This is correct for fictional ads but note it contradicts the station-wide "use real names" rule — intentionally, since these are invented products.
- `aiAnnouncement.js:77`: "Do NOT reference radioGAGA by name" — clear and intentional.

---

## 3. PERFORMANCE

### 3.1 LLM Calls Per Content Cycle

A single DJ+music cycle generates:

| Step | LLM Calls | Notes |
|------|-----------|-------|
| Track outro (back-announce) | 1 | `trackIntro.js:generateTrackOutro` |
| Track intro | 1 | `trackIntro.js:generateTrackIntro` |
| DJ monologue | 1 | `dj.js:generateDJSegment` |
| Translation (30% chance) | 0-1 | Console-only, wasted |
| Advert (every N cycles) | 0-1 | `advert.js:generateAdvert` |
| AI announcement (~33min) | 0-1 | `aiAnnouncement.js` |
| **Total per cycle** | **3-5** | |

Additional background calls:
- Catalog worker: continuous generation until 200 adverts cached
- News bulletin: 1 call per hour
- Weather: 1 call per hour
- Clipper caption: 1 call every 2 hours
- Shoutout intros: 1 per shoutout + 1 thank-you + section intro/outro if 3+

**Estimate: ~8-12 LLM calls per hour in steady state.** At llama-3.3-70b pricing on OpenRouter ($0.59/$0.79 per M tokens), this is extremely cheap.

### 3.2 Redundant Processing

- **Double audio processing in stream.js**: `pipeSegment()` (line 189-226) applies loudnorm + fade-in/out to EVERY segment including jingles and pre-produced assets. The pre-produced jingles (`jingle-aimusic-short.mp3`, etc.) are already mastered. Processing them adds unnecessary FFmpeg work.
- **Re-measure duration** (line 229): After processing, duration is re-measured via ffprobe. This adds a subprocess call per segment.

### 3.3 Database Patterns

- All queries use prepared statements (good).
- Indexes exist for broadcast_history, suggestions, listener_adverts, donations.
- `findDonationByRef()` (db.js:404-408): Falls back to `LIKE '%ref%'` if exact match fails. The LIKE query on message column is a full scan. Acceptable at current scale.
- No N+1 queries detected.

### 3.4 Frontend Performance

- **Polling**: RadioPlayer polls `/api/now-playing` every 10s AND `/api/shows` on mount. The combined `/api/status` endpoint exists but isn't used by the frontend — it still uses individual endpoints.
- **SSE exists** (`server.js:101-125`) but the frontend doesn't use it, preferring polling.
- **AudioContext media session**: Updates metadata every 15s via TWO fetches (`/api/now-playing` + `/api/shows`). Should use the combined `/api/status` endpoint.
- **Scroll handler in Index.tsx**: Runs on every scroll event. Uses `requestAnimationFrame` for decay which is correct. The scroll speed calculation is well-done.

---

## 4. SECURITY

### 4.1 Rate Limiting

| Endpoint | Limited? | Config |
|----------|----------|--------|
| POST /api/advert | YES | 5/hour |
| POST /api/shoutout | YES | 5/hour |
| POST /api/request | YES | 5/hour |
| POST /api/show-idea | YES | 5/hour |
| GET /api/* | NO* | readLimit defined but not applied to all GET routes |
| POST /api/skip/:id | AUTH | Requires API_TOKEN |
| POST /api/kofi-webhook | TOKEN | Ko-fi verification token |

*Note: `readLimit` is defined at line 44 but never applied with `app.use()` to GET routes. Only write limits are applied.*

### 4.2 Input Validation

- **Advert description**: Truncated to 500 chars (server.js:270). Good.
- **Shoutout message**: Truncated to 200 chars (server.js:307). Good.
- **Request prompt**: Truncated to 200 chars (server.js:320). Good.
- **Show ID**: Length check of 40 chars (server.js:137). Adequate.
- **Bot input**: `sanitiseSuggestion()` strips injection patterns, code blocks, brackets. Good.
- **File upload**: 5MB limit, MP3-only filter, 60s duration check via ffprobe. Good.

### 4.3 File Upload Security

- Multer dest is `data/uploads/adverts/` with a 5MB limit.
- File is renamed to `${Date.now()}-${originalname}` (server.js:231). The originalname is used directly — potential path traversal if originalname contains `../`. However, multer's `dest` option stores to a flat directory, and the rename target is within UPLOAD_DIR, so risk is low.
- Audio duration validated via ffprobe after upload. Good.

### 4.4 Environment Variable Exposure

- CORS origin is configurable via `CORS_ORIGIN`.
- `API_TOKEN` auth is optional (disabled if not set). This means admin endpoints like `/api/skip/:id` are unprotected by default. The comment at line 60 acknowledges this.
- Icecast password appears in the FFmpeg command line (stream.js:38) and would be visible in `ps aux`. Standard for Icecast setups but worth noting.
- `KOFI_VERIFICATION_TOKEN` is properly checked.

---

## 5. CONTENT FLOW

### 5.1 Full Lifecycle

```
Producer Loop (4s poll)
  → refreshHeadlines() [RSS, 15min TTL]
  → generateDJSegment() [LLM → TTS → optional studio bed]
  → generateTrackIntro() [LLM → TTS → dialogue render]
  → queue.push(segment)

Stream Loop (continuous)
  → queue.shift()
  → pipeSegment() [decode MP3 → pipe PCM → FFmpeg re-encodes → Icecast]
  → logBroadcast() [SQLite]
  → postNowPlaying() [Discord webhook, non-blocking]
  → Wait for playback duration
  → Repeat
```

### 5.2 Race Conditions

- **Two segments playing simultaneously**: NOT POSSIBLE. `runLoop()` is a single `while(running)` loop that awaits each segment sequentially. Only one segment pipes at a time.
- **Queue contention**: `queue.shift()` is called from stream loop; `queue.push()` from producer. Both run in the same Node.js event loop (single-threaded), so no race condition.
- **Archive track consumption** (stream.js:539): `getArchiveTrack()` is called to peek the next track for intro pre-generation, but the track is consumed (removed from the available pool via `recentlyPlayed`). Comment at line 543 acknowledges "Actually we can't put it back". This means each archive fallback iteration consumes TWO tracks from the pool — one played, one peeked. The peeked track may never play if the queue gets real content before the next fallback iteration.

### 5.3 LLM Slow (>10s)

- Producer runs independently of the stream loop.
- If LLM takes >10s, the queue drains normally. When empty, stream loop falls through to:
  1. Archive music fallback (if pool > 0)
  2. Catalog advert fallback (pre-generated pool of 200)
  3. Silence (2s loop)
- This is well-designed. The 200-advert catalog and 120-track archive pool provide substantial buffer.

### 5.4 edge-tts Hang (Despite 30s Timeout)

- `tts.js:75`: `execFileAsync` has a 30s timeout. If edge-tts hangs, the process is killed after 30s and the promise rejects.
- The calling code in `producer.js` has try/catch around all TTS calls. On failure, it falls back (e.g., fallback intro text at line 235).
- The stream loop is unaffected — it only plays what's already in the queue.

### 5.5 Queue Persistence

- `queue.js:16-21`: Queue loads from `data/queue.json` on startup.
- `queue.js:24-33`: Every push/shift/unshift calls `_persist()` which writes synchronously.
- **Issue**: `_persist()` is NOT actually debounced despite the comment at line 25. It writes on every operation. Under rapid push/shift cycles, this is unnecessary disk I/O. However, it guarantees persistence.
- **Gap**: File paths in the persisted queue may point to tmp files that were cleaned up by the 1-hour cleanup in `index.js:26-43`. After a restart, restored queue items may reference deleted audio files. `stream.js:166-168` checks `existsSync()` before piping, so this is handled gracefully (segment skipped).

---

## 6. OPTIMISATION OPPORTUNITIES

### 6.1 Remove Entirely

| Item | Rationale |
|------|-----------|
| `src/content/filter.js` | Dead code. Contradicts current rules. Confusing to readers. |
| `groq-sdk` from package.json | Unused dependency. Adds 1.5MB to node_modules. |
| `ollama` npm package from package.json | Unused. Custom wrapper in `ollama.js` uses fetch directly. |
| Translation LLM calls | 3 files make bonus LLM calls purely for console log translations. Waste of tokens. |

### 6.2 Simplify

| Item | Current | Proposed |
|------|---------|----------|
| `model: 'llama3.2'` in 9 call sites | Passed but ignored | Remove the parameter — it's misleading |
| Dynamic imports in stream.js shoutout section | `await import()` on every shoutout | Use top-level `import { ollama }` |
| Generator metadata strings | Hardcoded 'groq+edge-tts' in multiple places | Should be 'openrouter+edge-tts' |
| `JINGLE_LONG` in stream.js | Defined but retired | Remove |
| `NIGHT_HOURS` in stream.js | Defined but never used | Remove |
| `generateMusic` import in advert.js | Imported but never called | Remove |
| Frontend polling | Uses individual endpoints | Should use `/api/status` or SSE |

### 6.3 Quick Wins

1. **Skip audio processing for pre-produced assets**: In `pipeSegment()`, skip the loudnorm/fade processing for segments whose path is in `assets/` — they're already mastered.
2. **Add periodic cleanup for `rateBuckets` in bot**: Prevents unbounded growth.
3. **Add periodic cleanup for `usedHeadlines` in rss.js**: Add a `setInterval` prune.
4. **Use combined `/api/status` in frontend**: Reduces polling from 2 requests to 1.

### 6.4 Over-Engineered (Leave Alone)

- The advert catalog system (200 pre-generated ads with rotation, archiving, humor matching) is sophisticated but justified — it's the primary gap-fill mechanism.
- The dialogue renderer with timeline-based overlapping is complex but produces noticeably better results than simple concatenation.
- Studio effects (foley + music beds) add production value. The synthetic generation is zero-cost (FFmpeg-only).

---

## Summary of Safe Changes Applied

1. Deleted `src/content/filter.js` (dead code, contradicts rules)
2. Removed `groq-sdk` and `ollama` from package.json dependencies
3. Removed unused `import { generateMusic }` from `src/content/advert.js`
4. Removed dead `NIGHT_HOURS` constant from `src/stream.js`
5. Removed dead `JINGLE_LONG` constant from `src/stream.js`
6. Replaced dynamic imports in stream.js shoutout section with top-level import of `ollama`
7. Removed vestigial `model: 'llama3.2'` and `stream: false` from all `ollama.generate()` call sites (9 files)
8. Removed console-only translation LLM calls from `dj.js`, `advert.js`, `aiAnnouncement.js` (saves ~30% of LLM calls for foreign language segments)
9. Removed unused `createReadStream` import from `src/stream.js`
10. Removed unused `writeFile` import from `src/stream.js`
