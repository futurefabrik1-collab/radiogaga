import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const BOT_URL = `https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "radiogaga_bot"}`;

interface Stats {
  listeners: number;
  suggestions: number;
  competitions: number;
  entries: number;
}

interface NowPlaying {
  type: string;
  title: string;
  slot: string;
}

export default function TelegramPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    const fetchAll = () => {
      fetch("/api/stats")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
      fetch("/api/now-playing")
        .then((r) => r.json())
        .then((d) => setNowPlaying(d.current || null))
        .catch(() => {});
    };
    fetchAll();
    const id = setInterval(fetchAll, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="content-panel flex flex-col gap-3 p-4 w-56">
      {nowPlaying && (
        <div className="border-b border-border/30 pb-3">
          <span className="text-label text-[9px] tracking-widest uppercase block mb-1 text-foreground/40">
            on air
          </span>
          <p className="text-foreground/80 text-xs font-mono leading-tight line-clamp-2">
            {nowPlaying.title}
          </p>
          {nowPlaying.slot && (
            <span className="text-[9px] text-foreground/40 font-mono uppercase tracking-wider mt-0.5 block">
              {nowPlaying.slot}
            </span>
          )}
        </div>
      )}

      {stats && (
        <div className="flex justify-between text-[9px] font-mono text-foreground/40 uppercase tracking-wider border-b border-border/30 pb-3">
          <span>{stats.listeners} listeners</span>
          <span>{stats.suggestions} tips</span>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <QRCodeSVG
          value={BOT_URL}
          size={96}
          bgColor="transparent"
          fgColor="hsla(35, 80%, 65%, 0.85)"
          level="M"
        />
        <span className="text-[9px] font-mono text-foreground/40 uppercase tracking-widest text-center leading-tight">
          scan to join
          <br />
          @radiogaga_bot
        </span>
      </div>
    </div>
  );
}
