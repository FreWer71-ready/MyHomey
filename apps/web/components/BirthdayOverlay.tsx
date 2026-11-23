'use client';
import { useEffect, useState } from 'react';
import { birthdaysToday, joinNames, type Birthday } from '@/lib/birthday';

const COLORS = ['#F5B544', '#E0577A', '#34C27A', '#4DA3FF', '#B07CFF', '#FF8A3D'];
const FLOWERS = ['🌷', '🌸', '💐', '🌹', '🌼', '🌺', '🌷'];
/** Konfetti utan slump: samma varje gång, ingen skillnad mellan server och klient. */
const PIECES = Array.from({ length: 56 }, (_, i) => ({
  left: (i * 37 + 11) % 100, delay: (i % 12) * 0.1, dur: 2.2 + (i % 5) * 0.3, color: COLORS[i % COLORS.length],
  w: 6 + (i % 3) * 3, h: 10 + (i % 4) * 3, drift: ((i * 53) % 61) - 30, spin: 360 + (i % 4) * 180,
}));
/** Fyrverkerier: en raket stiger från botten och brister i en ring av gnistor (två radier). Alla klara inom cirka 4 s. */
const BURSTS = [
  { x: 26, y: 20, delay: 0.2, color: '#F5B544' }, { x: 76, y: 14, delay: 0.6, color: '#E0577A' }, { x: 50, y: 9, delay: 1.1, color: '#4DA3FF' },
  { x: 16, y: 60, delay: 1.7, color: '#34C27A' }, { x: 84, y: 52, delay: 2.3, color: '#B07CFF' },
];
const SPARKS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2, r = [78, 118, 158][i % 3];
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) };
});

const SHOW_MS = 4200; // visas så här länge, sedan toning (0,6 s): totalt cirka 4,8 s.
const FADE_MS = 600;

/**
 * Grattis-overlay på födelsedagen (BIRTHDAYS i Vercel, fler personer går bra). Visas vid varje full omladdning under dagen,
 * inte vid sidbyte eller automatisk uppdatering (layouten monteras en gång). Tryck stänger direkt.
 * Texten är generisk: "Grattis / på födelsedagen" och namnet (eller flera namn) i gult under.
 */
export function BirthdayOverlay({ entries }: { entries: Birthday[] }) {
  const [list] = useState(entries); // första värdet: en uppdatering av sidan ska inte visa overlayen igen
  const [who, setWho] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const names = birthdaysToday(list).map((b) => b.name);
    if (!names.length) return;
    setWho(joinNames(names));
    const fade = setTimeout(() => setLeaving(true), SHOW_MS);
    const done = setTimeout(() => setWho(null), SHOW_MS + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [list]);

  if (!who) return null;
  return (
    <div
      role="dialog" aria-label={`Grattis på födelsedagen ${who}!`} onClick={() => setWho(null)}
      className={`grattis-in fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-ground/90 px-6 text-center backdrop-blur-sm transition-opacity duration-[600ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      {BURSTS.map((b, i) => (
        <div key={i} aria-hidden="true" className="pointer-events-none absolute" style={{ left: `${b.x}%`, top: `${b.y}%`, color: b.color }}>
          <span className="grattis-rocket" style={{ '--from': `${100 - b.y}vh`, animationDelay: `${b.delay}s` } as React.CSSProperties} />
          {SPARKS.map((s, j) => (
            <span key={j} className="grattis-spark" style={{ '--dx': `${s.dx}px`, '--dy': `${s.dy}px`, animationDelay: `${b.delay + 0.5}s` } as React.CSSProperties} />
          ))}
        </div>
      ))}
      {PIECES.map((p, i) => (
        <span key={i} aria-hidden="true" className="grattis-bit"
          style={{ left: `${p.left}%`, width: p.w, height: p.h, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--drift': `${p.drift}vw`, '--spin': `${p.spin}deg` } as React.CSSProperties} />
      ))}
      <div className="relative z-10 flex flex-col items-center gap-1">
        <div aria-hidden="true" className="flex items-end gap-3 text-[5rem] leading-none">
          <span className="grattis-pop" style={{ animationDelay: '0.15s' }}>🍾</span>
          <span className="grattis-pop" style={{ animationDelay: '0.35s' }}>🥂</span>
        </div>
        <p className="grattis-pop mt-3 text-[4rem] leading-none font-extrabold" style={{ animationDelay: '0.5s' }}>Grattis</p>
        <p className="grattis-pop text-[2rem] leading-tight font-semibold" style={{ animationDelay: '0.7s' }}>på födelsedagen</p>
        <p className="grattis-pop text-[2.75rem] leading-tight font-bold break-words text-sun" style={{ animationDelay: '0.9s' }}>{who}!</p>
        <div aria-hidden="true" className="mt-5 flex gap-1 text-[2.5rem] leading-none">
          {FLOWERS.map((f, i) => (
            <span key={i} className="grattis-pop" style={{ animationDelay: `${0.8 + i * 0.12}s` }}>
              <span className="grattis-sway inline-block" style={{ animationDelay: `${i * 0.2}s` }}>{f}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
