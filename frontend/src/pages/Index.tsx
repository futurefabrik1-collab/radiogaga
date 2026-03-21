import { useState, useEffect, useCallback, useRef } from "react";
import AtmosphericCanvas from "@/components/AtmosphericCanvas";
import ParticleField from "@/components/ParticleField";
import LightNode from "@/components/LightNode";
import ContentSection from "@/components/ContentSection";
import ScrollSections from "@/components/ScrollSections";
import RadioPlayer from "@/components/RadioPlayer";
import Ticker from "@/components/Ticker";
import TelegramPanel from "@/components/TelegramPanel";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Index() {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollSpeed, setScrollSpeed] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const lastScrollTime = useRef(Date.now());
  const scrollSpeedRef = useRef(0);
  const { t } = useLanguage();

  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setMouseX(e.clientX);
    setMouseY(e.clientY);
  }, []);

  useEffect(() => {
    let decayRaf: number;
    const decay = () => {
      scrollSpeedRef.current *= 0.92;
      if (scrollSpeedRef.current < 0.005) scrollSpeedRef.current = 0;
      setScrollSpeed(scrollSpeedRef.current);
      decayRaf = requestAnimationFrame(decay);
    };
    decayRaf = requestAnimationFrame(decay);

    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const scrollTop = window.scrollY;
      const scrollHeight = el.scrollHeight - window.innerHeight;
      setScrollProgress(Math.min(1, Math.max(0, scrollTop / scrollHeight)));

      const now = Date.now();
      const dt = Math.max(1, now - lastScrollTime.current);
      const dy = Math.abs(scrollTop - lastScrollY.current);
      const velocity = Math.min(1, dy / dt / 3); // normalise: ~3000px/s = 1.0
      scrollSpeedRef.current = Math.max(scrollSpeedRef.current, velocity);
      lastScrollY.current = scrollTop;
      lastScrollTime.current = now;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(decayRaf);
    };
  }, []);

  const [dims, setDims] = useState({ vw: typeof window !== "undefined" ? window.innerWidth : 1200, vh: typeof window !== "undefined" ? window.innerHeight : 800 });
  useEffect(() => {
    const onResize = () => setDims({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
  }, []);
  const { vw, vh } = dims;
  const mobile = vw < 640;
  // Clamp node positions: min 50px from edges, max vw-50 / vh-200 (above player)
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const nx = (pct: number) => clamp(vw * pct, 50, vw - 50);
  const ny = (pct: number) => clamp(vh * pct, 60, vh - 220);

  const nodes = [
    { id: "request", label: "Request", x: nx(0.2), y: ny(0.3), hue: 35, freqBand: 0 },
    { id: "about", label: "About", x: nx(0.75), y: ny(0.2), hue: 200, freqBand: 2 },
    { id: "shoutout", label: "Shoutout", x: nx(0.55), y: ny(0.5), hue: 340, freqBand: 4 },
    { id: "show-idea", label: "Show Idea", x: nx(mobile ? 0.25 : 0.15), y: ny(0.6), hue: 130, freqBand: 6 },
    { id: "advert", label: "Advertise", x: nx(0.4), y: ny(0.4), hue: 280, freqBand: 7 },
    { id: "listen", label: t("node.listen"), x: nx(mobile ? 0.75 : 0.82), y: ny(0.65), hue: 45, freqBand: 8 },
  ];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative min-h-[500vh] cursor-crosshair"
    >
      <div className="grain-overlay" />
      <AtmosphericCanvas scrollProgress={scrollProgress} mouseX={mouseX} mouseY={mouseY} />
      <ParticleField scrollProgress={scrollProgress} mouseX={mouseX} mouseY={mouseY} />

      {/* Title + scroll hint — behind dots (z-10) */}
      <section className="fixed inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
        <div
          className="text-center transition-all duration-1000"
          style={{
            opacity: loaded ? Math.max(0, 1 - scrollProgress * 4) : 0,
            transform: `translateY(${scrollProgress * -60}px)`,
          }}
        >
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-light tracking-tight text-foreground/90 mb-4 leading-[0.95]">
            radioGAGA
          </h1>
          <p className="text-poetic text-2xl md:text-3xl max-w-md mx-auto">
            {t("hero.subtitle")}
          </p>
        </div>

        <div
          className="absolute bottom-24 flex flex-col items-center gap-2 transition-opacity duration-1000"
          style={{ opacity: scrollProgress < 0.05 ? 0.5 : 0 }}
        >
          <span className="text-label text-sm">{t("hero.scroll")}</span>
          <div className="w-px h-8 bg-foreground/20 animate-breathe" />
        </div>
      </section>



      <div
        className="fixed inset-0 z-20 pointer-events-none"
        style={{ opacity: loaded ? 1 : 0, transition: "opacity 2s ease 0.5s" }}
      >
        <div className="pointer-events-auto">
          {nodes.map((node) => (
            <LightNode key={node.id} {...node} mouseX={mouseX} mouseY={mouseY} scrollSpeed={scrollSpeed}>
              <NodeContent id={node.id} />
            </LightNode>
          ))}
        </div>
      </div>

      <ScrollSections scrollProgress={scrollProgress} />
      <PoeticOverlays scrollProgress={scrollProgress} loaded={loaded} />

      {/* Telegram bot panel — top centre */}
      <div
        className="fixed top-[18%] left-1/2 -translate-x-1/2 z-40 transition-opacity duration-700"
        style={{ opacity: loaded ? 1 : 0 }}
      >
        <TelegramPanel compact />
      </div>

      <RadioPlayer />
      <Ticker />
    </div>
  );
}

function PoeticOverlays({ scrollProgress, loaded }: { scrollProgress: number; loaded: boolean }) {
  const { t } = useLanguage();
  const phrases = [
    { key: "poem.1" as const, start: 0.15, end: 0.3 },
    { key: "poem.2" as const, start: 0.35, end: 0.5 },
    { key: "poem.3" as const, start: 0.55, end: 0.7 },
    { key: "poem.4" as const, start: 0.78, end: 0.95 },
  ];

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none">
      {phrases.map((phrase, i) => {
        const inRange = scrollProgress >= phrase.start && scrollProgress <= phrase.end;
        const mid = (phrase.start + phrase.end) / 2;
        const distFromMid = Math.abs(scrollProgress - mid) / ((phrase.end - phrase.start) / 2);
        const opacity = inRange ? Math.max(0, 1 - distFromMid * 1.2) : 0;

        return (
          <p
            key={i}
            className="absolute text-poetic text-3xl md:text-5xl text-center max-w-lg transition-none"
            style={{
              opacity: loaded ? opacity : 0,
              transform: `translateY(${(1 - opacity) * 20}px)`,
            }}
          >
            {t(phrase.key)}
          </p>
        );
      })}
    </div>
  );
}

function FormInput({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-label text-[9px] tracking-widest uppercase block mb-1">{label}</label>
      <input {...props} className="w-full bg-foreground/5 border border-foreground/10 rounded px-3 py-2 text-sm text-foreground/90 font-mono placeholder:text-foreground/20 focus:outline-none focus:border-foreground/30 transition-colors" />
    </div>
  );
}

function FormTextarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="text-label text-[9px] tracking-widest uppercase block mb-1">{label}</label>
      <textarea {...props} className="w-full bg-foreground/5 border border-foreground/10 rounded px-3 py-2 text-sm text-foreground/90 font-mono placeholder:text-foreground/20 focus:outline-none focus:border-foreground/30 transition-colors resize-none" />
    </div>
  );
}

function FormSelect({ label, options, ...props }: { label: string; options: { value: string; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div>
      <label className="text-label text-[9px] tracking-widest uppercase block mb-1">{label}</label>
      <select {...props} className="w-full bg-foreground/5 border border-foreground/10 rounded px-3 py-2 text-sm text-foreground/90 font-mono focus:outline-none focus:border-foreground/30 transition-colors">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SubmitButton({ children, sent }: { children: React.ReactNode; sent: boolean }) {
  return (
    <button
      type="submit"
      disabled={sent}
      className="w-full py-2 rounded font-mono text-[10px] tracking-widest uppercase transition-all duration-300"
      style={{
        background: sent ? "hsla(130, 60%, 50%, 0.15)" : "hsla(35, 80%, 65%, 0.15)",
        color: sent ? "hsl(130, 60%, 65%)" : "hsl(35, 80%, 65%)",
        border: `1px solid ${sent ? "hsla(130, 60%, 50%, 0.2)" : "hsla(35, 80%, 65%, 0.2)"}`,
      }}
    >
      {sent ? "sent" : children}
    </button>
  );
}

function AdvertForm({ sent, submit }: { sent: boolean; submit: (url: string, data: any) => void }) {
  const [tab, setTab] = useState<"text" | "upload">("text");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tipVerified, setTipVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [refCode] = useState(() => "AD-" + Math.random().toString(36).slice(2, 6).toUpperCase());
  const [slots, setSlots] = useState<{ total: number; booked: number; remaining: number; nextSlotMinutes: number } | null>(null);

  useEffect(() => {
    fetch("/api/ad-slots").then(r => r.json()).then(setSlots).catch(() => {});
    const id = setInterval(() => fetch("/api/ad-slots").then(r => r.json()).then(setSlots).catch(() => {}), 60_000);
    return () => clearInterval(id);
  }, []);

  const verifyTip = async () => {
    setVerifying(true);
    try {
      const res = await fetch(`/api/verify-tip?ref=${refCode}`);
      const data = await res.json();
      if (data.verified) {
        setTipVerified(true);
      } else {
        setRejected("Tip not found yet. Make sure you included the code in your Ko-fi message, then try again.");
      }
    } catch {
      setRejected("Could not verify — please try again.");
    }
    setVerifying(false);
  };

  const handleTextSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tipVerified) return;
    setRejected(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/advert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: f.get("business_name"),
        product: f.get("product"),
        description: f.get("description"),
        tone: f.get("tone"),
        target_audience: f.get("target_audience"),
        website: f.get("website"),
        submitter_name: f.get("submitter_name"),
        payment_ref: refCode,
      }),
    });
    const data = await res.json();
    if (data.moderation_status === "rejected") {
      setRejected(data.reason || "Content does not meet our guidelines.");
    } else {
      submit("/api/advert", {});
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tipVerified || !uploadFile) return;
    setUploading(true);
    setRejected(null);
    const f = new FormData(e.currentTarget);
    f.append("audio", uploadFile);
    f.append("payment_ref", refCode);
    try {
      const res = await fetch("/api/advert", { method: "POST", body: f });
      const data = await res.json();
      if (data.ok) submit("/api/advert", {});
      else setRejected(data.error || "Upload failed");
    } catch {
      setRejected("Upload failed — please try again");
    }
    setUploading(false);
  };

  return (
    <ContentSection title="Place an Advert" subtitle="Promote your business on radioGAGA">
      {/* Ad slot availability */}
      {slots && (
        <div className="mb-3 p-2 rounded font-mono text-[10px] flex items-center justify-between"
          style={{ background: slots.remaining > 0 ? "hsla(130,60%,40%,0.08)" : "hsla(0,70%,50%,0.08)", border: `1px solid ${slots.remaining > 0 ? "hsla(130,60%,50%,0.15)" : "hsla(0,70%,50%,0.15)"}` }}>
          <span style={{ color: slots.remaining > 0 ? "hsl(130,60%,55%)" : "hsl(0,70%,65%)" }}>
            {slots.remaining > 0
              ? `${slots.remaining} of ${slots.total} ad slots available today`
              : `All ${slots.total} slots booked`}
          </span>
          {slots.remaining === 0 && (
            <span className="text-foreground/40">Next slot in ~{slots.nextSlotMinutes}min</span>
          )}
        </div>
      )}

      {slots && slots.remaining === 0 ? (
        <p className="text-center text-foreground/50 font-mono text-[11px] py-4">
          All ad slots for today are booked. Check back in ~{slots.nextSlotMinutes} minutes.
        </p>
      ) : <>
      {/* Step 1: Ko-fi tip (always shown first) */}
      <div className="mb-3 p-3 rounded" style={{ background: "hsla(35,80%,65%,0.05)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
        <p className="text-[10px] font-mono text-foreground/60 mb-2">
          <strong className="text-foreground/80">Step 1:</strong> Tip any amount on Ko-fi with this code in your message:
        </p>
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className="font-mono text-lg tracking-[0.3em] font-bold" style={{ color: "hsl(35, 80%, 65%)" }}>{refCode}</span>
        </div>
        <a href={`https://ko-fi.com/radiogaga?message=${encodeURIComponent(refCode)}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-mono tracking-wider uppercase transition-colors hover:bg-foreground/10 mb-2"
          style={{ color: "hsl(35, 80%, 65%)", border: "1px solid hsla(35,80%,65%,0.2)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>
          {tipVerified ? "✓ Tip verified" : "Tip on Ko-fi (any amount)"}
        </a>
        {!tipVerified && (
          <button onClick={verifyTip} disabled={verifying}
            className="w-full py-1.5 rounded text-[10px] font-mono tracking-wider uppercase transition-colors"
            style={{ color: "hsla(0,0%,100%,0.5)", border: "1px solid hsla(0,0%,100%,0.1)" }}>
            {verifying ? "Checking..." : "Step 2: Verify my tip"}
          </button>
        )}
        {tipVerified && (
          <p className="text-[10px] font-mono text-center" style={{ color: "hsl(130, 60%, 55%)" }}>✓ Payment verified — form unlocked</p>
        )}
      </div>

      {rejected && (
        <div className="mb-3 p-2 rounded text-[10px] font-mono" style={{ background: "hsla(0,70%,50%,0.1)", color: "hsl(0,70%,65%)", border: "1px solid hsla(0,70%,50%,0.2)" }}>
          {rejected}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        {(["text", "upload"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-1.5 rounded text-[10px] font-mono tracking-widest uppercase transition-colors"
            style={{
              color: tab === t ? "hsl(35, 80%, 65%)" : "hsla(0,0%,100%,0.4)",
              background: tab === t ? "hsla(35,80%,65%,0.1)" : "transparent",
              border: `1px solid ${tab === t ? "hsla(35,80%,65%,0.2)" : "hsla(0,0%,100%,0.05)"}`,
              opacity: tipVerified ? 1 : 0.4,
              pointerEvents: tipVerified ? "auto" : "none",
            }}
          >{t === "text" ? "Describe Your Ad" : "Upload Audio"}</button>
        ))}
      </div>

      <div style={{ opacity: tipVerified ? 1 : 0.3, pointerEvents: tipVerified ? "auto" : "none" }}>
        {tab === "text" ? (
          <form onSubmit={handleTextSubmit} className="space-y-2">
            <FormInput label="Business name" name="business_name" placeholder="Neon Synth Co." required />
            <FormInput label="Product or service" name="product" placeholder="AI synth plugin" required />
            <FormTextarea label="Description" name="description" placeholder="What should listeners know?" rows={2} required maxLength={500} />
            <FormSelect label="Tone" name="tone" options={[
              { value: "casual", label: "Casual" },
              { value: "professional", label: "Professional" },
              { value: "humorous", label: "Humorous" },
              { value: "dramatic", label: "Dramatic" },
              { value: "retro", label: "Retro" },
            ]} />
            <FormInput label="Target audience" name="target_audience" placeholder="e.g. musicians" />
            <FormInput label="Website" name="website" placeholder="https://..." />
            <FormInput label="Your name" name="submitter_name" placeholder="Optional" />
            <SubmitButton sent={sent}>Submit for Review</SubmitButton>
          </form>
        ) : (
          <form onSubmit={handleUploadSubmit} className="space-y-2">
            <FormInput label="Business name" name="business_name" placeholder="Neon Synth Co." required />
            <FormInput label="Product or service" name="product" placeholder="AI synth plugin" required />
            <FormTextarea label="Brief description" name="description" placeholder="What's the ad about?" rows={2} required maxLength={500} />
            <div>
              <label className="text-label text-[9px] tracking-widest uppercase block mb-1 text-foreground/50">Audio file (MP3, max 60s / 5MB)</label>
              <input type="file" accept=".mp3,audio/mpeg" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] font-mono text-foreground/60 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[10px] file:font-mono file:tracking-wider file:uppercase file:bg-foreground/10 file:text-foreground/60 file:cursor-pointer" />
            </div>
            <FormInput label="Your name" name="submitter_name" placeholder="Optional" />
            <SubmitButton sent={sent}>{uploading ? "Uploading..." : "Upload Ad"}</SubmitButton>
          </form>
        )}
      </div>

      <p className="text-[8px] font-mono text-foreground/30 text-center leading-relaxed mt-3">
        All ads are moderated. No political, religious, or harmful content.
        Uploaded audio requires manual review. AI-generated ads air within 24 hours.
      </p>
      </>}
    </ContentSection>
  );
}

function NodeContent({ id }: { id: string }) {
  const { t } = useLanguage();
  const [sent, setSent] = useState(false);

  const submit = async (url: string, body: Record<string, unknown>) => {
    try {
      await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch {}
  };

  switch (id) {
    case "request":
      return (
        <ContentSection title="Request a Track" subtitle="Tell the AI what to play next">
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); submit("/api/request", { name: f.get("name"), prompt: f.get("prompt") }); }} className="space-y-4">
            <FormInput label="Your name" name="name" placeholder="Optional" />
            <FormTextarea label="Describe the vibe" name="prompt" placeholder="Dark jungle techno with industrial edges..." rows={3} required />
            <SubmitButton sent={sent}>Request</SubmitButton>
          </form>
        </ContentSection>
      );
    case "about":
      return (
        <ContentSection title="About radioGAGA" subtitle="The world's first 100% AI-generated radio station">
          <p>Every voice, every track, every jingle, every advert — generated in real time by artificial intelligence. No human presenters. No pre-recorded playlists. Just pure machine creativity, 24 hours a day.</p>
          <div className="grid grid-cols-3 gap-4 mt-6 mb-4">
            {[
              { label: "AI Music", desc: "Generated live" },
              { label: "AI Presenters", desc: "Unique personalities" },
              { label: "AI Production", desc: "News, ads & more" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="w-2 h-2 rounded-full bg-glow-cool mx-auto mb-2 animate-pulse-glow" />
                <span className="text-label text-xs block">{item.label}</span>
                <span className="text-foreground/40 text-[9px] font-mono">{item.desc}</span>
              </div>
            ))}
          </div>
          <p>Powered by large language models, neural text-to-speech, and generative music AI. The schedule rotates through unique shows — each with its own AI presenter, musical style, and personality.</p>
        </ContentSection>
      );
    case "shoutout":
      return (
        <ContentSection title="Send a Shoutout" subtitle="Your message, read live on air">
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); submit("/api/shoutout", { name: f.get("name"), message: f.get("message") }); }} className="space-y-4">
            <FormInput label="Your name" name="name" placeholder="Optional" />
            <FormTextarea label="Your message" name="message" placeholder="Shoutout to everyone listening at 3am..." rows={3} required maxLength={200} />
            <SubmitButton sent={sent}>Send Shoutout</SubmitButton>
          </form>
        </ContentSection>
      );
    case "show-idea":
      return (
        <ContentSection title="Pitch a Show" subtitle="Design your dream AI radio show">
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); submit("/api/show-idea", { show_name: f.get("show_name"), presenter_name: f.get("presenter_name"), presenter_style: f.get("presenter_style"), music_mood: f.get("music_mood"), energy: Number(f.get("energy")), humor: f.get("humor"), time_slot: f.get("time_slot"), submitter_name: f.get("submitter_name") }); }} className="space-y-3">
            <FormInput label="Show name" name="show_name" placeholder="The Midnight Signal" required />
            <FormInput label="Presenter name" name="presenter_name" placeholder="Luna" required />
            <FormTextarea label="Presenter personality" name="presenter_style" placeholder="Whispered conspiracy theorist who connects everything to ancient mythology..." rows={3} required />
            <FormTextarea label="Music mood" name="music_mood" placeholder="Deep dubstep, 140bpm, sub-heavy, foggy warehouse at 4am" rows={2} required />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormSelect label="Energy" name="energy" options={[
                { value: "1", label: "1 — Minimal" },
                { value: "2", label: "2 — Low" },
                { value: "3", label: "3 — Medium" },
                { value: "4", label: "4 — High" },
                { value: "5", label: "5 — Peak" },
              ]} />
              <FormSelect label="Humor" name="humor" options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "dry", label: "Dry" },
                { value: "absurd", label: "Absurd" },
              ]} />
              <FormInput label="Time slot" name="time_slot" placeholder="e.g. 2am" />
            </div>
            <FormInput label="Your name (optional)" name="submitter_name" placeholder="So we can credit you" />
            <SubmitButton sent={sent}>Submit Show Idea</SubmitButton>
          </form>
        </ContentSection>
      );
    case "advert":
      return <AdvertForm sent={sent} submit={submit} />;
    case "listen":
      return (
        <ContentSection title={t("listen.title")} subtitle={t("listen.subtitle")}>
          <p>{t("listen.location")}</p>
          <div className="space-y-3 mt-4">
            <div>
              <span className="text-label text-xs block mb-1">{t("listen.when")}</span>
              <p className="text-foreground/70 font-serif text-2xl">{t("listen.when.detail")}</p>
            </div>
            <div>
              <span className="text-label text-xs block mb-1">{t("listen.where")}</span>
              <p className="text-foreground/70 font-serif text-2xl">{t("listen.where.detail")}</p>
            </div>
          </div>
        </ContentSection>
      );
    default:
      return null;
  }
}
