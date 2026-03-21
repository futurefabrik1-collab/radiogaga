import { useRef, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  scrollProgress: number;
}

export default function ScrollSections({ scrollProgress }: Props) {
  const { t } = useLanguage();

  return (
    <div className="relative z-5">
      <div className="h-screen" />

      <ScrollRevealSection threshold={0.12}>
        <div className="max-w-xl mx-auto px-8 text-center">
          <p className="text-label text-sm mb-4">{t("time.dawn")}</p>
          <div className="w-8 h-px bg-foreground/20 mx-auto" />
        </div>
      </ScrollRevealSection>

      <div className="h-[60vh]" />

      <ScrollRevealSection threshold={0.3}>
        <div className="max-w-xl mx-auto px-8 text-center">
          <p className="text-label text-sm mb-4">{t("time.afternoon")}</p>
          <div className="w-8 h-px bg-foreground/20 mx-auto" />
        </div>
      </ScrollRevealSection>

      <div className="h-[60vh]" />

      <ScrollRevealSection threshold={0.5}>
        <div className="max-w-xl mx-auto px-8 text-center">
          <p className="text-label text-sm mb-4">{t("time.sunset")}</p>
          <div className="w-8 h-px bg-foreground/20 mx-auto" />
        </div>
      </ScrollRevealSection>

      <div className="h-[60vh]" />

      <ScrollRevealSection threshold={0.72}>
        <div className="max-w-xl mx-auto px-8 text-center">
          <p className="text-label text-sm mb-4">{t("time.nightfall")}</p>
          <div className="w-8 h-px bg-foreground/20 mx-auto" />
        </div>
      </ScrollRevealSection>

      <div className="h-[80vh]" />

      <div className="relative z-10 pb-24">
        <div className="max-w-md mx-auto px-8 text-center space-y-4">
          <p className="text-label text-xs opacity-40">{t("footer.tagline")}</p>
          <a
            href="https://ko-fi.com/radiogaga/tiers"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-foreground/10 backdrop-blur-sm border border-foreground/10 text-foreground/70 hover:text-foreground hover:bg-foreground/20 transition-all duration-300"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            <span className="text-[10px] font-mono tracking-wider uppercase">Support radioGAGA</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function ScrollRevealSection({
  children,
  threshold,
}: {
  children: React.ReactNode;
  threshold: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="py-12 transition-all duration-1000"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
      }}
    >
      {children}
    </div>
  );
}
