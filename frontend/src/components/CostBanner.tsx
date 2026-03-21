import { useEffect, useState, useRef } from "react";

interface CostData {
  totalCost: number;
  infraCost: number;
  groqCost: number;
  donations: number;
  deficit: number;
  uptimeDays: number;
  totalSegments: number;
  launchDate: string;
}

function AnimatedCounter({ value, prefix = "£" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(value);

  useEffect(() => {
    const start = ref.current;
    const end = value;
    const duration = 1200;
    const startTime = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(start + (end - start) * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else ref.current = end;
    };
    requestAnimationFrame(tick);
  }, [value]);

  return (
    <span>{prefix}{display.toFixed(2)}</span>
  );
}

export default function CostBanner() {
  const [data, setData] = useState<CostData | null>(null);
  const [liveCost, setLiveCost] = useState(0);

  useEffect(() => {
    const fetchCosts = () =>
      fetch("/api/costs")
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setLiveCost(d.totalCost);
        })
        .catch(() => {});

    fetchCosts();
    const id = setInterval(fetchCosts, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  // Tick the cost counter up in real-time between API polls
  useEffect(() => {
    if (!data) return;
    const costPerMs = (data.totalCost / (data.uptimeDays * 24 * 60 * 60 * 1000));
    const id = setInterval(() => {
      setLiveCost((prev) => prev + costPerMs * 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [data]);

  if (!data) return null;

  const pct = data.totalCost > 0 ? Math.min((data.donations / data.totalCost) * 100, 100) : 0;

  return (
    <div className="w-full max-w-md mx-auto pointer-events-auto">
      <div
        className="rounded-lg px-4 py-3 font-mono text-[10px] tracking-wider uppercase"
        style={{
          background: "hsla(0,0%,0%,0.4)",
          border: "1px solid hsla(35, 80%, 65%, 0.1)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {/* Cost vs Donations */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex flex-col">
            <span className="text-foreground/40">Running cost</span>
            <span className="text-[14px] tracking-wide" style={{ color: "hsl(0, 70%, 65%)" }}>
              <AnimatedCounter value={liveCost} prefix="£" />
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-foreground/40">Day {Math.ceil(data.uptimeDays)}</span>
            <span className="text-foreground/25 text-[8px] normal-case">{data.totalSegments.toLocaleString()} segments</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-foreground/40">Donations</span>
            <span className="text-[14px] tracking-wide" style={{ color: "hsl(130, 60%, 55%)" }}>
              £{data.donations.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: "hsla(0, 70%, 65%, 0.15)" }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
            style={{
              width: `${pct}%`,
              background: pct >= 100
                ? "hsl(130, 60%, 55%)"
                : `linear-gradient(90deg, hsl(130, 60%, 55%), hsl(35, 80%, 65%))`,
            }}
          />
        </div>

        {/* Deficit / surplus message */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-foreground/30 normal-case text-[8px]">
            {data.deficit > 0
              ? `£${data.deficit.toFixed(2)} needed to break even`
              : `Funded! £${Math.abs(data.deficit).toFixed(2)} surplus`}
          </span>
          <a
            href="https://ko-fi.com/radiogaga/tiers"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[9px] hover:opacity-80 transition-opacity"
            style={{ color: "hsl(35, 80%, 65%)" }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8h1a4 4 0 010 8h-1" /><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            Help fund
          </a>
        </div>
      </div>
    </div>
  );
}
