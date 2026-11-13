'use client';
import { useEffect, useState } from 'react';

/** "om 12 min" till en tidpunkt, uppdateras varje halvminut. "nu" när det är mindre än en minut kvar. */
export function MinutesTo({ at, className }: { at: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return null;
  const min = Math.round((at - now) / 60_000);
  const text = min <= 0 ? 'nu' : min < 60 ? `om ${min} min` : `om ${Math.floor(min / 60)} h ${min % 60} min`;
  return <span className={className} suppressHydrationWarning>{text}</span>;
}
