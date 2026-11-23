'use client';
import { useEffect, useState } from 'react';
import { TONE_COLOR } from '@/lib/commute';
import { hhmm } from '@/lib/prices';

/** Klockan i klienten: börjar på serverns tid (ingen hydreringsskillnad) och tickar sedan var 15:e sekund. */
function useNow(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Nedräkning till avresan som tickar (sidan är annars serverrenderad per visning):
 * "Gå om 3 min", "Gå nu" och när avresan passerat "Gått kl 13:53". `card` = rubrik i resekortet, `line` = rad på Hem.
 */
export function LeaveIn({ dep, serverNow, variant }: { dep: number; serverNow: number; variant: 'card' | 'line' }) {
  const now = useNow(serverNow);
  const min = Math.round((dep - now) / 60_000);
  const gone = min < -1;
  if (variant === 'line') {
    return (
      <span className="font-semibold" style={gone ? { color: TONE_COLOR.warn } : undefined}>
        {gone ? `sen ${-min} min – ta cykel eller taxi` : min <= 0 ? 'gå nu' : `gå om ${min} min`}
      </span>
    );
  }
  return gone
    ? <span className="text-[1.375rem] font-extrabold tabular-nums text-dim">Gått kl {hhmm(dep)}</span>
    : <>
        <span className="text-[1.375rem] font-extrabold tabular-nums">{min <= 0 ? 'Gå nu' : `Gå om ${min} min`}</span>
        <span className="text-[0.9375rem] text-dim tabular-nums">kl {hhmm(dep)}</span>
      </>;
}
