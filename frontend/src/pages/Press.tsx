import { useEffect, useState } from "react";

interface CostData { totalCost: number; uptimeDays: number; totalSegments: number; donations: number; }

export default function Press() {
  const [costs, setCosts] = useState<CostData | null>(null);
  useEffect(() => { fetch("/api/costs").then(r => r.json()).then(setCosts).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16 font-mono">

        <a href="/" className="text-foreground/40 text-sm hover:text-foreground/70 transition-colors">← Back to radioGAGA</a>

        <h1 className="text-5xl font-serif font-light mt-8 mb-2" style={{ color: "hsl(35, 80%, 65%)" }}>
          Press Kit
        </h1>
        <p className="text-foreground/50 text-sm mb-12">Everything you need to write about radioGAGA.</p>

        {/* One-liner */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">In one sentence</h2>
          <p className="text-xl font-serif text-foreground/90 leading-relaxed">
            radioGAGA is the world's first fully AI-generated 24/7 radio station — every voice, every track, every advert, every news bulletin created by artificial intelligence in real time.
          </p>
        </section>

        {/* Key facts */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">Key facts</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Shows", value: "10" },
              { label: "AI Presenters", value: "8" },
              { label: "Content types", value: "12" },
              { label: "Monthly cost", value: "~€34" },
            ].map(f => (
              <div key={f.label} className="p-3 rounded" style={{ background: "hsla(35,80%,65%,0.05)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
                <span className="block text-2xl font-light" style={{ color: "hsl(35, 80%, 65%)" }}>{f.value}</span>
                <span className="text-[10px] tracking-widest uppercase text-foreground/40">{f.label}</span>
              </div>
            ))}
          </div>
          {costs && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="p-3 rounded" style={{ background: "hsla(35,80%,65%,0.05)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
                <span className="block text-2xl font-light" style={{ color: "hsl(35, 80%, 65%)" }}>{Math.ceil(costs.uptimeDays)}</span>
                <span className="text-[10px] tracking-widest uppercase text-foreground/40">Days on air</span>
              </div>
              <div className="p-3 rounded" style={{ background: "hsla(35,80%,65%,0.05)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
                <span className="block text-2xl font-light" style={{ color: "hsl(35, 80%, 65%)" }}>{costs.totalSegments.toLocaleString()}</span>
                <span className="text-[10px] tracking-widest uppercase text-foreground/40">Segments generated</span>
              </div>
              <div className="p-3 rounded" style={{ background: "hsla(35,80%,65%,0.05)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
                <span className="block text-2xl font-light" style={{ color: "hsl(35, 80%, 65%)" }}>€{costs.totalCost.toFixed(2)}</span>
                <span className="text-[10px] tracking-widest uppercase text-foreground/40">Total cost so far</span>
              </div>
            </div>
          )}
        </section>

        {/* What makes it different */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">What makes it different</h2>
          <ul className="space-y-3 text-sm text-foreground/70 leading-relaxed">
            <li><strong className="text-foreground/90">100% AI generated.</strong> Not AI-assisted. Every sound — speech, music, ads, jingles, news, weather — is created by machines. No human touches the broadcast.</li>
            <li><strong className="text-foreground/90">Self-aware.</strong> The presenters know they're language models. They joke about hallucinating, about their training data, about the absurdity of machines doing creative work.</li>
            <li><strong className="text-foreground/90">Real-time.</strong> Content is generated live, not pre-baked. The station evolves, surprises itself, and occasionally goes delightfully off the rails.</li>
            <li><strong className="text-foreground/90">Transparent costs.</strong> Running costs are displayed live on the website. Listeners can see exactly what it costs to keep the signal on — currently ~€34/month.</li>
            <li><strong className="text-foreground/90">Community-driven.</strong> Listeners submit shoutouts, track requests, show ideas, and even their own adverts — all processed and broadcast by AI.</li>
          </ul>
        </section>

        {/* Tech stack */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">Technical stack</h2>
          <div className="text-sm text-foreground/60 space-y-1">
            <p><strong className="text-foreground/80">LLM:</strong> llama-3.3-70b via OpenRouter</p>
            <p><strong className="text-foreground/80">TTS:</strong> Microsoft edge-tts (8 distinct voices)</p>
            <p><strong className="text-foreground/80">Audio:</strong> FFmpeg (processing, crossfade, streaming)</p>
            <p><strong className="text-foreground/80">Streaming:</strong> Icecast (2,048 concurrent capacity)</p>
            <p><strong className="text-foreground/80">Music:</strong> CC-licensed tracks from Archive.org netlabels</p>
            <p><strong className="text-foreground/80">Hosting:</strong> DigitalOcean (€12/mo droplet)</p>
            <p><strong className="text-foreground/80">Weather:</strong> Open-Meteo (free, real data)</p>
          </div>
        </section>

        {/* Listen */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">Listen now</h2>
          <div className="p-4 rounded" style={{ background: "hsla(35,80%,65%,0.05)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
            <audio controls src="https://www.radiogaga.ai/stream" className="w-full mb-3" />
            <p className="text-xs text-foreground/40">Direct stream: <code className="text-foreground/60">https://www.radiogaga.ai/stream</code></p>
            <p className="text-xs text-foreground/40 mt-1">Website: <a href="https://www.radiogaga.ai" className="underline hover:text-foreground/70">radiogaga.ai</a></p>
          </div>
        </section>

        {/* Embed */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">Embed player</h2>
          <code className="block p-3 rounded text-[11px] text-foreground/60 leading-relaxed overflow-x-auto" style={{ background: "hsla(0,0%,100%,0.03)" }}>
            {`<iframe src="https://www.radiogaga.ai" width="400" height="300" frameborder="0" allow="autoplay" />`}
          </code>
        </section>

        {/* Story angles */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">Story angles</h2>
          <ul className="space-y-2 text-sm text-foreground/60">
            <li>🎙 <strong className="text-foreground/80">"What happens when AI runs a radio station 24/7"</strong> — the experiment, the surprises, the failures</li>
            <li>💰 <strong className="text-foreground/80">"A radio station that costs €34/month"</strong> — democratisation of broadcasting</li>
            <li>🤖 <strong className="text-foreground/80">"The presenters know they're AI"</strong> — self-aware machines and the comedy of artificial consciousness</li>
            <li>📰 <strong className="text-foreground/80">"Good news only"</strong> — the positive-only news bulletin as antidote to doom-scrolling</li>
            <li>🧠 <strong className="text-foreground/80">"Self-improvement through AI radio"</strong> — neuroscience, culture, and funny self-reflection</li>
          </ul>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-xs tracking-[0.3em] uppercase text-foreground/40 mb-3">Contact</h2>
          <div className="text-sm text-foreground/60 space-y-1">
            <p>Discord: <a href="https://discord.gg/f5nUxk6v" className="underline" target="_blank" rel="noopener noreferrer">discord.gg/f5nUxk6v</a></p>
            <p>LinkedIn: <a href="https://www.linkedin.com/company/radiogaga" className="underline" target="_blank" rel="noopener noreferrer">linkedin.com/company/radiogaga</a></p>
            <p>Instagram: <a href="https://www.instagram.com/radioGAIGAI" className="underline" target="_blank" rel="noopener noreferrer">@radioGAIGAI</a></p>
          </div>
        </section>

        <footer className="pt-8 border-t border-foreground/5 text-[10px] text-foreground/30 tracking-widest uppercase">
          radioGAGA — the signal never stops
        </footer>
      </div>
    </div>
  );
}
