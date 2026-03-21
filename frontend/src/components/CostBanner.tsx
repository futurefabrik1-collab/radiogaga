import { useEffect, useState, useRef } from "react";

interface CostData {
  totalCost: number;
  infraCost: number;
  llmCost: number;
  domainCost: number;
  buildCost: number;
  donations: number;
  deficit: number;
  uptimeDays: number;
  totalSegments: number;
  launchDate: string;
}

export default function CostBanner() {
  const [data, setData] = useState<CostData | null>(null);
  const [liveCost, setLiveCost] = useState(0);
  const costRef = useRef(0);
  const rateRef = useRef(0); // cost per millisecond

  useEffect(() => {
    const fetchCosts = () =>
      fetch("/api/costs")
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          costRef.current = d.totalCost;
          setLiveCost(d.totalCost);
          // Calculate cost accumulation rate: total cost / total uptime in ms
          rateRef.current = d.totalCost / (d.uptimeDays * 86_400_000);
        })
        .catch(() => {});

    fetchCosts();
    const id = setInterval(fetchCosts, 60_000);
    return () => clearInterval(id);
  }, []);

  // Tick cost counter every 100ms for visible real-time accumulation
  useEffect(() => {
    if (!data) return;
    const interval = 100; // ms
    const id = setInterval(() => {
      costRef.current += rateRef.current * interval;
      setLiveCost(costRef.current);
    }, interval);
    return () => clearInterval(id);
  }, [data]);

  if (!data) return null;

  const pct = liveCost > 0 ? Math.min((data.donations / liveCost) * 100, 100) : 0;
  const deficit = liveCost - data.donations;

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
            <span className="text-[14px] tracking-wide tabular-nums" style={{ color: "hsl(0, 70%, 65%)" }}>
              €{liveCost.toFixed(4)}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-foreground/40">Day {Math.ceil(data.uptimeDays)}</span>
            <span className="text-foreground/25 text-[8px] normal-case">{data.totalSegments.toLocaleString()} segments</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-foreground/40">Donations</span>
            <span className="text-[14px] tracking-wide tabular-nums" style={{ color: "hsl(130, 60%, 55%)" }}>
              €{data.donations.toFixed(2)}
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
            {deficit > 0
              ? `€${deficit.toFixed(2)} needed to break even`
              : `Funded! €${Math.abs(deficit).toFixed(2)} surplus`}
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
