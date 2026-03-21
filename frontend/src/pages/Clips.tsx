import { useEffect, useState } from "react";

interface Clip {
  id: number;
  type: string;
  title: string;
  caption: string;
  videoUrl: string | null;
  audioUrl: string;
  createdAt: string;
}

export default function Clips() {
  const [clips, setClips] = useState<Clip[]>([]);
  useEffect(() => {
    fetch("/api/clips?limit=20").then(r => r.json()).then(setClips).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12 font-mono">
        <a href="/" className="text-foreground/40 text-sm hover:text-foreground/70 transition-colors">← Back</a>
        <h1 className="text-4xl font-serif font-light mt-6 mb-2" style={{ color: "hsl(35, 80%, 65%)" }}>Clips</h1>
        <p className="text-foreground/50 text-sm mb-8">Auto-generated highlights from the live stream. Download and share.</p>

        {clips.length === 0 && (
          <p className="text-foreground/30 text-sm">No clips yet — first batch generates shortly.</p>
        )}

        <div className="space-y-6">
          {clips.map(clip => (
            <div key={clip.id} className="rounded-lg p-4" style={{ background: "hsla(35,80%,65%,0.03)", border: "1px solid hsla(35,80%,65%,0.1)" }}>
              {clip.videoUrl && (
                <video controls preload="metadata" className="w-full rounded mb-3 max-h-[400px] bg-black">
                  <source src={clip.videoUrl} type="video/mp4" />
                </video>
              )}
              <p className="text-sm text-foreground/80 mb-2">{clip.caption}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-foreground/30 uppercase tracking-widest">
                  {new Date(clip.createdAt).toLocaleString()} · {clip.type}
                </span>
                <div className="flex gap-2">
                  {clip.videoUrl && (
                    <a href={clip.videoUrl} download className="text-[10px] font-mono tracking-wider uppercase px-2 py-1 rounded transition-colors hover:bg-foreground/10" style={{ color: "hsl(35,80%,65%)", border: "1px solid hsla(35,80%,65%,0.2)" }}>
                      MP4
                    </a>
                  )}
                  <a href={clip.audioUrl} download className="text-[10px] font-mono tracking-wider uppercase px-2 py-1 rounded transition-colors hover:bg-foreground/10" style={{ color: "hsl(35,80%,65%)", border: "1px solid hsla(35,80%,65%,0.2)" }}>
                    MP3
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
