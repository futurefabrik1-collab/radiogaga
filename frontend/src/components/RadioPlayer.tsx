import { useRef, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAudio } from "@/contexts/AudioContext";
import CostBanner from "./CostBanner";

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

// Animated ring around the play button showing audio level / buffering
function BufferRing({ playing, muted, analyserRef }: {
  playing: boolean;
  muted: boolean;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const size = 88; // canvas logical size
  const lineW = 2.5;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;
    const r = (size - lineW * 2) / 2;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const analyser = analyserRef.current;

      if (analyser && playing && !muted) {
        // Audio-reactive ring — draw segments based on frequency data
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const segments = 48;
        const gap = 0.02;
        const arcLen = (Math.PI * 2) / segments - gap;

        for (let i = 0; i < segments; i++) {
          const val = data[Math.floor(i * data.length / segments)] / 255;
          const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, angle, angle + arcLen);
          ctx.strokeStyle = `hsla(35, 80%, 65%, ${0.15 + val * 0.85})`;
          ctx.lineWidth = lineW + val * 2;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      } else if (playing && muted) {
        // Pulsing ring when muted (waiting for user tap)
        const t = Date.now() * 0.003;
        const pulse = 0.4 + Math.sin(t) * 0.3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(35, 80%, 65%, ${pulse})`;
        ctx.lineWidth = lineW;
        ctx.stroke();
        // Spinner arc
        const sweep = Math.PI * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, r, t % (Math.PI * 2), (t % (Math.PI * 2)) + sweep);
        ctx.strokeStyle = `hsla(35, 80%, 65%, 0.8)`;
        ctx.lineWidth = lineW + 1;
        ctx.lineCap = "round";
        ctx.stroke();
      } else {
        // Idle subtle ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(35, 80%, 65%, 0.12)`;
        ctx.lineWidth = lineW;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, muted, analyserRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: size, height: size }}
    />
  );
}

export default function RadioPlayer() {
  const { t } = useLanguage();
  const { playing, togglePlay, volume, setVolume, analyserRef, streamConnected, muted } = useAudio();
  const { shows, currentShow, skipTo, nowPlaying } = useShows();
  const currentShowObj = shows.find(s => s.id === currentShow);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="fixed bottom-6 left-0 right-0 z-50 flex flex-col items-center justify-center">

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

      {/* Merged player + costs panel */}
      <div className="content-panel flex flex-col items-center gap-3 px-5 pt-4 pb-4 mx-4 max-w-md w-full">

        {/* Now-playing info strip */}
        <div className="flex items-center justify-between w-full min-h-[18px]">
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
          <div className="flex items-center gap-2">
            {nowPlaying && (
              <span
                className="font-mono text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded shrink-0"
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
            <button
              onClick={() => setShowPicker(v => !v)}
              className="font-mono text-[9px] tracking-widest uppercase text-foreground/40 hover:text-foreground/70 transition-colors"
            >
              {showPicker ? "▾ close" : "▸ shows"}
            </button>
          </div>
        </div>

        {/* Central play button with buffer ring */}
        <div className="flex items-center gap-5 w-full">
          <div className="flex items-center gap-3">
            {/* Volume */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-14 h-1 appearance-none bg-border rounded-full cursor-pointer accent-primary"
              aria-label="Volume"
            />
          </div>

          {/* Big play button with ring */}
          <div className="relative mx-auto" style={{ width: 88, height: 88 }}>
            <BufferRing playing={playing} muted={muted} analyserRef={analyserRef} />
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90"
              style={{
                background: playing && !muted
                  ? "hsla(35, 80%, 65%, 0.15)"
                  : muted && playing
                  ? "hsla(35, 80%, 65%, 0.1)"
                  : "hsla(35, 80%, 65%, 0.08)",
                boxShadow: playing && !muted
                  ? "0 0 30px hsla(35, 80%, 65%, 0.2)"
                  : "none",
              }}
              aria-label={playing && !muted ? "Pause" : muted ? "Unmute" : "Play"}
            >
              {playing && !muted ? (
                <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="1" width="3.5" height="12" rx="1" fill="hsl(35, 80%, 65%)" />
                  <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="hsl(35, 80%, 65%)" />
                </svg>
              ) : muted && playing ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="hsl(35, 80%, 65%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="hsl(35, 80%, 65%)" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
                  <path d="M3 1.5L12 7L3 12.5V1.5Z" fill="hsl(35, 80%, 65%)" />
                </svg>
              )}
            </button>
          </div>

          {/* Status */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${streamConnected ? "bg-red-500 animate-pulse" : "bg-foreground/20"}`} />
              <span className="font-mono text-[10px] tracking-widest uppercase text-foreground/70">
                {streamConnected && !muted ? t("player.live") : streamConnected && muted ? "tap to listen" : playing ? "connecting" : "off air"}
              </span>
            </span>
          </div>
        </div>

        {/* Cost banner integrated */}
        <div className="w-full pt-1 border-t border-foreground/5">
          <CostBanner />
        </div>
      </div>
    </div>
  );
}
