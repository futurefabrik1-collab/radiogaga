import { useState, useCallback, useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAudio } from "@/contexts/AudioContext";

interface LightNodeProps {
  id: string;
  label: string;
  x: number;
  y: number;
  hue: number;
  children: React.ReactNode;
  mouseX: number;
  mouseY: number;
  freqBand?: number; // which frequency band (index) this node reacts to
  scrollSpeed?: number; // 0..1 normalised scroll velocity
}

export default function LightNode({ id, label, x, y, hue, children, mouseX, mouseY, freqBand = 0, scrollSpeed = 0 }: LightNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  const { playing, getFrequencyData } = useAudio();
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioPeak, setAudioPeak] = useState(0);
  const [audioDrift, setAudioDrift] = useState({ dx: 0, dy: 0 });
  const animRef = useRef<number>(0);
  const peakRef = useRef(0);
  const smoothRef = useRef(0);

  // Poll frequency data when playing — with peak tracking and smoothing
  useEffect(() => {
    if (!playing) {
      setAudioLevel(0);
      setAudioPeak(0);
      setAudioDrift({ dx: 0, dy: 0 });
      smoothRef.current = 0;
      peakRef.current = 0;
      return;
    }

    const tick = () => {
      const data = getFrequencyData();
      if (data) {
        // Sample a wider range for more responsiveness
        const start = Math.min(freqBand * 8, data.length - 16);
        let sum = 0;
        let peak = 0;
        for (let i = start; i < start + 16; i++) {
          const v = data[i];
          sum += v;
          if (v > peak) peak = v;
        }
        const raw = sum / (16 * 255);
        const peakNorm = peak / 255;

        // Fast attack, slower release for punchier feel
        smoothRef.current = raw > smoothRef.current
          ? raw * 0.7 + smoothRef.current * 0.3   // fast attack
          : raw * 0.15 + smoothRef.current * 0.85; // slow release

        // Peak hold with decay
        if (peakNorm > peakRef.current) {
          peakRef.current = peakNorm;
        } else {
          peakRef.current *= 0.95;
        }

        setAudioLevel(smoothRef.current);
        setAudioPeak(peakRef.current);

        // Drift position based on frequency energy — nodes "breathe" with audio
        const t = Date.now() * 0.001;
        const driftAmount = smoothRef.current * 12 + peakRef.current * 8;
        setAudioDrift({
          dx: Math.sin(t * 1.3 + freqBand) * driftAmount,
          dy: Math.cos(t * 0.9 + freqBand * 0.7) * driftAmount,
        });
      }
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, getFrequencyData, freqBand]);

  const dx = mouseX - x;
  const dy = mouseY - y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const proximity = Math.max(0, 1 - dist / 300);

  // Combine mouse proximity, audio, peaks, and scroll speed
  const reactivity = Math.min(1, proximity + audioLevel * 1.5 + audioPeak * 0.5 + scrollSpeed * 0.8);

  const glowSize = 60 + reactivity * 80 + audioLevel * 60 + audioPeak * 40 + scrollSpeed * 50;
  const alpha = 0.15 + reactivity * 0.6 + audioPeak * 0.25 + scrollSpeed * 0.3;
  const coreScale = 1 + audioLevel * 3 + audioPeak * 2 + scrollSpeed * 2;
  const coreBrightness = 60 + audioLevel * 25 + audioPeak * 15 + scrollSpeed * 15;
  const hueShift = audioPeak * 20; // hue shifts on peaks for extra punch

  const handleClick = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded]);

  return (
    <>
      <button
        onClick={handleClick}
        className="absolute z-20 group cursor-pointer"
        style={{
          left: `${x + audioDrift.dx}px`,
          top: `${y + audioDrift.dy}px`,
          transform: "translate(-50%, -50%)",
          // Minimum 48px touch target for mobile accessibility
          minWidth: 48,
          minHeight: 48,
        }}
        aria-label={`Explore ${label}`}
      >
        {/* Outer glow */}
        <div
          className="absolute rounded-full"
          style={{
            width: glowSize * 2,
            height: glowSize * 2,
            left: -glowSize,
            top: -glowSize,
            background: `radial-gradient(circle, hsla(${hue + hueShift}, 80%, ${coreBrightness}%, ${alpha * 0.3}) 0%, transparent 70%)`,
            transition: playing ? "none" : "all 0.7s ease",
          }}
        />
        {/* Inner glow */}
        <div
          className="absolute rounded-full"
          style={{
            width: glowSize,
            height: glowSize,
            left: -glowSize / 2,
            top: -glowSize / 2,
            background: `radial-gradient(circle, hsla(${hue}, 70%, 70%, ${alpha * 0.6}) 0%, transparent 70%)`,
            transition: playing ? "none" : "all 0.5s ease",
          }}
        />

        {/* Core dot — pulses with audio */}
        <div
          className="relative rounded-full"
          style={{
            width: `${3 * coreScale}px`,
            height: `${3 * coreScale}px`,
            marginLeft: `${-(3 * coreScale - 12) / 2}px`,
            marginTop: `${-(3 * coreScale - 12) / 2}px`,
            background: `hsla(${hue + hueShift}, 85%, ${coreBrightness}%, ${0.6 + reactivity * 0.4})`,
            boxShadow: `0 0 ${10 + reactivity * 30 + audioLevel * 25 + audioPeak * 20}px hsla(${hue + hueShift}, 85%, ${coreBrightness}%, ${0.4 + reactivity * 0.5})`,
            transition: playing ? "none" : "all 0.5s ease",
          }}
        />
      </button>

      {/* Expanded content panel */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-stretch sm:items-start justify-center sm:pt-12 sm:pb-48 sm:px-8"
          onClick={handleClick}
        >
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ background: `hsla(220, 30%, 5%, 0.85)`, backdropFilter: "blur(20px)" }}
          />
          <div
            className="relative content-panel w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[50vh] overflow-y-auto overscroll-contain p-4 sm:p-4 text-xs animate-fade-in-up rounded-none sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
            style={{ animationDelay: "0.1s", opacity: 0 }}
          >
            <button
              onClick={handleClick}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 w-10 h-10 rounded-full flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-foreground/10 transition-all z-10"
              style={{ background: "hsla(0,0%,100%,0.05)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div
              className="absolute -top-20 -left-20 w-40 h-40 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, hsla(${hue}, 70%, 60%, 0.15) 0%, transparent 70%)`,
              }}
            />
            {children}
          </div>
        </div>
      )}
    </>
  );
}
