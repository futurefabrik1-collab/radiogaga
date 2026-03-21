# The radioGAGA Story

**Built in one session. From first prompt to live radio station in 24 hours.**

---

### 18:27 — Day 1, Thursday 20 March 2026
**"Build me an AI radio station."**

The first commit. A Node.js backend, Ollama running llama3.2-3b locally, edge-tts for voices, FFmpeg piping audio to Icecast, and a Vite React frontend with floating light nodes on a dark canvas. One DJ voice. One show. Music from Archive.org. The signal starts.

### 22:10 — Night 1
**The station gets a personality.**

10 shows across 24 hours, each with a distinct AI presenter. Sol the overnight philosopher. Jamie & Rosa's chaotic breakfast show. Viv's peak-energy evening hype. Studio atmosphere added — synthetic foley sounds (paper rustling, mugs clinking, keyboards tapping) layered under speech. Telegram bot goes live. Jingles. Competitions. The station starts to feel like a station.

### 00:07 — Past midnight
**The infrastructure breaks.**

Ollama is eating 160% CPU and 2.6GB RAM on a $48/month droplet. Frontend builds hang. We switch to Groq API — generation drops from 20-30 seconds to 1-2 seconds. The 3-billion parameter local model becomes a 70-billion parameter cloud model. Everything gets dramatically better.

### 10:42 — Day 2, Friday 21 March
**Migration day.**

New $12/month droplet. Full server migration. But Groq blocks all DigitalOcean IPs. Panic. Switch to OpenRouter — same model, works from anywhere. Cost drops from $48/mo to $12/mo. Hourly positive-only news bulletins with a dedicated anchor (Clara Fontaine). Real weather forecasts from random global locations. Live cost tracker on the website showing every cent spent. The station becomes transparent.

### 11:57 — The audio gets professional
**No more glitches.**

The MP3 frame boundary bug that caused "Header missing" errors all morning — solved by switching to raw PCM piping. Every segment now decoded to s16le before hitting the main FFmpeg encoder. Zero audio glitches. Music fades into DJ speech. News bulletins overlay onto pulse stings. The crossfade engine makes transitions seamless.

### 12:04 — Content health check
**11 dead RSS feeds removed.** Replaced with working ones. Headlines jump from 119 to 132.

### 12:13 — The advertising revolution
**Listeners can now buy airtime.**

"Place an Advert" form with two modes: describe your ad (AI generates it) or upload your own MP3. Every submission passes through an LLM content moderator that enforces the station's moral values — no weapons, no politics, no religion, no scams, no exploitation. Coffee shop ad? Approved. Assault rifles? Rejected with reason. Ko-fi tip required before submission unlocks. 27 ad slots per day.

### 16:50 — Payment gates
**No tip, no submit.** Each ad form generates a unique reference code. Tip on Ko-fi with the code. Click verify. Form unlocks. Revenue pipeline complete.

### 16:59 — The audit
**25 source files reviewed.** 19 recommendations across 4 priority levels. Double LLM calls found and eliminated. Missing database indexes. No rate limiting on public APIs. Tmp files accumulating forever. Web suggestions silently failing. 40 unused frontend packages bloating the bundle by 1MB.

### 17:02 — Rapid fixes
**Every audit finding fixed in one commit.** Rate limiting. TTS timeouts. CORS locked down. Tmp cleanup cron. Filter.js eliminated (DJ generation drops from 14s to 3s). Database indexes. Frontend pruned from 1.5MB to 700KB. Two bugs squashed.

### 17:46 — The repetition mystery
**"Why do I keep hearing the same stories?"**

Root cause: 116 PM2 restarts in one day (from all our deploys). Each restart wiped the in-memory headline cache. Same RSS stories kept getting picked. Fix: persist used headlines to disk. Also found that listener suggestions were never marked as used — the same "Often Vague" references played on loop for hours. Fixed.

### 17:52 — Mobile
**Full-screen popups. 48px touch targets. Responsive node positions. Volume slider hidden on phones.** The site finally works in your pocket.

### 18:27 — The growth engine starts
**The station is ready. Now it needs ears.**

Auto-clipper built: records 45-second clips from the live stream, generates vertical video with waveform visualiser and LLM-written captions for TikTok and Reels. Press kit page goes live at /press. Station submitted to radio-browser.info (powers Radio Garden and dozens of radio apps). Discord auto-posts now-playing embeds.

---

## By the numbers

| Metric | Value |
|--------|-------|
| Time from first prompt to live | ~4 hours |
| Time from live to fully featured | ~24 hours |
| Total commits | 14 |
| Lines of code written | ~8,000 |
| Lines deleted (cleanup) | ~3,000 |
| Monthly running cost | €34 |
| Content types | 12 |
| AI presenters | 8 |
| Shows per day | 10 |
| Max concurrent listeners | 2,048 |
| Generation speed | 30 min of radio in 2 min |
| Server migrations | 2 |
| LLM provider switches | 3 (Ollama → Groq → OpenRouter) |
| PM2 restarts in one day | 131 |
| Bugs found and fixed | 14 |
| Audit recommendations implemented | 12/12 |
| RSS feeds (alive) | 37 |
| Fictional products advertised | 200+ |
| Real weapons ads rejected | 1 |

---

## The stack that runs a radio station for €34/month

```
OpenRouter (llama-3.3-70b)  →  LLM generates all speech content
edge-tts (Microsoft, free)  →  8 distinct AI voices
FFmpeg                      →  audio processing, crossfade, streaming
Icecast                     →  serves the live stream
Archive.org                 →  CC-licensed music library
Open-Meteo                  →  real weather data
SQLite                      →  everything persistent
Express                     →  API server
Vite + React                →  frontend
DigitalOcean                →  1 vCPU, 2GB RAM, that's it
```

---

*radioGAGA: the signal never stops.*
*Built by a human and an AI, for humans and AIs, about what happens when the line between them gets weird.*
