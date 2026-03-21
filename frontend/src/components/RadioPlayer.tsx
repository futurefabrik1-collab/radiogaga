import { useRef, useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAudio } from "@/contexts/AudioContext";
import CostBanner from "./CostBanner";

interface Show { id: string; name: string; presenterName: string; coHost: string | null; }
interface NowPlaying { type: string; title: string; slot: string | null; }

const SEGMENT_LABELS: Record<string, string> = {
  dj: "PRESENTER", music: "MUSIC", advert: "AD BREAK", news: "NEWS",
  weather: "WEATHER", guest: "GUEST", jingle: "JINGLE", shoutout: "SHOUTOUT",
  "track-intro": "INTRO", "track-outro": "OUTRO", "ai-announcement": "AI MESSAGE",
  reportage: "REPORTAGE",
};

function useShows() {
  const [shows, setShows] = useState<Show[]>([]);
  const [currentShow, setCurrentShow] = useState("");
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  useEffect(() => {
    fetch("/api/shows").then(r => r.json()).then(setShows).catch(() => {});
    const poll = () => fetch("/api/now-playing").then(r => r.json()).then(d => {
      setCurrentShow(d.currentShow || ""); setNowPlaying(d.nowPlaying || null);
    }).catch(() => {});
    poll(); const id = setInterval(poll, 10000); return () => clearInterval(id);
  }, []);
  const skipTo = async (id: string) => { await fetch(`/api/skip/${id}`, { method: "POST" }).catch(() => {}); setCurrentShow(id); };
  return { shows, currentShow, skipTo, nowPlaying };
}

function BufferRing({ playing, muted, analyserRef, size = 72 }: { playing: boolean; muted: boolean; analyserRef: React.MutableRefObject<AnalyserNode | null>; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lineW = 2;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr; canvas.height = size * dpr; ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2, r = (size - lineW * 2) / 2;
    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const analyser = analyserRef.current;
      if (analyser && playing && !muted) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const segments = 36, gap = 0.03, arcLen = (Math.PI * 2) / segments - gap;
        for (let i = 0; i < segments; i++) {
          const val = data[Math.floor(i * data.length / segments)] / 255;
          const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath(); ctx.arc(cx, cy, r, angle, angle + arcLen);
          ctx.strokeStyle = `hsla(35, 80%, 65%, ${0.15 + val * 0.85})`;
          ctx.lineWidth = lineW + val * 1.5; ctx.lineCap = "round"; ctx.stroke();
        }
      } else if (playing && muted) {
        const t = Date.now() * 0.003, pulse = 0.4 + Math.sin(t) * 0.3;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(35, 80%, 65%, ${pulse})`; ctx.lineWidth = lineW; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r, t % (Math.PI * 2), (t % (Math.PI * 2)) + Math.PI * 0.6);
        ctx.strokeStyle = `hsla(35, 80%, 65%, 0.8)`; ctx.lineWidth = lineW + 1; ctx.lineCap = "round"; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(35, 80%, 65%, 0.12)`; ctx.lineWidth = lineW; ctx.stroke();
      }
      animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, muted, analyserRef]);
  return <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size, height: size }} />;
}

export default function RadioPlayer() {
  const { t } = useLanguage();
  const { playing, togglePlay, volume, setVolume, analyserRef, streamConnected, muted } = useAudio();
  const { shows, currentShow, skipTo, nowPlaying } = useShows();
  const currentShowObj = shows.find(s => s.id === currentShow);
  const [showPicker, setShowPicker] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; dragging: boolean; active: boolean }>({ startX: 0, startY: 0, origX: 0, origY: 0, dragging: false, active: false });
  const miniRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!minimized) return;
    const onMove = (clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d.active) return;
      const dx = clientX - d.startX;
      const dy = clientY - d.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.dragging = true;
      if (d.dragging) setDragPos({ x: d.origX + dx, y: d.origY + dy });
    };
    const onUp = () => { dragRef.current.active = false; };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => { if (dragRef.current.active) { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); } };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [minimized]);

  const startDrag = (clientX: number, clientY: number) => {
    const el = miniRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: clientX, startY: clientY, origX: rect.left, origY: rect.top, dragging: false, active: true };
  };

  if (minimized) {
    const pos = dragPos || { x: (typeof window !== "undefined" ? window.innerWidth - 80 : 300), y: (typeof window !== "undefined" ? window.innerHeight - 80 : 600) };
    return (
      <div ref={miniRef} className="fixed z-50 select-none touch-none"
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={e => startDrag(e.clientX, e.clientY)}
        onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
      >
        {/* Clean circular player */}
        <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
          {/* Solid dark background circle */}
          <div className="absolute inset-0 rounded-full" style={{
            background: "hsla(220, 20%, 8%, 0.95)",
            border: "1px solid hsla(35, 80%, 65%, 0.15)",
            boxShadow: "0 4px 20px hsla(0,0%,0%,0.5)",
          }} />

          {/* Animated ring */}
          <div className="absolute inset-0">
            <BufferRing playing={playing} muted={muted} analyserRef={analyserRef} size={64} />
          </div>

          {/* Play/pause button */}
          <button onClick={() => { if (!dragRef.current.dragging) togglePlay(); }}
            className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90">
            {playing && !muted ? (
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="1" width="3.5" height="12" rx="1" fill="hsl(35,80%,65%)" />
                <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="hsl(35,80%,65%)" />
              </svg>
            ) : muted && playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(35,80%,65%)" strokeWidth="2" strokeLinecap="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="hsl(35,80%,65%)" />
                <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M4 1.5L12 7L4 12.5V1.5Z" fill="hsl(35,80%,65%)" />
              </svg>
            )}
          </button>
        </div>

        {/* Expand button */}
        <button onClick={() => { if (!dragRef.current.dragging) setMinimized(false); }}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[8px] font-mono tracking-widest uppercase text-foreground/40 hover:text-foreground/70 transition-colors"
          style={{ background: "hsla(220, 20%, 8%, 0.9)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
          expand
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center pb-3 sm:pb-4 px-2 sm:px-4">

      {showPicker && (
        <div className="content-panel mb-2 max-w-md w-full py-2 px-2 sm:px-3">
          <div className="grid grid-cols-2 gap-1">
            {shows.map(show => (
              <button key={show.id} onClick={() => { skipTo(show.id); setShowPicker(false); }}
                className="text-left px-2 py-2 sm:py-1.5 rounded text-[10px] font-mono tracking-wide uppercase transition-colors min-h-[44px]"
                style={{
                  color: currentShow === show.id ? "hsl(35, 80%, 65%)" : "hsla(0,0%,100%,0.45)",
                  background: currentShow === show.id ? "hsla(35,80%,65%,0.1)" : "transparent",
                }}>
                <span className="block truncate">{show.name}</span>
                <span className="block opacity-50 normal-case tracking-normal" style={{ fontSize: 9 }}>
                  {show.presenterName}{show.coHost ? ` & ${show.coHost}` : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="content-panel flex flex-col items-center gap-2 sm:gap-3 px-3 sm:px-5 pt-3 pb-3 max-w-md w-full">

        {/* Now-playing + status row */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${streamConnected ? "bg-red-500 animate-pulse" : "bg-foreground/20"}`} />
            {currentShowObj && (
              <span className="font-mono text-[10px] tracking-widest uppercase truncate" style={{ color: "hsl(35, 80%, 65%)" }}>
                {currentShowObj.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {nowPlaying && (
              <span className="font-mono text-[8px] sm:text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded"
                style={{
                  color: nowPlaying.type === "news" ? "hsl(0,70%,65%)" : nowPlaying.type === "guest" ? "hsl(270,60%,70%)" : "hsl(35,80%,65%)",
                  background: nowPlaying.type === "news" ? "hsla(0,70%,65%,0.1)" : nowPlaying.type === "guest" ? "hsla(270,60%,70%,0.1)" : "hsla(35,80%,65%,0.1)",
                }}>
                {SEGMENT_LABELS[nowPlaying.type] ?? nowPlaying.type.toUpperCase()}
              </span>
            )}
            <button onClick={() => setShowPicker(v => !v)}
              className="font-mono text-[9px] tracking-widest uppercase text-foreground/40 hover:text-foreground/70 transition-colors min-h-[36px] px-1">
              {showPicker ? "✕" : "▸"}
            </button>
            <button onClick={() => setMinimized(true)}
              className="font-mono text-[9px] text-foreground/30 hover:text-foreground/60 transition-colors min-h-[36px] px-1"
              title="Minimize player">
              ↓
            </button>
          </div>
        </div>

        {/* Play button row */}
        <div className="flex items-center gap-3 sm:gap-4 w-full justify-center">
          {/* Volume — desktop only */}
          <input type="range" min="0" max="1" step="0.01" value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="hidden sm:block w-12 h-2 appearance-none bg-border rounded-full cursor-pointer accent-primary"
            aria-label="Volume" />

          {/* Play button with ring */}
          <div className="relative" style={{ width: 72, height: 72 }}>
            <BufferRing playing={playing} muted={muted} analyserRef={analyserRef} />
            <button onClick={togglePlay}
              className="absolute inset-0 m-auto w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-90"
              style={{
                background: playing && !muted ? "hsla(35, 80%, 65%, 0.15)" : "hsla(35, 80%, 65%, 0.08)",
                boxShadow: playing && !muted ? "0 0 30px hsla(35, 80%, 65%, 0.2)" : "none",
              }}
              aria-label={playing && !muted ? "Pause" : muted ? "Unmute" : "Play"}>
              {playing && !muted ? (
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="1" width="3.5" height="12" rx="1" fill="hsl(35, 80%, 65%)" />
                  <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="hsl(35, 80%, 65%)" />
                </svg>
              ) : muted && playing ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(35, 80%, 65%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="hsl(35, 80%, 65%)" />
                  <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                  <path d="M3 1.5L12 7L3 12.5V1.5Z" fill="hsl(35, 80%, 65%)" />
                </svg>
              )}
            </button>
          </div>

          {/* Status text */}
          <span className="font-mono text-[10px] tracking-widest uppercase text-foreground/50 w-12 sm:w-16 text-center">
            {streamConnected && !muted ? t("player.live") : streamConnected && muted ? "tap" : playing ? "..." : "off"}
          </span>
        </div>

        {/* Cost banner */}
        <div className="w-full pt-1 border-t border-foreground/5">
          <CostBanner />
        </div>
      </div>
    </div>
  );
}
