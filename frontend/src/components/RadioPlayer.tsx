import { useRef, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAudio } from "@/contexts/AudioContext";

interface Show {
  id: string;
  name: string;
  presenterName: string;
  coHost: string | null;
}

interface NowPlaying {
  type: string;
  title: string;
  slot: string | null;
}

const SEGMENT_LABELS: Record<string, string> = {
  dj: "PRESENTER",
  music: "MUSIC",
  advert: "AD BREAK",
  news: "NEWS",
  weather: "WEATHER",
  guest: "GUEST",
  "track-intro": "MUSIC",
  "track-outro": "MUSIC",
};

function useShows() {
  const [shows, setShows] = useState<Show[]>([]);
  const [currentShow, setCurrentShow] = useState<string>("");
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  useEffect(() => {
    fetch("/api/shows").then(r => r.json()).then(setShows).catch(() => {});
    const poll = () =>
      fetch("/api/now-playing").then(r => r.json()).then(d => {
        setCurrentShow(d.currentShow || "");
        setNowPlaying(d.nowPlaying || null);
      }).catch(() => {});
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, []);

  const skipTo = async (id: string) => {
    await fetch(`/api/skip/${id}`, { method: "POST" }).catch(() => {});
    setCurrentShow(id);
  };

  return { shows, currentShow, skipTo, nowPlaying };
}

export default function RadioPlayer() {
  const { t } = useLanguage();
  const { playing, togglePlay, volume, setVolume, analyserRef, streamConnected, muted } = useAudio();
  const { shows, currentShow, skipTo, nowPlaying } = useShows();
  const currentShowObj = shows.find(s => s.id === currentShow);
  const [showPicker, setShowPicker] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = 200 * dpr;
    canvas.height = 32 * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      ctx.clearRect(0, 0, 200, 32);
      const analyser = analyserRef.current;

      if (analyser && playing) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const bars = 32;
        const barW = 200 / bars;
        for (let i = 0; i < bars; i++) {
          const val = data[i] / 255;
          const h = val * 28 + 2;
          ctx.fillStyle = `hsla(35, 80%, 65%, ${0.3 + val * 0.7})`;
          ctx.fillRect(i * barW + 1, 32 - h, barW - 2, h);
        }
      } else {
        const bars = 32;
        const barW = 200 / bars;
        const time = Date.now() * 0.001;
        for (let i = 0; i < bars; i++) {
          const h = 2 + Math.sin(time + i * 0.5) * 1.5;
          ctx.fillStyle = `hsla(35, 80%, 65%, 0.15)`;
          ctx.fillRect(i * barW + 1, 32 - h, barW - 2, h);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, analyserRef]);

  return (
    <div className="fixed bottom-8 left-0 right-0 z-50 flex flex-col items-center justify-center">

      {/* Show picker */}
      {showPicker && (
        <div className="content-panel mb-2 mx-4 max-w-md w-full py-2 px-3">
          <div className="grid grid-cols-2 gap-1">
            {shows.map(show => (
              <button
                key={show.id}
                onClick={() => { skipTo(show.id); setShowPicker(false); }}
                className="text-left px-2 py-1.5 rounded text-[10px] font-mono tracking-wide uppercase transition-colors"
                style={{
                  color: currentShow === show.id ? "hsl(35, 80%, 65%)" : "hsla(0,0%,100%,0.45)",
                  background: currentShow === show.id ? "hsla(35,80%,65%,0.1)" : "transparent",
                }}
              >
                <span className="block truncate">{show.name}</span>
                <span className="block opacity-50 normal-case tracking-normal" style={{ fontSize: 9 }}>
                  {show.presenterName}{show.coHost ? ` & ${show.coHost}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="content-panel flex flex-col gap-2 px-5 pt-2.5 pb-3 mb-10 mx-4 max-w-md w-full">

        {/* Now-playing info strip */}
        <div className="flex items-center justify-between min-h-[18px]">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {currentShowObj && (
              <span className="font-mono text-[10px] tracking-widest uppercase truncate" style={{ color: "hsl(35, 80%, 65%)" }}>
                {currentShowObj.name}
              </span>
            )}
            {currentShowObj?.coHost && (
              <span className="font-mono text-[9px] text-foreground/35 uppercase tracking-widest shrink-0">
                w/ {currentShowObj.coHost}
              </span>
            )}
          </div>
          {nowPlaying && (
            <span
              className="font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0 ml-2"
              style={{
                color: nowPlaying.type === "news" ? "hsl(0,70%,65%)"
                  : nowPlaying.type === "advert" ? "hsla(0,0%,100%,0.3)"
                  : nowPlaying.type === "guest" ? "hsl(270,60%,70%)"
                  : "hsl(35,80%,65%)",
                background: nowPlaying.type === "news" ? "hsla(0,70%,65%,0.1)"
                  : nowPlaying.type === "advert" ? "hsla(0,0%,100%,0.05)"
                  : nowPlaying.type === "guest" ? "hsla(270,60%,70%,0.1)"
                  : "hsla(35,80%,65%,0.1)",
              }}
            >
              {SEGMENT_LABELS[nowPlaying.type] ?? nowPlaying.type.toUpperCase()}
            </span>
          )}
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 active:scale-95 ${muted && playing ? "animate-pulse" : ""}`}
          style={{
            background: playing && !muted ? "hsla(35, 80%, 65%, 0.2)" : muted && playing ? "hsla(35, 80%, 65%, 0.15)" : "hsla(35, 80%, 65%, 0.1)",
            boxShadow: playing && !muted ? "0 0 20px hsla(35, 80%, 65%, 0.2)" : muted && playing ? "0 0 15px hsla(35, 80%, 65%, 0.15)" : "none",
          }}
          aria-label={playing && !muted ? "Pause" : muted ? "Unmute" : "Play"}
        >
          {playing && !muted ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="1" width="3.5" height="12" rx="1" fill="hsl(35, 80%, 65%)" />
              <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="hsl(35, 80%, 65%)" />
            </svg>
          ) : muted && playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(35, 80%, 65%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="hsl(35, 80%, 65%)" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 1.5L12 7L3 12.5V1.5Z" fill="hsl(35, 80%, 65%)" />
            </svg>
          )}
        </button>

        <canvas ref={canvasRef} className="flex-1 h-8" style={{ width: "100%", height: 32 }} />

        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-16 h-1 appearance-none bg-border rounded-full cursor-pointer accent-primary"
          aria-label="Volume"
        />

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${streamConnected ? "bg-red-500 animate-pulse" : "bg-foreground/20"}`} />
            <span className="font-mono text-[10px] tracking-widest uppercase text-foreground/70">
              {streamConnected && !muted ? t("player.live") : streamConnected && muted ? "tap to listen" : playing ? "connecting" : "off air"}
            </span>
          </span>
          <button
            onClick={() => setShowPicker(v => !v)}
            className="font-mono text-[9px] tracking-widest uppercase text-foreground/40 hover:text-foreground/70 transition-colors"
          >
            {showPicker ? "▾ close" : "▸ shows"}
          </button>
        </div>
        </div>{/* end controls row */}
      </div>
    </div>
  );
}
