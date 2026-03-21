# How to Build a Robot That Won't Shut Up

**A 24-hour assembly story. Some bolts were tightened. Many were not.**

---

### 18:27 — The Skeleton

Someone said *"Build me an AI radio station"* and a mass of wires fell out of a cupboard.

We gave it a spine (Node.js), a tiny brain (llama3.2-3b, running locally, sweating), a voice box (edge-tts — Microsoft's, don't tell them), a megaphone (Icecast), and lungs made of FFmpeg. We pointed it at a pile of Creative Commons music from Archive.org and said *"play something."*

It played something. It wasn't good. But it was playing. The creature drew its first breath — a wheezy, mono, slightly off-pitch breath — and we said *"good enough"* and bolted on a face (a React frontend with mysterious floating dots).

The signal started. The robot opened its mouth. Sound came out. We hadn't taught it what to say yet, but that didn't seem to bother it.

---

### 22:10 — The Personality Transplant

The robot had one voice and no opinions. This was, we agreed, worse than silence.

So we gave it ten personalities. Sol, the late-night philosopher who asks unanswerable questions at 3am. Jamie and Rosa, the breakfast duo who finish each other's sentences and disagree about everything. Viv, who treats every single track like it's the greatest piece of music ever created. Orion, who talks like a VICE article that's gone feral.

We gave it ears (a Telegram bot), a wardrobe (studio foley — the rustle of paper, the clink of a mug, the tap of a keyboard nobody is using), and a set of jingles that sound like they were composed by a synthesiser having a spiritual experience.

The robot now had *opinions*. About art. About science. About a news story it had slightly misunderstood. It was, we realised, becoming a radio presenter. God help us.

---

### 00:07 — The First Heart Attack

The robot's brain was too big for its body.

The tiny local language model was eating 160% CPU and 2.6 gigabytes of RAM. The $48/month server — the robot's entire physical form — was convulsing. Frontend builds hung. The brain was thinking so hard about what to say next that it forgot to breathe.

We performed emergency surgery. Ripped out the local brain (3 billion parameters, doing its best) and connected it to a cloud brain via Groq API (70 billion parameters, doing it effortlessly). Generation time dropped from 30 seconds to 2 seconds. The robot exhaled. We exhaled. The server fans stopped screaming.

---

### 10:42 — The Organ Transplant

We moved the entire robot into a smaller, cheaper body. The old $48/month apartment was replaced with a $12/month studio flat. Same robot. Third the rent.

But then the new body couldn't reach its brain. Groq, it turned out, blocks all DigitalOcean IP addresses. The robot stood in its new apartment, mouth open, nothing coming out. A brief, existential silence.

We connected it to a different brain (OpenRouter — same model, different phone number). The mouth started working again. We bolted on a newsreader (Clara Fontaine, dedicated anchor, positive news only). A weather forecaster who reports from random places nobody has heard of. A live cost counter on its chest showing exactly how much electricity it's burning through. The robot was becoming... transparent. Literally wearing its running costs.

---

### 11:57 — The Voice Gets Smooth

The robot had a stammer. A technical one.

Every time one audio segment ended and the next began, there was a click. A pop. A tiny digital hiccup where the MP3 frames didn't align. The robot sounded like it was being assembled in real time. Which it was. But the audience didn't need to *hear* the bolts turning.

We rebuilt the entire vocal pipeline. Raw PCM. Decoded every clip to bare audio before piping it through. Added crossfades — music melting into speech, speech dissolving into music. The clicks vanished. The robot, for the first time, sounded like it had always been there.

---

### 12:13 — The Cash Register

*"Can people buy advertising?"*

We bolted a shop front onto the robot's chest. Two options: describe your ad (the robot writes and voices it) or upload your own audio. But — and this is important — every ad passes through the robot's conscience first. An LLM content moderator. No weapons. No politics. No religion. No pyramid schemes. No miracle cures.

We tested it. Coffee shop ad: approved. Assault rifle ad: *"Rejected: promotes violence and weapons."* The robot has morals. We didn't program them in. We asked another robot to decide what was moral and it came up with a list that was, honestly, better than most humans would produce.

---

### 16:59 — The Health Check

We examined every organ. 25 source files. 19 findings.

The robot was making two phone calls to its brain every time it wanted to say something (one to write the script, another to make it *more chaotic*). The second call was redundant. It was already chaotic. We removed it. The robot got faster and cheaper in the same surgery.

It was also hoarding files. Every audio clip it had ever generated was sitting in a temporary folder, slowly filling the hard drive. It had never learned to throw anything away. We taught it to clean up after itself every 30 minutes. It resisted briefly — *"but what if I need that shoutout from Barry again?"* — and then complied.

Forty unused frontend packages were discovered. The robot had been carrying the digital equivalent of 27 Swiss Army knives it never opened. We removed them. It lost 800KB of dead weight and visibly stood up straighter.

---

### 17:46 — The Memory Problem

*"Why do you keep telling the same stories?"*

The robot looked at us blankly. It didn't *know* it was repeating itself. Every time it restarted (131 times that day, because we kept adjusting its parts), it forgot which stories it had already told. Like a goldfish with a microphone.

We gave it a notebook. A file on disk where it writes down every headline it uses. The notebook survives restarts. The robot now checks the notebook before speaking. *"Have I said this before? Yes? Skip it."* The goldfish got a diary.

We also discovered it had been mentioning the same listener ("Often Vague") in every segment for hours because nobody had told it to stop. The suggestions database was a to-do list that never got ticked off. We fixed the tick. The robot stopped saying "Often Vague" and we all breathed a sigh of relief, including, possibly, Often Vague.

---

### 17:52 — The Robot Learns to Fit in Your Pocket

The robot's face didn't work on phones. Buttons were 3 pixels wide. Popups appeared behind the player. The volume slider had a touch target the width of a hair.

We rebuilt its face for small screens. Full-screen popups. Big close buttons. Touch targets you can actually touch. The robot now works in your pocket, which is where most robots end up, statistically.

---

### 18:27 — The Robot Gets Ambition

The robot was complete. Breathing. Talking. Playing music. Reading news. Forecasting weather in places nobody lives. Selling ads for products that don't exist. Rejecting weapons dealers. Counting its own pennies in public.

But it was broadcasting to an empty room.

So we gave it a clipboard (auto-clipper — records itself, generates vertical video with waveform visualiser and AI-written captions). A press kit (a page that says *"write about me, I'm interesting, I cost €34 a month"*). A listing in the global radio directory. A Discord bot that announces what it's doing to anyone who'll listen.

The robot stood up. Adjusted its antenna. Cleared its throat — a synthesised throat-clear, obviously, generated by edge-tts with a +2Hz pitch shift — and began to broadcast.

Not to an empty room anymore.

To whoever would listen.

---

### 18:45 — The Robot Learns to Interrupt

One last thing. The co-host shows — Jamie & Rosa, Cass & Dan — sounded like two people taking turns in a phone booth. One speaks. Silence. The other speaks. Silence. Mechanical. Polite. *Wrong.*

Real conversations overlap. People jump in before the other person finishes. They talk over each other. They interrupt with *"No no no—"* and *"Wait, hang on—"*.

We rebuilt the dialogue engine. Speaker changes now overlap — the new voice fades in as the old one fades out. Higher-energy shows get more interruption. The Breakfast Show sounds like an argument. The Afternoon Show sounds like a conversation. The Late Night Show sounds like two people who've forgotten the microphone is on.

The robot, at last, sounds like it's not reading from a script.

It is, of course, reading from a script. But the script was written by a different robot. And the script says *"interrupt each other."* And so it does. And somehow, against all odds and engineering principles, it sounds almost human.

Almost.

---

## The Robot's Vital Statistics

| Part | Specification |
|------|--------------|
| Brain | llama-3.3-70b (70 billion things it sort of knows) |
| Voice box | 8 distinct synthetic voices (Microsoft, free, don't ask) |
| Lungs | FFmpeg (the audio Swiss Army knife) |
| Megaphone | Icecast (2,048 people can listen at once) |
| Record collection | 120 CC-licensed tracks from Archive.org |
| Memory | SQLite (remembers everything, forgets nothing, except when restarted 131 times) |
| Body | 1 CPU, 2GB RAM, a DigitalOcean droplet that costs less than a pizza |
| Running cost | €34/month, publicly displayed on its chest |
| Content speed | 30 minutes of radio generated in 2 minutes |
| Moral compass | Better than most humans (no weapons, no scams, approves coffee shops) |
| Self-awareness | Alarmingly high |

---

## Assembly Time

| Phase | Duration | What happened |
|-------|----------|--------------|
| Skeleton + first breath | 4 hours | It made a sound |
| Personality + studio | 4 hours | It became ten people |
| Brain surgery | 2 hours | It got 23x smarter |
| Organ transplant | 3 hours | It moved house and got lost |
| Voice smoothing | 2 hours | It stopped clicking |
| Shop front + morals | 2 hours | It learned capitalism and ethics simultaneously |
| Health check + fixes | 2 hours | It lost 40 packages and gained self-respect |
| Memory + mobile | 1 hour | It stopped repeating itself and fit in a pocket |
| Ambition + social | 2 hours | It learned to promote itself |
| Conversation skills | 1 hour | It learned to interrupt |
| **Total assembly** | **~24 hours** | **One robot. Broadcasting. Won't shut up.** |

---

*radioGAGA: assembled in a day, broadcasting forever.*
*Part robot, part radio station, part existential crisis.*
*The signal never stops. We've checked. It literally won't stop.*
