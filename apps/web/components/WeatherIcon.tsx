import type { WeatherKind } from '@/lib/weather';

// Egna platta vädersymboler i färg, lätt animerade (se .wx-* i globals.css).
const SUN = '#FFC21A';
const RAY = '#FFB000';
const MOON = '#FFE08A';
const CLOUD = '#EEF2F8';
const CLOUD_SHADE = '#C5CFDD';
const DARK_CLOUD = '#8F9BB0';
const DROP = '#4FA3FF';

const cloudPath = 'M18 48h28a11 11 0 0 0 1.5-21.9A15 15 0 0 0 18.6 24 12 12 0 0 0 18 48z';

function Sun({ x = 32, y = 32, r = 11 }: { x?: number; y?: number; r?: number }) {
  return (
    <g>
      <g className="wx-spin" style={{ transformOrigin: `${x}px ${y}px` }}>
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={i}
            x1={x} y1={y - r - 5} x2={x} y2={y - r - 10}
            stroke={RAY} strokeWidth={3.5} strokeLinecap="round"
            transform={`rotate(${i * 45} ${x} ${y})`}
          />
        ))}
      </g>
      <circle cx={x} cy={y} r={r} fill={SUN} />
    </g>
  );
}

function Moon({ x = 30, y = 30 }: { x?: number; y?: number }) {
  return (
    <g>
      <path d={`M${x + 6} ${y - 14}a14 14 0 1 0 10 22 11 11 0 0 1-10-22z`} fill={MOON} />
      <circle className="wx-twinkle" cx={x + 18} cy={y - 10} r={1.6} fill={MOON} />
      <circle className="wx-twinkle" cx={x + 22} cy={y + 2} r={1.2} fill={MOON} style={{ animationDelay: '1.2s' }} />
    </g>
  );
}

function Cloud({ dark = false, dx = 0, dy = 0, scale = 1 }: { dark?: boolean; dx?: number; dy?: number; scale?: number }) {
  return (
    <g className="wx-drift" transform={`translate(${dx} ${dy}) scale(${scale})`}>
      <path d={cloudPath} transform="translate(3 3)" fill={dark ? '#6B7790' : CLOUD_SHADE} />
      <path d={cloudPath} fill={dark ? DARK_CLOUD : CLOUD} />
    </g>
  );
}

const fall = (cls: string, items: { x: number; delay: number }[], draw: (x: number) => React.ReactNode) =>
  items.map((it, i) => (
    <g key={i} className={cls} style={{ animationDelay: `${it.delay}s` }}>
      {draw(it.x)}
    </g>
  ));

const drop = (x: number) => <path d={`M${x} 50c-2.2 3.2-3 4.6-3 6a3 3 0 0 0 6 0c0-1.4-.8-2.8-3-6z`} fill={DROP} />;
const flake = (x: number) => <circle cx={x} cy={54} r={2.6} fill="#FFFFFF" />;

export function WeatherIcon({ kind, size = 64, label }: { kind: WeatherKind; size?: number; label: string }) {
  const lanes = [{ x: 24, delay: 0 }, { x: 33, delay: 0.5 }, { x: 42, delay: 0.95 }];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label} className="shrink-0 overflow-visible">
      {kind === 'sun' && <Sun />}
      {kind === 'moon' && <Moon />}
      {kind === 'partly-day' && (<><Sun x={21} y={20} r={9} /><Cloud dx={11} dy={10} scale={0.78} /></>)}
      {kind === 'partly-night' && (<><Moon x={16} y={22} /><Cloud dx={11} dy={10} scale={0.78} /></>)}
      {kind === 'cloud' && (<><Cloud dx={-4} dy={-14} scale={0.7} /><Cloud dx={8} dy={6} scale={0.85} /></>)}
      {kind === 'rain' && (<>{fall('wx-fall', lanes, drop)}<Cloud dy={-6} /></>)}
      {kind === 'snow' && (<>{fall('wx-flake', lanes.map((l) => ({ ...l, delay: l.delay * 2 })), flake)}<Cloud dy={-6} /></>)}
      {kind === 'sleet' && (<>{fall('wx-fall', [lanes[0], lanes[2]], drop)}{fall('wx-flake', [lanes[1]], flake)}<Cloud dy={-6} /></>)}
      {kind === 'thunder' && (
        <>
          <Cloud dark dy={-8} />
          <path className="wx-flash" d="M34 36l-9 13h6l-3 11 11-15h-6l3-9z" fill={SUN} />
        </>
      )}
      {kind === 'fog' && (
        <>
          <Cloud dy={-8} />
          {[46, 52, 58].map((y, i) => (
            <line key={y} className="wx-slide" style={{ animationDelay: `${i * 0.8}s` }} x1={14 + i * 3} y1={y} x2={50 - i * 2} y2={y} stroke={CLOUD_SHADE} strokeWidth={3.5} strokeLinecap="round" />
          ))}
        </>
      )}
    </svg>
  );
}
