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
          <p className="text-poetic text-2xl">VOID.FM</p>
          <p className="text-label text-xs opacity-40">{t("footer.tagline")}</p>
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
