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
  muted: boolean;
}

const AudioCtx = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolumeState] = useState(0.7);
  const [streamConnected, setStreamConnected] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Create audio element and autoplay muted on load
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "none";
    audio.volume = 0; // start muted
    audioRef.current = audio;

    audio.addEventListener("playing", () => setStreamConnected(true));
    audio.addEventListener("waiting", () => setStreamConnected(false));

    // Auto-reconnect on error/ended
    const reconnect = () => {
      setStreamConnected(false);
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

    // Autoplay muted — browsers allow this
    audio.src = STREAM_URL;
    audio.load();
    audio.play()
      .then(() => {
        setPlaying(true);
      })
      .catch(() => {
        // Autoplay blocked — user will need to click play
      });

    return () => {
      audio.pause();
      audio.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current && !muted) {
      audioRef.current.volume = v;
    }
  }, [muted]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing && !muted) {
      // Currently playing with sound — stop completely
      audio.pause();
      audio.src = "about:blank";
      setPlaying(false);
      setMuted(true);
      setStreamConnected(false);
    } else if (playing && muted) {
      // Stream is running but muted — unmute
      // Wire up Web Audio API for visualiser on first unmute
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
      } else {
        webAudioCtxRef.current.resume().catch(() => {});
      }

      audio.volume = volume;
      setMuted(false);
    } else {
      // Not playing at all — start and unmute
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
      } else {
        webAudioCtxRef.current.resume().catch(() => {});
      }

      audio.src = STREAM_URL;
      audio.load();
      audio.volume = volume;
      audio.play().catch(() => {});
      setPlaying(true);
      setMuted(false);
    }
  }, [playing, muted, volume]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current) return null;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    return data;
  }, []);

  return (
    <AudioCtx.Provider value={{ playing, togglePlay, volume, setVolume, getFrequencyData, analyserRef, streamConnected, muted }}>
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
