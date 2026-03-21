import { useEffect, useState, useRef } from "react";

interface TickerItem {
  label: string;
  text: string;
}

export default function Ticker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Poll now-playing + history to build ticker items
  useEffect(() => {
    const build = async () => {
      try {
        const [npRes, histRes, showsRes] = await Promise.all([
          fetch("/api/now-playing").then(r => r.json()),
          fetch("/api/history?limit=5").then(r => r.json()),
          fetch("/api/shows").then(r => r.json()),
        ]);

        const entries: TickerItem[] = [];

        // Current show info
        const show = showsRes.find((s: any) => s.id === npRes.currentShow);
        if (show) {
          const host = show.coHost
            ? `${show.presenterName} & ${show.coHost}`
            : show.presenterName;
          entries.push({ label: "NOW", text: `${show.name} with ${host}` });
        }

        // Now playing segment
        if (npRes.nowPlaying) {
          const seg = npRes.nowPlaying;
          const typeLabel = seg.type === "music" ? "♫" : seg.type === "dj" ? "🎙" : seg.type === "news" ? "📰" : "●";
          entries.push({ label: typeLabel, text: seg.title });
        }

        // Recent tracks (music only)
        const recentMusic = histRes
          .filter((h: any) => h.type === "music")
          .slice(0, 3);
        for (const track of recentMusic) {
          entries.push({ label: "PLAYED", text: track.title });
        }

        // Station ident
        entries.push({ label: "◆", text: "radioGAGA — 100% AI generated radio, 24/7" });

        setItems(entries);
      } catch {
        setItems([{ label: "◆", text: "radioGAGA — the signal never stops" }]);
      }
    };

    build();
    const id = setInterval(build, 15000);
    return () => clearInterval(id);
  }, []);

  // Build the scrolling text string
  const tickerText = items
    .map(i => `${i.label}  ${i.text}`)
    .join("     ◆     ");

  // Duplicate for seamless loop
  const fullText = `${tickerText}     ◆     ${tickerText}`;

  // Calculate animation duration based on content length
  const duration = Math.max(tickerText.length * 0.22, 20);

  return (
    <div
      ref={containerRef}
      className="fixed left-0 right-0 z-[45] overflow-hidden pointer-events-none"
      style={{
        bottom: 200,
        height: 28,
        background: "linear-gradient(to right, hsla(0,0%,0%,0), hsla(0,0%,0%,0.4), hsla(0,0%,0%,0))",
      }}
    >
      <div
        ref={innerRef}
        className="whitespace-nowrap font-mono text-[11px] tracking-widest uppercase"
        style={{
          color: "hsla(35, 80%, 65%, 0.7)",
          lineHeight: "28px",
          animation: `ticker-scroll ${duration}s linear infinite`,
          willChange: "transform",
        }}
      >
        {fullText}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
