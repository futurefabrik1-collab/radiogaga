import { useEffect, useRef, useCallback } from "react";

interface Orb {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  baseRadius: number;
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  baseAlpha: number;
  speed: number;
  phase: number;
  driftX: number;
  driftY: number;
}

interface Props {
  scrollProgress: number;
  mouseX: number;
  mouseY: number;
}

const COLORS = [
  { h: 35, s: 90, l: 65 },   // warm amber
  { h: 30, s: 80, l: 55 },   // deep gold
  { h: 200, s: 50, l: 55 },  // soft blue
  { h: 340, s: 45, l: 50 },  // dusty rose
  { h: 45, s: 70, l: 70 },   // pale gold
  { h: 15, s: 60, l: 50 },   // terracotta
];

export default function AtmosphericCanvas({ scrollProgress, mouseX, mouseY }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbsRef = useRef<Orb[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const initOrbs = useCallback((w: number, h: number) => {
    const count = Math.min(18, Math.floor((w * h) / 80000));
    const orbs: Orb[] = [];
    for (let i = 0; i < count; i++) {
      const color = COLORS[i % COLORS.length];
      const bx = Math.random() * w;
      const by = Math.random() * h;
      orbs.push({
        x: bx, y: by, baseX: bx, baseY: by,
        radius: 0, baseRadius: 3 + Math.random() * 6,
        hue: color.h, saturation: color.s, lightness: color.l,
        alpha: 0, baseAlpha: 0.15 + Math.random() * 0.35,
        speed: 0.3 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        driftX: (Math.random() - 0.5) * 0.3,
        driftY: (Math.random() - 0.5) * 0.2,
      });
    }
    orbsRef.current = orbs;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx.scale(dpr, dpr);
      if (orbsRef.current.length === 0) initOrbs(window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      timeRef.current += 0.008;
      const t = timeRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      // Sky gradient based on scroll
      drawSky(ctx, w, h, scrollProgress);

      // Draw orbs
      for (const orb of orbsRef.current) {
        // Drift animation
        orb.x = orb.baseX + Math.sin(t * orb.speed + orb.phase) * 30 + orb.driftX * t * 10;
        orb.y = orb.baseY + Math.cos(t * orb.speed * 0.7 + orb.phase) * 20 + orb.driftY * t * 8;

        // Keep in bounds with wrapping
        if (orb.x > w + 50) orb.x -= w + 100;
        if (orb.x < -50) orb.x += w + 100;
        if (orb.y > h + 50) orb.y -= h + 100;
        if (orb.y < -50) orb.y += h + 100;

        // Mouse proximity effect
        const dx = mouseX - orb.x;
        const dy = mouseY - orb.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 250;
        const influence = Math.max(0, 1 - dist / maxDist);

        // Night amplifies glow
        const nightFactor = scrollProgress > 0.6 ? (scrollProgress - 0.6) / 0.4 : 0;
        const dayFactor = scrollProgress < 0.3 ? 1 - scrollProgress / 0.3 : 0;

        const targetRadius = orb.baseRadius * (1 + influence * 3 + nightFactor * 2);
        const targetAlpha = orb.baseAlpha * (0.3 + dayFactor * 0.2 + nightFactor * 0.7 + influence * 0.8);

        orb.radius += (targetRadius - orb.radius) * 0.08;
        orb.alpha += (targetAlpha - orb.alpha) * 0.06;

        // Repulsion from cursor
        if (dist < maxDist && dist > 0) {
          orb.x -= (dx / dist) * influence * 2;
          orb.y -= (dy / dist) * influence * 2;
        }

        // Draw glow layers
        const glowSize = orb.radius * (4 + influence * 6);
        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, glowSize);
        gradient.addColorStop(0, `hsla(${orb.hue}, ${orb.saturation}%, ${orb.lightness}%, ${orb.alpha})`);
        gradient.addColorStop(0.3, `hsla(${orb.hue}, ${orb.saturation}%, ${orb.lightness}%, ${orb.alpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${orb.hue}, ${orb.saturation}%, ${orb.lightness}%, 0)`);

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, glowSize, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${orb.hue}, ${orb.saturation - 10}%, ${orb.lightness + 20}%, ${orb.alpha * 1.5})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [scrollProgress, mouseX, mouseY, initOrbs]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0"
      style={{ pointerEvents: "none" }}
    />
  );
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, progress: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);

  if (progress < 0.25) {
    // Dawn → Day
    const t = progress / 0.25;
    gradient.addColorStop(0, lerpColor([220, 30, 12], [220, 45, 60], t));
    gradient.addColorStop(0.5, lerpColor([280, 20, 15], [230, 35, 70], t));
    gradient.addColorStop(1, lerpColor([35, 40, 20], [35, 45, 75], t));
  } else if (progress < 0.5) {
    // Day → Sunset
    const t = (progress - 0.25) / 0.25;
    gradient.addColorStop(0, lerpColor([220, 45, 60], [260, 30, 22], t));
    gradient.addColorStop(0.4, lerpColor([230, 35, 70], [350, 45, 35], t));
    gradient.addColorStop(0.7, lerpColor([35, 45, 75], [30, 70, 45], t));
    gradient.addColorStop(1, lerpColor([35, 45, 75], [35, 55, 55], t));
  } else if (progress < 0.75) {
    // Sunset → Dusk
    const t = (progress - 0.5) / 0.25;
    gradient.addColorStop(0, lerpColor([260, 30, 22], [235, 35, 10], t));
    gradient.addColorStop(0.4, lerpColor([350, 45, 35], [250, 25, 14], t));
    gradient.addColorStop(1, lerpColor([35, 55, 55], [230, 25, 12], t));
  } else {
    // Dusk → Night
    const t = (progress - 0.75) / 0.25;
    gradient.addColorStop(0, lerpColor([235, 35, 10], [230, 40, 5], t));
    gradient.addColorStop(0.5, lerpColor([250, 25, 14], [235, 35, 7], t));
    gradient.addColorStop(1, lerpColor([230, 25, 12], [220, 30, 8], t));
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function lerpColor(a: number[], b: number[], t: number): string {
  const h = a[0] + (b[0] - a[0]) * t;
  const s = a[1] + (b[1] - a[1]) * t;
  const l = a[2] + (b[2] - a[2]) * t;
  return `hsl(${h}, ${s}%, ${l}%)`;
}
