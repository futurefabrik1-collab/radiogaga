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
}

export default function LightNode({ id, label, x, y, hue, children, mouseX, mouseY, freqBand = 0 }: LightNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLanguage();
  const { playing, getFrequencyData } = useAudio();
  const [audioLevel, setAudioLevel] = useState(0);
  const animRef = useRef<number>(0);

  // Poll frequency data when playing
  useEffect(() => {
    if (!playing) {
      setAudioLevel(0);
      return;
    }

    const tick = () => {
      const data = getFrequencyData();
      if (data) {
        // Sample a range of bins around the freqBand index
        const start = Math.min(freqBand * 8, data.length - 8);
        let sum = 0;
        for (let i = start; i < start + 8; i++) {
          sum += data[i];
        }
        setAudioLevel(sum / (8 * 255)); // 0..1
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

  // Combine mouse proximity with audio reactivity
  const reactivity = Math.min(1, proximity + audioLevel * 1.2);

  const glowSize = 60 + reactivity * 60 + audioLevel * 30;
  const alpha = 0.2 + reactivity * 0.5;
  const coreScale = 1 + audioLevel * 1.5;
  const coreBrightness = 65 + audioLevel * 20;

  const handleClick = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded]);

  return (
    <>
      <button
        onClick={handleClick}
        className="absolute z-20 group cursor-pointer transition-all duration-100"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          transform: "translate(-50%, -50%)",
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
            background: `radial-gradient(circle, hsla(${hue}, 80%, ${coreBrightness}%, ${alpha * 0.3}) 0%, transparent 70%)`,
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
            background: `hsla(${hue}, 80%, ${coreBrightness}%, ${0.6 + reactivity * 0.4})`,
            boxShadow: `0 0 ${10 + reactivity * 25 + audioLevel * 15}px hsla(${hue}, 80%, ${coreBrightness}%, ${0.4 + reactivity * 0.4})`,
            transition: playing ? "none" : "all 0.5s ease",
          }}
        />
      </button>

      {/* Expanded content panel */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
          onClick={handleClick}
        >
          <div
            className="absolute inset-0 animate-fade-in"
            style={{ background: `hsla(220, 30%, 5%, 0.85)`, backdropFilter: "blur(20px)" }}
          />
          <div
            className="relative content-panel max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 md:p-12 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
            style={{ animationDelay: "0.1s", opacity: 0 }}
          >
            <button
              onClick={handleClick}
              className="absolute top-4 right-4 text-label opacity-50 hover:opacity-100 transition-opacity"
            >
              {t("close")}
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
