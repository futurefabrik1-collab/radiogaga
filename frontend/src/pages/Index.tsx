import { useState, useEffect, useCallback, useRef } from "react";
import AtmosphericCanvas from "@/components/AtmosphericCanvas";
import ParticleField from "@/components/ParticleField";
import LightNode from "@/components/LightNode";
import ContentSection from "@/components/ContentSection";
import ScrollSections from "@/components/ScrollSections";
import RadioPlayer from "@/components/RadioPlayer";
import Ticker from "@/components/Ticker";
import CostBanner from "@/components/CostBanner";
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

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const nodes = [
    { id: "request", label: "Request", x: vw * 0.2, y: vh * 0.35, hue: 35, freqBand: 0 },
    { id: "about", label: "About", x: vw * 0.75, y: vh * 0.25, hue: 200, freqBand: 2 },
    { id: "shoutout", label: "Shoutout", x: vw * 0.55, y: vh * 0.6, hue: 340, freqBand: 4 },
    { id: "show-idea", label: "Show Idea", x: vw * 0.15, y: vh * 0.65, hue: 130, freqBand: 6 },
    { id: "advert", label: "Advertise", x: vw * 0.4, y: vh * 0.82, hue: 280, freqBand: 7 },
    { id: "listen", label: t("node.listen"), x: vw * 0.82, y: vh * 0.72, hue: 45, freqBand: 8 },
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
          <a
            href="https://ko-fi.com/radiogaga/tiers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-full bg-foreground/10 backdrop-blur-sm border border-foreground/10 text-foreground/70 hover:text-foreground hover:bg-foreground/20 transition-all duration-300 pointer-events-auto"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            <span className="text-[10px] font-mono tracking-wider uppercase">Support</span>
          </a>
          <div className="mt-6 w-full px-4">
            <CostBanner />
          </div>
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
            <div className="grid grid-cols-3 gap-3">
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
      return (
        <ContentSection title="Create an Advert" subtitle="Promote your product, service, or idea on air">
          <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); submit("/api/advert", { business_name: f.get("business_name"), product: f.get("product"), description: f.get("description"), tone: f.get("tone"), target_audience: f.get("target_audience"), website: f.get("website"), submitter_name: f.get("submitter_name") }); }} className="space-y-3">
            <FormInput label="Business / brand name" name="business_name" placeholder="Neon Synth Co." required />
            <FormInput label="Product or service" name="product" placeholder="AI-powered synth plugin" required />
            <FormTextarea label="Tell us about it" name="description" placeholder="What makes it special? What should listeners know?" rows={3} required maxLength={500} />
            <div className="grid grid-cols-2 gap-3">
              <FormSelect label="Tone" name="tone" options={[
                { value: "professional", label: "Professional" },
                { value: "casual", label: "Casual" },
                { value: "humorous", label: "Humorous" },
                { value: "dramatic", label: "Dramatic" },
                { value: "retro", label: "Retro" },
              ]} />
              <FormInput label="Target audience" name="target_audience" placeholder="e.g. musicians, gamers" />
            </div>
            <FormInput label="Website / link" name="website" placeholder="https://..." />
            <FormInput label="Your name (optional)" name="submitter_name" placeholder="So we can follow up" />
            <SubmitButton sent={sent}>Submit Advert</SubmitButton>
          </form>
        </ContentSection>
      );
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
