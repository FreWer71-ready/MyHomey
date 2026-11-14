import type { Trend } from '@/lib/home';

/**
 * Pil efter en temperatur: röd uppåt, blå nedåt, inget när den står still.
 * Vit pil på färgad rund bricka så att den syns mot alla värmetoner. Pilen glider lugnt åt sitt håll
 * (ut ur brickan och in från andra sidan), så att trenden syns även i ögonvrån.
 */
export function TrendArrow({ trend, className = '' }: { trend: Trend; className?: string }) {
  if (!trend) return null;
  const up = trend === 'up';
  return (
    <span
      role="img"
      aria-label={up ? 'stigande' : 'sjunkande'}
      className={`ml-1.5 inline-flex size-[0.62em] shrink-0 items-center overflow-hidden justify-center rounded-full align-[0.2em] ${up ? 'bg-[#E5484D]' : 'bg-[#1E6FE0]'} ${className}`}
    >
      <svg viewBox="0 0 12 12" className={`size-[70%] ${up ? 'trend-up' : 'trend-down'}`} aria-hidden>
        <path d={up ? 'M6 1 11 8H7.5v3h-3V8H1z' : 'M6 11 1 4h3.5V1h3v3H11z'} fill="#fff" />
      </svg>
    </span>
  );
}
