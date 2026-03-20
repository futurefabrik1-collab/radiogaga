import { useState, useEffect, useCallback, useRef } from "react";
import AtmosphericCanvas from "@/components/AtmosphericCanvas";
import LightNode from "@/components/LightNode";
import ContentSection from "@/components/ContentSection";
import ScrollSections from "@/components/ScrollSections";
import LanguageToggle from "@/components/LanguageToggle";
import RadioPlayer from "@/components/RadioPlayer";
import TelegramPanel from "@/components/TelegramPanel";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Index() {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const scrollTop = window.scrollY;
      const scrollHeight = el.scrollHeight - window.innerHeight;
      setScrollProgress(Math.min(1, Math.max(0, scrollTop / scrollHeight)));
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  const nodes = [
    { id: "streams", label: t("node.streams"), x: vw * 0.2, y: vh * 0.35, hue: 35, freqBand: 0 },
    { id: "engine", label: t("node.engine"), x: vw * 0.75, y: vh * 0.25, hue: 200, freqBand: 2 },
    { id: "voices", label: t("node.voices"), x: vw * 0.55, y: vh * 0.6, hue: 340, freqBand: 4 },
    { id: "open", label: t("node.open"), x: vw * 0.15, y: vh * 0.65, hue: 130, freqBand: 6 },
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
      <LanguageToggle />

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
            <LightNode key={node.id} {...node} mouseX={mouseX} mouseY={mouseY}>
              <NodeContent id={node.id} />
            </LightNode>
          ))}
        </div>
      </div>

      <ScrollSections scrollProgress={scrollProgress} />
      <PoeticOverlays scrollProgress={scrollProgress} loaded={loaded} />

      {/* Telegram bot panel — bottom-right corner */}
      <div
        className="fixed bottom-24 right-4 z-50 transition-opacity duration-700"
        style={{ opacity: loaded ? 1 : 0 }}
      >
        <TelegramPanel />
      </div>

      <RadioPlayer />
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

function NodeContent({ id }: { id: string }) {
  const { t } = useLanguage();

  switch (id) {
    case "streams":
      return (
        <ContentSection title={t("streams.title")} subtitle={t("streams.subtitle")}>
          <p>{t("streams.p1")}</p>
          <div className="grid grid-cols-3 gap-3 my-6">
            {["ambient", "spoken word", "experimental"].map((ch) => (
              <div key={ch} className="content-panel p-3 text-center">
                <div className="w-2 h-2 rounded-full bg-glow-warm mx-auto mb-2 animate-pulse-glow" />
                <span className="font-mono text-xs tracking-widest uppercase text-muted-foreground">{ch}</span>
              </div>
            ))}
          </div>
          <p>{t("streams.p2")}</p>
        </ContentSection>
      );
    case "engine":
      return (
        <ContentSection title={t("engine.title")} subtitle={t("engine.subtitle")}>
          <p>{t("engine.p1")}</p>
          <div className="grid grid-cols-3 gap-4 mt-6 mb-4">
            {(["engine.model1", "engine.model2", "engine.model3"] as const).map((model) => (
              <div key={model} className="text-center">
                <div className="w-2 h-2 rounded-full bg-glow-cool mx-auto mb-2 animate-pulse-glow" />
                <span className="text-label text-xs">{t(model)}</span>
              </div>
            ))}
          </div>
          <p>{t("engine.p2")}</p>
        </ContentSection>
      );
    case "voices":
      return (
        <ContentSection title={t("voices.title")} subtitle={t("voices.subtitle")}>
          <p>{t("voices.p1")}</p>
          <p>{t("voices.p2")}</p>
        </ContentSection>
      );
    case "open":
      return (
        <ContentSection title={t("open.title")} subtitle={t("open.subtitle")}>
          <p>{t("open.p1")}</p>
          <p>{t("open.p2")}</p>
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
            <div className="flex gap-6 mt-6">
              {(["listen.github", "listen.discord"] as const).map((link) => (
                <span key={link} className="text-label text-xs cursor-pointer hover:text-primary transition-colors">
                  {t(link)}
                </span>
              ))}
            </div>
          </div>
        </ContentSection>
      );
    default:
      return null;
  }
}
