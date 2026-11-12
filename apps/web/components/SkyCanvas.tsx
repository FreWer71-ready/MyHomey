'use client';
import { useEffect, useRef } from 'react';
import type { SkyState } from '@/lib/sky';

type Cloud = { x: number; y: number; w: number; h: number; s: number; img: HTMLCanvasElement };
type Drop = { x: number; y: number; l: number; v: number };
type Flake = { x: number; y: number; r: number; v: number; p: number };
type Star = { x: number; y: number; r: number; f: number; p: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const FPS = 30;

/**
 * Rörligt väderlager ovanpå bakgrundsbilden: moln som driver med vinden, regn/snö efter mängd,
 * stjärnor en klar natt, dimma och blixtar. Lätt för plattan: ~30 bilder/s, pausar när sidan
 * inte syns, ritar en stillbild vid "minska rörelse".
 */
export function SkyCanvas({ sky, el }: { sky: SkyState; el: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const night = el < -6, dusk = !night && el < 6;
    const wet = sky.condition === 'rain' || sky.condition === 'storm';
    const snowy = sky.condition === 'snow';
    // Vinden blåser mot (från + 180°); på skärmen används öst–västkomponenten.
    const toward = ((sky.windFrom + 180) % 360) * (Math.PI / 180);
    const east = Math.sin(toward);
    const dir = Math.abs(east) < 0.2 ? 1 : Math.sign(east);
    const vx = dir * (8 + clamp(sky.wind, 0, 15) * 5); // px/s
    const cloudRGB = night ? '150 160 195' : dusk ? '255 214 196' : '255 255 255';

    // Varje moln ritas en gång till en egen liten bild (billigt att flytta varje bildruta).
    const makeCloud = (x?: number): Cloud => {
      const w = rand(0.22, 0.5) * W, h = rand(0.07, 0.14) * H;
      const a = rand(0.08, 0.2) * (night ? 0.75 : 1) * (0.6 + sky.clouds * 0.6);
      const img = document.createElement('canvas');
      img.width = Math.ceil(w * 1.6); img.height = Math.ceil(h * 3.2);
      const c = img.getContext('2d')!;
      for (let i = 0; i < 6; i++) {
        const cx = img.width / 2 + rand(-0.5, 0.5) * w, cy = img.height / 2 + rand(-0.3, 0.3) * h, r = rand(0.35, 0.6) * w * 0.5;
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgb(${cloudRGB} / ${a})`);
        g.addColorStop(1, `rgb(${cloudRGB} / 0)`);
        c.fillStyle = g;
        c.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      return { x: x ?? rand(-0.2, 1) * W, y: rand(0.02, 0.5) * H, w, h, s: rand(0.6, 1.3), img };
    };
    const clouds: Cloud[] = Array.from({ length: Math.round(2 + sky.clouds * 9) }, () => makeCloud());
    const nRain = wet ? clamp(Math.round(sky.precip * 160), 70, 520) : 0;
    const drops: Drop[] = Array.from({ length: nRain }, () => ({ x: rand(0, W), y: rand(0, H), l: rand(10, 22), v: rand(650, 950) }));
    const nSnow = snowy ? clamp(Math.round(sky.precip * 220), 60, 360) : 0;
    const flakes: Flake[] = Array.from({ length: nSnow }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(1, 3), v: rand(25, 70), p: rand(0, 6.28) }));
    const nStars = night && sky.clouds < 0.65 ? Math.round(180 * (1 - sky.clouds)) : 0;
    const stars: Star[] = Array.from({ length: nStars }, () => ({ x: rand(0, W), y: rand(0, H * 0.6), r: rand(0.8, 2.2), f: rand(0.5, 2), p: rand(0, 6.28) }));
    const slant = clamp(vx / 260, -0.4, 0.4);
    let flash = 0, nextFlash = performance.now() + rand(4000, 9000);

    const draw = (t: number, dt: number) => {
      ctx.clearRect(0, 0, W, H);

      for (const s of stars) {
        ctx.globalAlpha = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t / 1000 * s.f + s.p));
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const c of clouds) {
        c.x += vx * c.s * dt;
        if (dir > 0 && c.x - c.w > W) Object.assign(c, makeCloud(-c.w));
        if (dir < 0 && c.x + c.w < 0) Object.assign(c, makeCloud(W + c.w));
        ctx.drawImage(c.img, c.x - c.img.width / 2, c.y - c.img.height / 2);
      }

      if (sky.condition === 'fog') {
        for (let i = 0; i < 4; i++) {
          const y = H * (0.55 + i * 0.11), x = ((t / 1000) * 6 * (i % 2 ? 1 : -1) + i * 300) % (W * 2) - W * 0.5;
          const g = ctx.createRadialGradient(x, y, 0, x, y, W * 0.7);
          g.addColorStop(0, 'rgb(220 228 240 / 0.12)'); g.addColorStop(1, 'rgb(220 228 240 / 0)');
          ctx.fillStyle = g; ctx.fillRect(0, y - H * 0.3, W, H * 0.6);
        }
      }

      if (drops.length) {
        ctx.strokeStyle = 'rgb(200 215 240 / 0.38)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const d of drops) {
          d.y += d.v * dt; d.x += d.v * slant * dt;
          if (d.y > H) { d.y = -d.l; d.x = rand(-0.1, 1.1) * W; }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * slant, d.y - d.l);
        }
        ctx.stroke();
      }

      if (flakes.length) {
        ctx.fillStyle = 'rgb(255 255 255 / 0.75)';
        for (const f of flakes) {
          f.y += f.v * dt; f.x += (vx * 0.3 + Math.sin(t / 900 + f.p) * 12) * dt;
          if (f.y > H) { f.y = -4; f.x = rand(0, W); }
          if (f.x > W + 5) f.x = -5; else if (f.x < -5) f.x = W + 5;
          ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        }
      }

      if (sky.thunder >= 0.3) {
        if (t > nextFlash) { flash = 1; nextFlash = t + rand(5000, 14000) / sky.thunder; }
        if (flash > 0) {
          ctx.fillStyle = `rgb(235 240 255 / ${0.28 * flash})`;
          ctx.fillRect(0, 0, W, H);
          flash = flash > 0.5 && flash - dt * 6 <= 0.5 ? 0.9 : flash - dt * 4; // dubbelblixt
        }
      }
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { draw(0, 0); return; }

    let raf = 0, last = performance.now(), acc = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      acc += t - last; last = t;
      if (acc < 1000 / FPS) return;
      draw(t, Math.min(acc, 100) / 1000);
      acc = 0;
    };
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
    // Starta om bara när vädret eller dygnsfasen faktiskt ändras (inte vid varje uppdatering).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sky), el < -6 ? 'night' : el < 6 ? 'dusk' : 'day']);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
