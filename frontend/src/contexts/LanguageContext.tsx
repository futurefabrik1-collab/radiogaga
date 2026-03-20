import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Lang = "de" | "en";

const translations = {
  // Hero
  "hero.subtitle": { de: "Das Signal hört nie auf.", en: "The signal never stops." },
  "hero.scroll": { de: "eintauchen", en: "tune in" },

  // Node labels
  "node.streams": { de: "frequenzen", en: "streams" },
  "node.engine": { de: "die maschine", en: "the engine" },
  "node.voices": { de: "stimmen", en: "voices" },
  "node.open": { de: "offen", en: "open" },
  "node.listen": { de: "jetzt hören", en: "listen now" },

  // Poetic overlays
  "poem.1": { de: "Eine KI träumt in Klang.", en: "An AI dreams in sound." },
  "poem.2": { de: "Kein Moderator. Kein Skript.", en: "No host. No script." },
  "poem.3": { de: "24 Stunden. Jeder Kontinent.", en: "24 hours. Every continent." },
  "poem.4": { de: "Das Radio erinnert sich an dich.", en: "The radio remembers you." },

  // Scroll sections
  "time.dawn": { de: "00:00 — signal start", en: "00:00 — signal start" },
  "time.afternoon": { de: "06:00 — generative morgen", en: "06:00 — generative dawn" },
  "time.sunset": { de: "12:00 — globaler puls", en: "12:00 — global pulse" },
  "time.nightfall": { de: "18:00 — endlosschleife", en: "18:00 — infinite loop" },

  // Footer
  "footer.tagline": { de: "KI-generiertes Radio · 24/7 · Open Source", en: "AI-generated radio · 24/7 · open source" },

  // Streams content
  "streams.title": { de: "Frequenzen", en: "Streams" },
  "streams.subtitle": { de: "immer live", en: "always live" },
  "streams.p1": {
    de: "Drei parallele Kanäle — Ambient, Gesprochenes Wort, Experimentell. Jeder wird in Echtzeit von generativen Modellen erzeugt. Nichts ist voraufgenommen.",
    en: "Three parallel channels — Ambient, Spoken Word, Experimental. Each generated in real-time by generative models. Nothing is pre-recorded.",
  },
  "streams.p2": {
    de: "Der Klang passt sich der Tageszeit, der Hörerzahl und dem globalen Nachrichtenstrom an. Kein Moment wiederholt sich.",
    en: "Sound adapts to time of day, listener count, and global news feed. No moment repeats.",
  },

  // Engine content
  "engine.title": { de: "Die Maschine", en: "The Engine" },
  "engine.subtitle": { de: "open-source stack", en: "open-source stack" },
  "engine.p1": {
    de: "Gebaut auf offenen Werkzeugen: Bark für Sprache, MusicGen für Musik, Whisper für Transkription. Alles läuft auf öffentlicher Infrastruktur.",
    en: "Built on open tools: Bark for speech, MusicGen for music, Whisper for transcription. All running on public infrastructure.",
  },
  "engine.p2": {
    de: "Der gesamte Stack ist auf GitHub verfügbar. Fork es. Starte deinen eigenen Sender. Das Protokoll gehört niemandem.",
    en: "The entire stack is on GitHub. Fork it. Start your own station. The protocol belongs to no one.",
  },
  "engine.model1": { de: "MusicGen", en: "MusicGen" },
  "engine.model2": { de: "Bark", en: "Bark" },
  "engine.model3": { de: "Whisper", en: "Whisper" },

  // Voices content
  "voices.title": { de: "Stimmen", en: "Voices" },
  "voices.subtitle": { de: "synthetische Moderatoren", en: "synthetic hosts" },
  "voices.p1": {
    de: "Zwischen den Tracks sprechen KI-Stimmen. Sie kommentieren, erzählen Geschichten, lesen Nachrichten — generiert, nicht geskriptet.",
    en: "Between tracks, AI voices speak. They comment, tell stories, read news — generated, not scripted.",
  },
  "voices.p2": {
    de: "Jede Stimme hat eine Persönlichkeit. Sie entwickeln sich über die Zeit. Manche erscheinen nur nachts.",
    en: "Each voice has a personality. They evolve over time. Some only appear at night.",
  },

  // Open content
  "open.title": { de: "Offen", en: "Open" },
  "open.subtitle": { de: "frei für alle", en: "free for all" },
  "open.p1": {
    de: "Kein Login. Keine Werbung. Kein Tracking. Das Signal ist frei und gehört dem Netz.",
    en: "No login. No ads. No tracking. The signal is free and belongs to the network.",
  },
  "open.p2": {
    de: "Contributer weltweit fügen Modelle, Stimmen und Musikstile hinzu. Eine lebende Infrastruktur.",
    en: "Contributors worldwide add models, voices, and music styles. A living infrastructure.",
  },

  // Listen content
  "listen.title": { de: "Jetzt Hören", en: "Listen Now" },
  "listen.subtitle": { de: "überall", en: "everywhere" },
  "listen.location": { de: "Global verteilt", en: "Globally distributed" },
  "listen.when": { de: "wann", en: "when" },
  "listen.when.detail": { de: "Immer. 24/7/365.", en: "Always. 24/7/365." },
  "listen.where": { de: "wo", en: "where" },
  "listen.where.detail": { de: "Web · API · jeder Client, der Streams versteht", en: "Web · API · any client that speaks streams" },
  "listen.github": { de: "github", en: "github" },
  "listen.discord": { de: "discord", en: "discord" },

  // Node close
  "close": { de: "schließen", en: "close" },

  // Player
  "player.live": { de: "LIVE", en: "LIVE" },
  "player.listeners": { de: "Hörer", en: "listeners" },
} as const;

type TranslationKey = keyof typeof translations;

interface LanguageContextType {
  lang: Lang;
  toggle: () => void;
  t: (key: TranslationKey) => string;
}

// eslint-disable-next-line react-refresh/only-export-components
const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  const toggle = useCallback(() => {
    setLang((prev) => (prev === "de" ? "en" : "de"));
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translations[key]?.[lang] ?? key,
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
