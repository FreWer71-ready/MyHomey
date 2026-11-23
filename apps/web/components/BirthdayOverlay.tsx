'use client';
import { useEffect, useState } from 'react';
import { birthdayToday, type Birthday } from '@/lib/birthday';

const COLORS = ['#F5B544', '#E0577A', '#34C27A', '#4DA3FF', '#B07CFF', '#FF8A3D'];
const FLOWERS = ['🌷', '🌸', '💐', '🌹', '🌼', '🌺', '🌷'];
/** Konfetti utan slump: samma varje gång, ingen skillnad mellan server och klient. */
const PIECES = Array.from({ length: 56 }, (_, i) => ({
  left: (i * 37 + 11) % 100, delay: (i % 12) * 0.1, dur: 2.2 + (i % 5) * 0.3, color: COLORS[i % COLORS.length],
  w: 6 + (i % 3) * 3, h: 10 + (i % 4) * 3, drift: ((i * 53) % 61) - 30, spin: 360 + (i % 4) * 180,
}));

const SHOW_MS = 4200; // visas så här länge, sedan toning (0,6 s): totalt cirka 4,8 s.
const FADE_MS = 600;

/**
 * Grattis-overlay på födelsedagen (BIRTHDAYS i Vercel). Visas vid varje full omladdning under dagen, inte vid sidbyte eller
 * automatisk uppdatering (layouten monteras en gång). Tryck stänger direkt. Konfetti, blommor och champagne, sedan tillbaka till vyn.
 */
export function BirthdayOverlay({ entries }: { entries: Birthday[] }) {
  const [list] = useState(entries); // första värdet: en uppdatering av sidan ska inte visa overlayen igen
  const [who, setWho] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const b = birthdayToday(list);
    if (!b) return;
    setWho(b.name);
    const fade = setTimeout(() => setLeaving(true), SHOW_MS);
    const done = setTimeout(() => setWho(null), SHOW_MS + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [list]);

  if (!who) return null;
  return (
    <div
      role="dialog" aria-label={`Grattis ${who}!`} onClick={() => setWho(null)}
      className={`grattis-in fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden bg-ground/90 px-6 text-center backdrop-blur-sm transition-opacity duration-[600ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      {PIECES.map((p, i) => (
        <span key={i} aria-hidden="true" className="grattis-bit"
          style={{ left: `${p.left}%`, width: p.w, height: p.h, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, '--drift': `${p.drift}vw`, '--spin': `${p.spin}deg` } as React.CSSProperties} />
      ))}
      <div aria-hidden="true" className="flex items-end gap-2 text-[4.25rem] leading-none">
        <span className="grattis-pop" style={{ animationDelay: '0.15s' }}>🍾</span>
        <span className="grattis-pop" style={{ animationDelay: '0.35s' }}>🥂</span>
      </div>
      <p className="grattis-pop mt-3 text-[3.5rem] leading-none font-extrabold text-sun" style={{ animationDelay: '0.5s' }}>Grattis</p>
      <p className="grattis-pop text-[2.75rem] leading-tight font-bold break-words" style={{ animationDelay: '0.7s' }}>{who}!</p>
      <p className="grattis-pop text-[1.125rem] text-dim" style={{ animationDelay: '0.9s' }}>på födelsedagen 🎂</p>
      <div aria-hidden="true" className="mt-5 flex gap-1 text-[2.25rem] leading-none">
        {FLOWERS.map((f, i) => (
          <span key={i} className="grattis-pop" style={{ animationDelay: `${0.8 + i * 0.12}s` }}>
            <span className="grattis-sway inline-block" style={{ animationDelay: `${i * 0.2}s` }}>{f}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
