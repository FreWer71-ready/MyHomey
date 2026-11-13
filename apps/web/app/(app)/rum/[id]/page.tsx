import Link from 'next/link';
import { TrendArrow } from '@/components/TrendArrow';
import { LightControl } from '@/components/LightControl';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ActionTiles, type Action } from '@/components/ActionTiles';
import { SceneButtons } from '@/components/SceneButtons';
import { loadHome, loadHueScenes, loadNowPlaying, loadTv } from '@/lib/data';
import { TvRemote } from '@/components/TvRemote';
import { fmtPercent, fmtTemp } from '@/lib/scale';

export const dynamic = 'force-dynamic';

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [home, hue, tv, np] = await Promise.all([loadHome(), loadHueScenes(), loadTv(), loadNowPlaying()]);
  // TV:n i det här rummet: fjärren visas alltid (även avstängd, så att den kan slås på).
  const roomTv = tv && tv.zone === id ? tv : null;
  const tvNow = roomTv?.cast ? np.find((p) => p.id === roomTv.cast!.id) : undefined;
  const isHome = id === home.rootZoneId;
  const room = home.rooms.find((r) => r.id === id);
  if (!room && !isHome) notFound();

  const tabs = [
    ...(home.rootZoneId && home.homeMoods.length ? [{ id: home.rootZoneId, name: 'Hela hemmet' }] : []),
    ...home.rooms.map((r) => ({ id: r.id, name: r.name })),
  ];
  const nav = (
    <nav aria-label="Rum" className="scroll-x flex gap-2 max-md:-mx-3 max-md:overflow-x-auto max-md:px-3 md:flex-wrap">
      {tabs.map((r) => (
        <Link
          key={r.id}
          href={`/rum/${r.id}`}
          aria-current={r.id === id ? 'page' : undefined}
          className={`flex min-h-11 shrink-0 items-center rounded-full px-4 text-[16px] font-semibold whitespace-nowrap ${r.id === id ? 'bg-fg text-[#0B0F14]' : 'bg-card text-dim'}`}
        >
          {r.name}
        </Link>
      ))}
    </nav>
  );
  const card = 'flex flex-col gap-3 rounded-[20px] bg-card p-5 lg:p-6';
  const h2 = 'flex items-center gap-2.5 text-[18px] font-semibold text-dim';

  if (!room) {
    return (
      <>
        {nav}
        <header className={`${card} flex-row items-center`}>
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.06]"><Icon name="home" size={30} /></span>
          <div className="grow">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">Hela hemmet</h1>
            <p className="text-[16px] text-dim">{home.homeMoods.length} moods</p>
          </div>
        </header>
        <section className={card}>
          <h2 className={h2}><Icon name="star" size={22} />Scener</h2>
          <ActionTiles items={home.homeMoods.map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const }))} layout="grid" />
        </section>
      </>
    );
  }

  // Scener för rummet: Homey-moods och Hue-scener (Hue-rum med samma namn som zonen) i samma lista.
  const scenes: Action[] = [
    ...room.moods.map((m) => ({ id: m.id, name: m.name, kind: 'mood' as const })),
    ...(process.env.CONTROL !== 'hue'
      ? hue.scenes.filter((x) => x.room?.trim().toLowerCase() === room.name.trim().toLowerCase())
        .map((x) => ({ id: x.id, name: x.name, kind: 'hue' as const, dynamic: x.dynamic, active: x.active, colors: x.colors }))
      : []),
  ];
  const hot = room.temp != null && room.temp >= 26 ? '#F85149' : room.temp != null && room.temp < 18 ? '#4FA3FF' : undefined;
  const Stat = ({ value, unit, color }: { value: React.ReactNode; unit: string; color?: string }) => (
    <span className="flex min-w-16 flex-col items-end leading-none">
      <span className="text-[32px] font-bold tracking-tight tabular-nums" style={{ color }}>{value}</span>
      <span className="mt-1 text-[14px] text-dim">{unit}</span>
    </span>
  );

  return (
    <>
      {nav}

      {/* Rummet: ikon, namn och nyckeltal med enhet under (färg bara när något avviker). */}
      <header className={`${card} flex-row flex-wrap items-center gap-x-6`}>
        <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-white/[0.06]"><Icon name={room.icon} size={30} /></span>
        <div className="min-w-0 grow">
          <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight">{room.name}</h1>
          <p className="text-[16px] text-dim">{room.deviceCount} enheter · {room.lights.length} lampor</p>
        </div>
        {room.temp != null && <Stat value={<>{fmtTemp(room.temp).replace('°', '')}<TrendArrow trend={room.tempTrend} /></>} unit="°C" color={hot} />}
        {room.humidity != null && <Stat value={fmtPercent(room.humidity).replace(/\s?%/, '')} unit="% fukt" color={room.humidity >= 70 ? '#E3A008' : undefined} />}
        {room.lights.length > 0 && <Stat value={room.lightsOn} unit={`av ${room.lights.length} tända`} />}
      </header>

      {room.lights.length > 0 && <SceneButtons zoneId={room.id} room={room.name} size="large" />}

      {scenes.length > 0 && (
        <section className={card}>
          <h2 className={h2}><Icon name="star" size={22} />Scener</h2>
          <ActionTiles items={scenes} layout="grid" />
        </section>
      )}

      {roomTv && <TvRemote r={roomTv} title={tvNow ? [tvNow.title, tvNow.subtitle].filter(Boolean).join(' · ') : null} />}

      {room.lights.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className={`${h2} px-1`}><Icon name="bulb" size={22} />Belysning</h2>
          <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {room.lights.map((l) => (
              <LightControl key={l.id} light={l} />
            ))}
          </ul>
        </section>
      ) : (
        <p className={`${card} text-[17px] text-dim`}>Inga lampor i det här rummet.</p>
      )}
    </>
  );
}
