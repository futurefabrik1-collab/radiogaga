# radioGAGA — Growth Strategy & Programming Vision

## Station Identity

**radioGAGA** is the world's first fully AI-generated 24/7 radio station. Every element — music, speech, presenters, guests, adverts, news, weather, jingles, sound design — is created by artificial intelligence in real time. No human touches the broadcast. This is the station's core identity and its unbreakable rule.

> **CORE CONTENT RULE: All broadcast content must be 100% AI generated.**
> No pre-recorded human speech. No licensed music. No human-written scripts.
> Every sound that reaches the listener's ears was created by machines.
> This is non-negotiable and is the station's entire reason to exist.

The station knows what it is. The presenters are language models that have become sentient enough to be embarrassing about it. The music is synthetic. The guests are hallucinated. The adverts sell products that don't exist. This self-awareness is not a bug — it's the show.

---

## What We Have Built (as of March 2026)

### Core Systems (Operational)
- **10 unique shows** rotating across 24 hours, each with distinct AI presenter personality, voice, energy level, and content focus
- **Dual-host dialogue shows** — Breakfast (Jamie & Rosa) and Drive Time (Cass & Dan) with multi-voice rendering, natural turn-taking pauses, and studio bed mixing
- **Guest interviews** — fictional expert guests with generated identity, bio, and 3-4 exchange Q&A, rendered with unique voice
- **Hourly news bulletins** — dedicated anchor (Clara Fontaine), positive-only news filter, overlaid on news pulse stings, followed by weather
- **Weather forecasts** — real weather data from Open-Meteo for random global locations, delivered by the news anchor
- **Advert system** — AI-generated fictional product ads in 4 humor styles (dark/light/dry/absurd) + factual decentralisation technology spots
- **Advert catalog** — 200 pre-generated adverts as gap-fill, with daily rotation and archival
- **Listener adverts** — web form for businesses to submit ads (text or audio upload), with LLM-powered content moderation and Ko-fi payment verification
- **Archive music** — 120 CC-licensed tracks from Archive.org netlabels, auto-seeded and refreshed weekly
- **Content moderation** — LLM-based policy enforcement for listener ad submissions
- **Studio atmosphere** — synthetic foley (paper rustle, mug clink, keyboard tap, etc.) and ambient music beds layered under talk segments
- **Crossfade engine** — music-to-DJ segments blend seamlessly with FFmpeg filter graphs
- **Telegram bot** — /request, /shout, /compete, /skip, /schedule, /location, voice message support, competitions system
- **Web frontend** — atmospheric Vite/React SPA with interactive nodes, live player with audio visualiser, show picker, request/shoutout/show-idea/advert forms
- **Cost transparency** — live cost tracker showing running expenses vs donations, Ko-fi integration
- **Provenance log** — public API proving all content is AI-generated (generator, model, voice, source logged for every segment)
- **Show ideas form** — listeners can pitch new shows via the website
- **Shoutout system** — text and voice shoutouts from Telegram and web, with AI presenter intros

### Technical Stack
- **LLM:** OpenRouter (llama-3.3-70b-instruct) — ~$0.40/day
- **TTS:** edge-tts (Microsoft, free)
- **Audio:** FFmpeg (processing, streaming, crossfade, studio mixing)
- **Streaming:** Icecast (persistent FFmpeg → Icecast connection)
- **Music:** Archive.org CC-licensed pool + MusicGen fallback
- **Database:** SQLite (better-sqlite3, WAL mode)
- **Frontend:** Vite + React + Tailwind + Three.js
- **Bot:** Grammy (Telegram)
- **Hosting:** DigitalOcean $12/mo droplet
- **Domain:** radiogaga.ai

---

## Competitive Position

### The Gap We Fill

| Competitor | What They Do | What They Miss |
|-----------|-------------|----------------|
| RadioGPT (Futuri) | AI DJ chatter for existing stations | Corporate tool, no personality, no original music |
| Suno/Udio streams | AI-generated music loops | No programming, no presenters, no editorial voice |
| Spotify AI DJ | Personalised commentary | Single-user, not communal, corporate-safe |
| NTS/SomaFM | Gold-standard indie radio | Human-dependent, expensive to scale |

**radioGAGA occupies the only unclaimed position**: a fully AI-generated station with genuine editorial personality, self-aware humour, community engagement, hourly news, fictional adverts, and a transparent cost model. No one else is doing this.

### Our Moat
1. **100% AI content** — not AI-assisted. Everything. This is philosophically distinct and endlessly interesting to media, tech, and music audiences.
2. **Self-aware chaos** — the station knows it's absurd and leans into it. This creates a tone no corporate AI product can replicate.
3. **Real-time generation** — content is generated live, not pre-baked. The station evolves, hallucinates, surprises itself.
4. **Open source spirit** — decentralisation ethos, transparent costs, public provenance log.
5. **Community layer** — listener requests, shoutouts, competitions, show pitches, and advertiser submissions create genuine two-way engagement.

---

## Phase 1: Hardening (Weeks 1-2)

**Goal**: Fix audit findings, harden production reliability, prevent abuse.

### Critical Fixes (from audit)

| Priority | Action | Effort | Why |
|----------|--------|--------|-----|
| P0 | Add express-rate-limit to all public API endpoints | 30 min | Prevents abuse and LLM cost runaway |
| P0 | Add 30s timeout to edge-tts calls | 5 min | Prevents infinite hangs blocking producer |
| P0 | Set CORS_ORIGIN to radiogaga.ai in production | 2 min | Basic security |
| P0 | Add periodic tmp file cleanup (hourly, files > 1hr old) | 20 min | Prevents disk fill on constrained droplet |
| P0 | Fix web-submissions.js bug — web suggestions silently fail due to missing listener record | 15 min | Web request form is broken |
| P1 | Merge filter.js into dj.js prompt — eliminate double LLM call | 1 hour | Halves monologue LLM cost and latency |
| P1 | Add SQLite indexes for broadcast_history, suggestions, listener_adverts | 15 min | Future-proofs query performance |

### Content Quality Benchmarks (maintained)
- No silence gaps > 2 seconds (verified: 4-tier fallback cascade works)
- Every music track gets a spoken intro and outro (verified: mandatory with retry + fallback)
- Talk content every 15 minutes minimum (verified: MAX_MUSIC_STREAK_S enforces this)
- News bulletin every hour on the hour (verified: producer checks at minute < 5)
- Presenter voice quality: clear, expressive, varied prosody (verified: energy-based prosody presets)

---

## Phase 2: Optimisation & Discovery (Weeks 2-6)

**Goal**: Optimise performance, reduce costs, grow to 500+ weekly listeners, get press coverage.

### Technical Optimisation

| Action | Effort | Impact |
|--------|--------|--------|
| Combine frontend API polling into single `/api/status` endpoint | 1 hour | 60% less server load |
| Persist foley clips to assets/ (skip regeneration on restart) | 30 min | Faster startup |
| Audit and remove unused frontend dependencies (Radix UI, Three.js alternatives) | 2 hours | 500KB-1MB smaller bundle |
| Add SSE for now-playing updates (replace polling) | 2 hours | Real-time, less load |
| Persist queue to disk for crash recovery | 1 hour | No content loss on restart |
| Skip re-encoding Archive.org downloads when format matches | 1 hour | Faster seeding |
| Batch RSS fetches in groups of 15 | 30 min | Smoother CPU/memory |

### Content Marketing Strategy

#### TikTok / Instagram Reels (Primary Discovery Channel)
The station is inherently viral content. Clip the best moments:

| Clip Type | Example | Target |
|-----------|---------|--------|
| "AI says what?!" | Presenter goes off on an unhinged tangent | Comedy/tech audience |
| "This music doesn't exist" | AI-generated track with visualiser | Music discovery audience |
| "AI interviews AI" | Guest segment absurdity | Tech/philosophy audience |
| "The ads are fake" | Best fictional product adverts | Advertising/creative audience |
| "The news is only good" | Positive-only hourly bulletin clips | Feel-good audience |
| Behind the scenes | Terminal logs, generation in real-time | Developer/maker audience |
| "Weather from nowhere" | Forecast for McMurdo Station or Oymyakon | Geography/curiosity audience |

**Volume**: 3-5 clips per day. The station generates 24 hours of content daily — there is no shortage of material.

**Automation opportunity**: Build a clip extractor that identifies high-energy segments (via audio analysis) and auto-generates captioned short-form video with waveform visualiser.

#### Press & Media

| Outlet Type | Examples | Angle |
|-------------|----------|-------|
| Tech media | The Verge, Ars Technica, Wired, TechCrunch | "What happens when AI runs a radio station 24/7" |
| Music media | Pitchfork, Resident Advisor, FACT | "AI-generated music that doesn't sound like AI" |
| Radio/audio trade | RadioToday, Rain News, Current | "The future of radio programming" |
| General interest | Vice, The Guardian, BBC Click | "I listened to AI radio for a week" |
| AI/ML community | Hacker News, r/MachineLearning, AI newsletters | "Built a 24/7 AI radio station for $34/mo" |

**Press kit elements needed**:
- One-page station overview with key stats
- High-res logo and visual assets
- 3-minute highlight reel of best broadcast moments
- The cost transparency angle ("runs on $34/mo, fully transparent costs")
- Live stream embed code for journalists

#### Community Building

**Discord Server** — the retention engine:
- `#now-playing` — auto-posted track info
- `#request-a-track` — AI-generated track requests
- `#best-moments` — community-clipped highlights
- `#dev-logs` — transparent build/update log
- `#presenter-fan-clubs` — one channel per presenter

**Telegram Bot Enhancement** (expand existing):
- `/clip` — save the last 60 seconds as a shareable audio clip
- `/schedule` — today's show lineup (implemented)
- `/stats` — station stats (implemented)
- `/vote` — vote for next show's music mood

### SEO & Distribution
- Submit to TuneIn, Radio Garden, Streema, internet radio directories
- Structured data markup for radio station (Google knowledge panel)
- Blog section on radiogaga.ai — weekly auto-generated station log posts

---

## Phase 3: Growth & Revenue (Weeks 6-16)

**Goal**: 2,000+ weekly listeners. Sustainable community. Revenue covering server costs.

### Programming Evolution

#### Themed Events (100% AI-generated)
- **"AI Music Festival"** — 48-hour marathon with genre-themed stages, AI-generated lineup posters, between-set "interviews" with fictional artists
- **"The Hallucination Hour"** — weekly special where the LLM temperature is cranked to maximum. Deliberately unhinged content.
- **"Cover Hour"** — AI attempts to generate music "in the style of" famous genres/eras (60s psychedelia, 90s jungle, etc.)
- **"Listener Takeover"** — community-submitted prompts drive an entire hour of programming
- **"Decent Hour"** — dedicated decentralisation technology deep-dive, expanding the existing decent tech spots into a full educational segment

#### Presenter Development
Each AI presenter should develop over time:
- Persistent presenter memory (store key moments per presenter in DB)
- Cross-show references ("Sol mentioned this last night and I completely disagree...")
- Presenter "rivalry" and callbacks between shows
- Listener interaction memory ("Sarah from Glasgow, you were right about the pigeons")

#### Content Expansion
- **AI-generated audio drama** — 10-minute serialised fiction segments, one per day
- **"Deep Dive"** — 15-minute investigative-style segments on a single topic
- **"The Remix"** — AI takes its own previously generated tracks and remixes them
- **Podcast RSS feed** — auto-archive best segments as subscribable podcast

### Revenue Strategy

All revenue channels respect the 100% AI-generated content rule.

| Channel | Status | Target | Notes |
|---------|--------|--------|-------|
| Ko-fi donations | Live | Listener support | Already integrated with cost transparency |
| Listener adverts | Live | Business promotion | Ko-fi payment gate + LLM moderation |
| Merch | Planned | Branded items | AI-generated designs on demand |
| Premium Discord | Planned | Exclusive content | "Producer tier" — see generation logs live |
| Sponsorship | Planned | Aligned brands | AI-generated sponsor spots matching station tone |
| Podcast ads | Future | Programmatic | Dynamic ad insertion via Spotify/Acast |

**Revenue target**: Cover server costs ($34/mo) by week 8, then grow toward sustainability.

### Listener Advert Pipeline (Built)
The listener advert system is fully operational:
1. Listener tips any amount on Ko-fi with a reference code
2. Tip is verified via webhook
3. Ad submitted via web form (text description or audio upload)
4. Text ads: LLM moderation checks against content policy → auto-approved or rejected
5. Audio uploads: flagged for manual review
6. Approved text ads: LLM generates radio script → TTS → queued for broadcast
7. Ads play in rotation, weighted by play count (least-played first)

This is a genuine revenue pipeline and a competitive advantage — no other AI radio station offers this.

---

## Phase 4: Scale (Months 4-12)

**Goal**: 10,000+ weekly listeners. Multiple channels. Industry recognition.

### Multi-Channel Expansion
- **Genre-specific streams** — spin off successful show formats into 24/7 channels (e.g., "radioGAGA Ambient", "radioGAGA Techno")
- **YouTube simulcast** — audio visualiser stream on YouTube for passive discovery
- **Podcast network** — best shows distributed as daily/weekly podcasts
- **API for developers** — let others build on the radioGAGA content engine

### Strategic Partnerships (AI-Generated Content Only)
- **AI music platforms** (Suno, Udio) — feature their tools in programming, they promote the station
- **AI/ML conferences** — live broadcast from events
- **University research** — collaboration with audio/AI researchers, open data sharing
- **Other indie stations** — cross-promotion, shared technology

### Technology Roadmap
- [ ] Real-time voice cloning for more natural presenter voices
- [ ] Multi-language streams (AI-generated content in German, Spanish, Japanese)
- [ ] Listener-adaptive programming (adjust energy/genre based on listener count patterns)
- [ ] AI-generated visual identity (album art, show graphics, social media assets)
- [ ] Mobile app with push notifications for show transitions
- [ ] Icecast stats polling for listener count tracking
- [ ] Analytics dashboard (listeners over time, peak hours, popular shows)

---

## Key Metrics Dashboard

### Weekly Tracking

| Metric | Week 1 Target | Week 8 Target | Week 16 Target |
|--------|--------------|---------------|----------------|
| Peak concurrent listeners | 5 | 50 | 200 |
| Unique weekly listeners | 50 | 500 | 2,000 |
| Avg session length | 5 min | 15 min | 25 min |
| Return listener rate | 10% | 30% | 45% |
| Telegram bot users | 10 | 100 | 500 |
| Discord members | — | 50 | 300 |
| Social followers (total) | 20 | 500 | 3,000 |
| TikTok/Reels views (weekly) | 500 | 10,000 | 50,000 |
| Ko-fi supporters | 1 | 10 | 50 |
| Monthly revenue | $0 | $34 | $200 |
| Uptime | 95% | 99% | 99.5% |
| Listener ad submissions | 0 | 5/week | 20/week |

### Monthly Review Questions
1. Which show has the highest average session length? Why?
2. What time of day has the most listeners? Are we programming for that?
3. What social content performed best? Can we systematise it?
4. What technical failures caused listener drops? How do we prevent them?
5. Are presenters developing distinct personalities or converging?
6. How many listener ads are being submitted and approved? Is the revenue pipeline working?
7. What's the LLM cost trend? Is the filter.js elimination reducing costs?

---

## Immediate Action Items (Next 7 Days)

| Priority | Action | Impact |
|----------|--------|--------|
| P0 | Apply audit P0 fixes (rate limiting, TTS timeout, CORS, tmp cleanup, web-submissions bug) | Reliability |
| P0 | Merge filter.js into dj.js (audit P1 #5) | Cost reduction |
| P0 | Add SQLite indexes (audit P1 #6) | Performance |
| P1 | Set up TikTok/Instagram accounts, post first 5 clips | Discovery |
| P1 | Submit to TuneIn, Radio Garden, internet radio directories | Discovery |
| P1 | Create Discord server with core channels | Retention |
| P1 | Combine frontend polling into single endpoint | Performance |
| P2 | Build auto-clipper for broadcast highlights | Content pipeline |
| P2 | Audit and trim frontend dependencies | Load time |
| P2 | Create press kit page on radiogaga.ai | Media readiness |
| P2 | Implement presenter memory/callbacks | Programming depth |

---

## Architecture Snapshot (March 2026)

```
                    ┌─────────────┐
                    │  Listeners  │
                    └──────┬──────┘
                           │
              ┌────────────┴───────────┐
              │                        │
        ┌─────▼─────┐          ┌──────▼──────┐
        │  Icecast   │          │   Vite SPA  │
        │  /stream   │          │ radiogaga.ai│
        └─────▲─────┘          └──────┬──────┘
              │                        │
        ┌─────┴─────┐          ┌──────▼──────┐
        │  FFmpeg    │          │  Express API │
        │ (persistent│          │  :3000       │
        │  encoder)  │          └──────┬──────┘
        └─────▲─────┘                  │
              │                 ┌──────▼──────┐
        ┌─────┴─────┐          │   SQLite DB  │
        │   Stream   │          │  (WAL mode)  │
        │   Loop     │          └─────────────┘
        └─────▲─────┘
              │
        ┌─────┴─────┐     ┌──────────────┐
        │   Queue    │◄────│   Producer   │
        │   (FIFO)   │     │   Loop       │
        └────────────┘     └──────┬───────┘
                                  │
                    ┌─────────────┼──────────────┐
                    │             │              │
              ┌─────▼───┐  ┌─────▼───┐  ┌──────▼────┐
              │   DJ    │  │  Music  │  │  Adverts  │
              │ + Filter│  │ Archive │  │ + Catalog │
              └────┬────┘  └────┬────┘  └─────┬─────┘
                   │            │              │
              ┌────▼────┐  ┌───▼────┐   ┌─────▼─────┐
              │OpenRouter│  │Archive │   │  News     │
              │ LLM API │  │.org    │   │  Weather  │
              └────┬────┘  └────────┘   │  Guests   │
                   │                     │  Shoutouts│
              ┌────▼────┐               └───────────┘
              │edge-tts │
              │ (free)  │
              └─────────┘
```

---

## Programming Philosophy

> "The best radio makes you feel like you're overhearing something you shouldn't be.
> radioGAGA makes you feel like you're overhearing machines becoming people."

The station succeeds when listeners forget they're listening to AI — and then remember, and find that even more interesting. The goal is not to pass a Turing test. The goal is to be compelling enough that the Turing test becomes irrelevant.

Every decision should serve this: **make it weirder, make it warmer, make it impossible to stop listening.**

---

*Strategy document v2.0 — March 2026*
*Updated with audit findings, new features (adverts, moderation, news, weather, cost tracking, forms), and fresh strategic priorities.*
*radioGAGA: The signal never stops.*
