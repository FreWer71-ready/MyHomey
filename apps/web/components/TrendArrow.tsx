import type { Trend } from '@/lib/home';

/** Pil efter en temperatur: upp eller ned senaste timmen, inget när den står still. */
export function TrendArrow({ trend, className = '' }: { trend: Trend; className?: string }) {
  if (!trend) return null;
  const up = trend === 'up';
  return (
    <svg
      viewBox="0 0 12 12" role="img" aria-label={up ? 'stigande' : 'sjunkande'}
      className={`ml-1 inline-block size-[0.55em] shrink-0 align-[0.25em] text-fg ${className}`}
    >
      <path d={up ? 'M6 1 11 8H7.5v3h-3V8H1z' : 'M6 11 1 4h3.5V1h3v3H11z'} fill="currentColor" />
    </svg>
  );
}
