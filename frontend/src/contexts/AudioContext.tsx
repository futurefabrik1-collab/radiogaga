import { createContext, useContext, useRef, useCallback, useState, useEffect, type ReactNode } from "react";

// Stream URL — proxied through Vite dev server to avoid CORS. Set VITE_STREAM_URL for production.
const STREAM_URL = import.meta.env.VITE_STREAM_URL || "/stream";

interface AudioContextType {
  playing: boolean;
  togglePlay: () => void;
  volume: number;
  setVolume: (v: number) => void;
  getFrequencyData: () => Uint8Array | null;
  analyserRef: React.RefObject<AnalyserNode | null>;
  streamConnected: boolean;
}

const AudioCtx = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(0.7);
  const [streamConnected, setStreamConnected] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Create the audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    audio.volume = volume;
    audioRef.current = audio;

    audio.addEventListener("playing", () => setStreamConnected(true));
    audio.addEventListener("waiting", () => setStreamConnected(false));

    // On error or ended, auto-reconnect if we're supposed to be playing
    const reconnect = () => {
      setStreamConnected(false);
      // Only reconnect if src is still set (user hasn't intentionally stopped)
      setTimeout(() => {
        const a = audioRef.current;
        if (a && a.src && !a.src.endsWith("about:blank")) {
          a.src = STREAM_URL;
          a.load();
          a.play().catch(() => {});
        }
      }, 2000);
    };

    audio.addEventListener("error", reconnect);
    audio.addEventListener("ended", reconnect);

    return () => {
      audio.pause();
      audio.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      audio.src = "about:blank"; // sentinel so reconnect knows it's intentional
      setPlaying(false);
      setStreamConnected(false);
    } else {
      // Wire up Web Audio API for visualiser on first play
      if (!webAudioCtxRef.current) {
        const ctx = new AudioContext();
        webAudioCtxRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(ctx.destination);
      }

      audio.src = STREAM_URL;
      audio.load();
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current) return null;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  return (
    <AudioCtx.Provider value={{ playing, togglePlay, volume, setVolume, getFrequencyData, analyserRef, streamConnected }}>
      {children}
    </AudioCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
