// Ikoner: platta, färgade symboler i samma stil som vädersymbolerna (WeatherIcon),
// med lätta animationer (.wx-* i globals.css). Rena kontrollikoner är linjeikoner.

const C = {
  sun: '#FFC21A', ray: '#FFB000', orange: '#FF8A3D', red: '#F0503C', green: '#34C27A',
  blue: '#4FA3FF', violet: '#8B5CF6', teal: '#2BB5C4', cloud: '#EEF2F8', grey: '#C5CFDD',
  dark: '#5B6478', wood: '#C98A5A', moon: '#FFE08A',
};

const FLAT = {
  home: (
    <>
      <path d="M5 11 12 5l7 6v9H5z" fill={C.cloud} />
      <path d="M2.8 11.6 12 3.8l9.2 7.8" fill="none" stroke={C.red} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={10.3} y={14} width={3.4} height={6} rx={0.8} fill={C.wood} />
    </>
  ),
  rooms: (
    <>
      <rect className="wx-pop" x={3} y={3} width={8} height={8} rx={2.2} fill={C.blue} />
      <rect className="wx-pop" style={{ animationDelay: '0.5s' }} x={13} y={3} width={8} height={8} rx={2.2} fill={C.sun} />
      <rect className="wx-pop" style={{ animationDelay: '1.5s' }} x={3} y={13} width={8} height={8} rx={2.2} fill={C.green} />
      <rect className="wx-pop" style={{ animationDelay: '1s' }} x={13} y={13} width={8} height={8} rx={2.2} fill={C.violet} />
    </>
  ),
  bolt: <path className="wx-flash" d="M13.5 2 4.5 13.5h6.2L9.5 22l9-11.5h-6.2z" fill={C.sun} />,
  chart: (
    <>
      <rect className="wx-grow" x={4} y={12} width={4} height={8} rx={1.2} fill={C.blue} />
      <rect className="wx-grow" style={{ animationDelay: '0.4s' }} x={10} y={6} width={4} height={14} rx={1.2} fill={C.green} />
      <rect className="wx-grow" style={{ animationDelay: '0.8s' }} x={16} y={9} width={4} height={11} rx={1.2} fill={C.sun} />
      <rect x={2.5} y={20} width={19} height={1.8} rx={0.9} fill={C.grey} />
    </>
  ),
  bell: (
    <g className="wx-swing" style={{ transformOrigin: '12px 3px' }}>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" fill={C.sun} />
      <circle cx={12} cy={20.2} r={2} fill={C.orange} />
      <rect x={11} y={2} width={2} height={2.5} rx={1} fill={C.ray} />
    </g>
  ),
  play: (
    <>
      <circle cx={12} cy={12} r={9.5} fill={C.cloud} />
      <path className="wx-twinkle" d="M10 7.8v8.4l6.5-4.2z" fill={C.teal} />
    </>
  ),
  star: (
    <>
      <path className="wx-glint" d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill={C.sun} stroke={C.ray} strokeWidth={1} strokeLinejoin="round" />
      <path className="wx-twinkle" d="M20 2.5v3M18.5 4h3" stroke={C.cloud} strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  // Larm med nytt att se: röd klocka som skakar ivrigt, ljudvågor blinkar.
  bellAlert: (
    <>
      <g className="wx-shake" style={{ transformOrigin: '12px 3px' }}>
        <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" fill={C.red} />
        <circle cx={12} cy={20.2} r={2} fill={C.orange} />
        <rect x={11} y={2} width={2} height={2.5} rx={1} fill={C.red} />
      </g>
      <path className="wx-blink" d="M3.5 7.5a9 9 0 0 1 2.5-4M20.5 7.5a9 9 0 0 0-2.5-4" fill="none" stroke={C.red} strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
  thermo: (
    <>
      <path d="M9.5 4.5a2.5 2.5 0 0 1 5 0v9.2a4.5 4.5 0 1 1-5 0z" fill={C.cloud} />
      <rect x={11} y={8} width={2} height={8} rx={1} fill={C.red} />
      <circle cx={12} cy={17.3} r={2.6} fill={C.red} />
    </>
  ),
  drop: (
    <>
      <g className="wx-bob">
        <path d="M12 2.5s-6.5 7-6.5 11.8a6.5 6.5 0 0 0 13 0C18.5 9.5 12 2.5 12 2.5z" fill={C.blue} />
        <path d="M9 14.5a3.2 3.2 0 0 0 2.2 3" fill="none" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
      </g>
      <ellipse className="wx-ripple" cx={12} cy={22.3} rx={5} ry={1} fill="none" stroke={C.blue} strokeWidth={1} />
    </>
  ),
  bulb: (
    <>
      <circle className="wx-twinkle" cx={12} cy={9.5} r={8} fill={C.sun} opacity={0.35} />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" fill={C.sun} />
      <rect x={9.4} y={17.6} width={5.2} height={2} rx={0.8} fill={C.grey} />
      <rect x={10.2} y={20.2} width={3.6} height={1.6} rx={0.8} fill={C.dark} />
    </>
  ),
  money: (
    <>
      <circle cx={12} cy={12} r={9.5} fill={C.sun} />
      <circle cx={12} cy={12} r={7} fill="none" stroke={C.ray} strokeWidth={1.4} />
      <text x={12} y={15.2} textAnchor="middle" fontSize={8} fontWeight={800} fill="#8A5A00" fontFamily="system-ui, sans-serif">kr</text>
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5 4.5 5.5v6c0 5 3.3 8.3 7.5 10 4.2-1.7 7.5-5 7.5-10v-6z" fill={C.green} />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  shieldAlert: (
    <>
      <path d="M12 2.5 4.5 5.5v6c0 5 3.3 8.3 7.5 10 4.2-1.7 7.5-5 7.5-10v-6z" fill={C.orange} />
      <rect className="wx-flash" x={10.9} y={7} width={2.2} height={7} rx={1.1} fill="#FFFFFF" />
      <circle cx={12} cy={16.6} r={1.3} fill="#FFFFFF" />
    </>
  ),
  motion: (
    <>
      <circle cx={8} cy={4.5} r={2.2} fill={C.violet} />
      <path d="M8 7.5 5.5 13l2.5 1.5L7 21M8 7.5l2.5 5.5L13 14M7.6 10 4 11.5M9 15.5l2.5 5.5" fill="none" stroke={C.violet} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <path className="wx-twinkle" d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke={C.teal} strokeWidth={2} strokeLinecap="round" />
      <path className="wx-twinkle" style={{ animationDelay: '0.6s' }} d="M18.5 6a9 9 0 0 1 0 12" fill="none" stroke={C.teal} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  battery: (
    <>
      <rect x={2} y={7} width={17} height={10} rx={2.5} fill={C.cloud} />
      <rect x={19.5} y={10} width={2.5} height={4} rx={1} fill={C.grey} />
      <rect className="wx-flash" x={3.8} y={8.8} width={4.5} height={6.4} rx={1.2} fill={C.red} />
    </>
  ),
  wifi: (
    <>
      <path className="wx-twinkle" d="M2.5 9.5a14 14 0 0 1 19 0" fill="none" stroke={C.blue} strokeWidth={2.4} strokeLinecap="round" style={{ animationDelay: '1s' }} />
      <path className="wx-twinkle" d="M5.8 13a9 9 0 0 1 12.4 0" fill="none" stroke={C.blue} strokeWidth={2.4} strokeLinecap="round" style={{ animationDelay: '0.5s' }} />
      <path className="wx-twinkle" d="M9 16.5a4.5 4.5 0 0 1 6 0" fill="none" stroke={C.blue} strokeWidth={2.4} strokeLinecap="round" />
      <circle cx={12} cy={19.5} r={1.6} fill={C.blue} />
    </>
  ),
  sun: (
    <>
      <g className="wx-spin" style={{ transformOrigin: '12px 12px' }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect key={a} x={11} y={1.5} width={2} height={3.5} rx={1} fill={C.ray} transform={`rotate(${a} 12 12)`} />
        ))}
      </g>
      <circle cx={12} cy={12} r={5} fill={C.sun} />
    </>
  ),
  moon: (
    <>
      <path d="M14 3a9 9 0 1 0 7 13.5A7.2 7.2 0 0 1 14 3z" fill={C.moon} />
      <circle className="wx-twinkle" cx={19.5} cy={5} r={1.1} fill={C.moon} />
    </>
  ),
  music: (
    <>
      <path d="M9 17V6l10-2v11" fill="none" stroke={C.violet} strokeWidth={2.2} strokeLinejoin="round" />
      <ellipse className="wx-bob" cx={6.8} cy={17.5} rx={2.6} ry={2.1} fill={C.violet} />
      <ellipse className="wx-bob" style={{ animationDelay: '0.5s' }} cx={16.8} cy={15.5} rx={2.6} ry={2.1} fill={C.teal} />
    </>
  ),
  tv: (
    <>
      <rect x={2.5} y={4} width={19} height={12.5} rx={2} fill={C.dark} />
      <rect x={4} y={5.5} width={16} height={9.5} rx={1} fill={C.blue} />
      <path className="wx-twinkle" d="M10.5 7.8v5l4-2.5z" fill={C.cloud} />
      <path d="M8 20h8M12 16.5V20" fill="none" stroke={C.grey} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  power: (
    <>
      <path d="M7 6.5a7.5 7.5 0 1 0 10 0" fill="none" stroke={C.red} strokeWidth={2.6} strokeLinecap="round" />
      <rect x={10.8} y={2.5} width={2.4} height={9} rx={1.2} fill={C.red} />
    </>
  ),
  sofa: (
    <g className="wx-bob" style={{ animationDuration: '5s' }}>
      <rect x={4} y={6} width={16} height={7} rx={2.5} fill="#A78BFA" />
      <rect x={2} y={10} width={4} height={8} rx={2} fill={C.violet} />
      <rect x={18} y={10} width={4} height={8} rx={2} fill={C.violet} />
      <rect x={5} y={12} width={14} height={5} rx={1.5} fill={C.violet} />
      <rect x={4} y={18} width={2} height={2.5} rx={0.6} fill={C.dark} />
      <rect x={18} y={18} width={2} height={2.5} rx={0.6} fill={C.dark} />
    </g>
  ),
  bed: (
    <>
      <rect x={2.5} y={5} width={2.5} height={15} rx={1.2} fill={C.wood} />
      <rect x={4} y={13} width={17.5} height={4.5} rx={1.5} fill={C.cloud} />
      <rect x={5.5} y={9.5} width={5} height={3.5} rx={1.5} fill={C.blue} />
      <rect x={11.5} y={10.5} width={10} height={3.5} rx={1.5} fill={C.violet} />
      <rect x={20} y={17} width={2} height={3} rx={0.8} fill={C.wood} />
      <text className="wx-rise" x={7} y={7} fontSize={5.5} fontWeight={800} fill={C.cloud} fontFamily="system-ui, sans-serif">z</text>
      <text className="wx-rise" style={{ animationDelay: '1.3s' }} x={10} y={5} fontSize={4.5} fontWeight={800} fill={C.cloud} fontFamily="system-ui, sans-serif">z</text>
    </>
  ),
  door: (
    <>
      <rect x={5} y={2.5} width={14} height={19} rx={1.5} fill={C.grey} />
      <rect x={6.8} y={4} width={10.4} height={17.5} rx={1} fill={C.wood} />
      <circle className="wx-twinkle" cx={14.8} cy={12.5} r={1.1} fill={C.sun} />
    </>
  ),
  window: (
    <>
      <rect x={3} y={3} width={18} height={18} rx={2} fill={C.cloud} />
      <rect x={5} y={5} width={6} height={6} rx={0.8} fill={C.blue} />
      <rect x={13} y={5} width={6} height={6} rx={0.8} fill={C.blue} />
      <rect x={5} y={13} width={6} height={6} rx={0.8} fill={C.blue} />
      <rect x={13} y={13} width={6} height={6} rx={0.8} fill={C.blue} />
      <path className="wx-twinkle" d="M6 9.5l3-3M14 9.5l3-3M6 17.5l3-3M14 17.5l3-3" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  wc: (
    <>
      <rect x={6} y={2.5} width={12} height={6.5} rx={1.5} fill={C.grey} />
      <path d="M4.5 10h15a7.5 7.5 0 0 1-15 0z" fill={C.cloud} />
      <path d="M9 16.5 8 21.5h8l-1-5" fill={C.cloud} />
      <rect x={4.5} y={9} width={15} height={2} rx={1} fill={C.blue} />
      <path className="wx-fall" d="M12 11.6c-.9 1.3-1.2 1.9-1.2 2.4a1.2 1.2 0 0 0 2.4 0c0-.5-.3-1.1-1.2-2.4z" fill={C.blue} />
    </>
  ),
  pot: (
    <>
      <path className="wx-fall" style={{ animationDirection: 'reverse' }} d="M9 6.5c0-1.5 1.5-1.5 1.5-3M13.5 6.5c0-1.5 1.5-1.5 1.5-3" fill="none" stroke={C.grey} strokeWidth={1.6} strokeLinecap="round" />
      <rect x={3.5} y={9} width={17} height={2.5} rx={1.2} fill="#C2402F" />
      <path d="M5 11.5h14v5.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill={C.red} />
      <rect x={1.5} y={12} width={3} height={2} rx={1} fill={C.dark} />
      <rect x={19.5} y={12} width={3} height={2} rx={1} fill={C.dark} />
    </>
  ),
  box: (
    <g className="wx-bob">
      <path d="M3 7.5 12 3l9 4.5v10L12 22l-9-4.5z" fill={C.wood} />
      <path d="M3 7.5 12 12l9-4.5L12 3z" fill="#E0A877" />
      <path d="M12 12v10" stroke="#9C6A42" strokeWidth={1.4} />
      <path d="m7.5 5.3 9 4.5" stroke={C.cloud} strokeWidth={1.8} />
    </g>
  ),
} as const;

// Linjeikoner för rena kontroller (följer textfärgen).
const LINE = {
  logo: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5',
  back: 'm15 6-6 6 6 6',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  cloud: 'M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z',
  cloudSun: 'M12 2v2M4.9 4.9l1.4 1.4M2 12h2M17.7 6.3l1.4-1.4M8 12a4 4 0 0 1 7.5-2M9 20h8a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.2 14.5 3 3 0 0 0 9 20z',
  rain: 'M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7zM8 17l-1 3M12 17l-1 3M16 17l-1 3',
  snow: 'M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7zM8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01',
  fog: 'M4 10h16M4 14h16M6 18h12M7 6h10',
  thunder: 'M7 14h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6 7a3.5 3.5 0 0 0 1 7zM13 15l-3 4h4l-3 4',
} as const;

export type IconName = keyof typeof FLAT | keyof typeof LINE;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  if (name in FLAT) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`shrink-0 overflow-visible ${className ?? ''}`}>
        {FLAT[name as keyof typeof FLAT]}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`ico ${className ?? ''}`}>
      <path d={LINE[name as keyof typeof LINE]} />
    </svg>
  );
}
