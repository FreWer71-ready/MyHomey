'use client';
import { useEffect, useState } from 'react';
import { Clock } from './Clock';

/** Små förskjutningar (px) som vyn växlar mellan varje timme, mot inbränning på skärm som alltid är på. */
const SHIFTS = [[0, 0], [3, 0], [3, 3], [0, 3], [-2, 2], [-2, -2]];
const TZ = 'Europe/Stockholm';
const hourNow = () => Number(new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(Date.now()));
/** Nattläge 22–06: bara klocka, temperatur och larm, dämpat och varmare. */
const isNight = (h: number) => h >= 22 || h < 6;

export function HomeShell({ temp, alarms, children }: { temp: string | null; alarms: number; children: React.ReactNode }) {
  const [hour, setHour] = useState<number | null>(null);
  const [wakeUntil, setWakeUntil] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => { setHour(hourNow()); setNow(Date.now()); };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const [x, y] = SHIFTS[(hour ?? 0) % SHIFTS.length];
  const night = hour != null && isNight(hour) && now > wakeUntil;

  return (
    <>
      <div style={{ transform: `translate(${x}px, ${y}px)` }} className="transition-transform duration-1000">{children}</div>
      {night && (
        <button
          type="button" aria-label="Väck skärmen"
          onClick={() => { const t = Date.now() + 2 * 60_000; setWakeUntil(t); setNow(Date.now()); }}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0B0F14]"
        >
          <span className="flex flex-col items-center gap-3 opacity-30" style={{ transform: `translate(${x * 4}px, ${y * 4}px)` }}>
            <Clock show="time" className="text-[160px] leading-none font-bold tracking-tight text-[#F5B544] tabular-nums" />
            {temp && <span className="text-[56px] font-semibold text-[#F0D9B5] tabular-nums">Ute {temp}</span>}
            {alarms > 0 && <span className="rounded-full bg-[#F85149] px-5 py-1 text-[24px] font-semibold text-white">{alarms} {alarms === 1 ? 'varning' : 'varningar'}</span>}
          </span>
          <span className="absolute bottom-6 text-[16px] text-[#8B98A5] opacity-40">Tryck för att visa allt</span>
        </button>
      )}
    </>
  );
}
