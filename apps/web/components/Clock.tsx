'use client';
import { useEffect, useState } from 'react';

const TZ = 'Europe/Stockholm';
const fmtDate = (d: Date) =>
  d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).replace('.', '');
const fmtTime = (d: Date) => d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** Datum eller klocka, uppdateras varje halvminut. Renderas först i webbläsaren. */
export function Clock({ show, className }: { show: 'date' | 'time'; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      {now ? (show === 'date' ? fmtDate(now) : fmtTime(now)) : ' '}
    </span>
  );
}
