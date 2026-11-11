import Link from 'next/link';
import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { RoomTile } from '@/components/RoomTile';
import { rainWarning } from '@/lib/alerts';
import { loadHome, loadPrices, loadWeather } from '@/lib/data';
import { symbolInfo } from '@/lib/weather';
import { hhmm, summarize } from '@/lib/prices';
import { HEAT, fmtTemp, fmtWatt, heatColor } from '@/lib/scale';

export const dynamic = 'force-dynamic';

function Hero({ bg, icon, label, children }: { bg: string; icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[24px] p-4" style={{ background: bg }}>
      <span className="flex items-center gap-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/60">
          <Icon name={icon} size={22} />
        </span>
        <span className="text-[15px] font-bold">{label}</span>
      </span>
      {children}
    </div>
  );
}

function Status({ icon, label, value, tone, href }: { icon: IconName; label: string; value: string; tone: 'ok' | 'info' | 'warn'; href?: string }) {
  const tones = {
    ok: ['bg-white', 'bg-[#BFF0D4] text-[#05603A]', 'text-ink-2'],
    info: ['bg-white', 'bg-[#E3DAFF] text-[#5B2FD0]', 'text-ink-2'],
    warn: ['bg-[#FFE3D1] shadow-[inset_0_0_0_3px_#FF7A1A]', 'bg-[#FF7A1A] text-white', 'text-[#6B2A05]'],
  }[tone];
  const cls = `flex min-h-[76px] items-center gap-3 rounded-[22px] px-4 py-2.5 ${tones[0]}`;
  const body = (
    <>
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-[16px] ${tones[1]}`}>
        <Icon name={icon} size={26} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={`font-bold ${tones[2]}`}>{label}</span>
        <span className="text-xl leading-tight font-extrabold">{value}</span>
      </span>
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default async function HomePage() {
  const [h, prices, weather] = await Promise.all([loadHome(), loadPrices(), loadWeather()]);
  const price = summarize(prices, Date.now());
  const open = h.openings.filter((o) => o.open);
  const sky = weather ? symbolInfo(weather.current.symbol) : null;
  const warning = rainWarning(weather, h.openings);

  return (
    <>
      <header className="flex items-end justify-between gap-4">
        <div>
          <Clock show="date" className="text-[13px] font-bold tracking-wider text-ink-2 uppercase" />
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Hemma</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 rounded-full bg-[#D9F5E6] px-3 py-1.5 text-[14px] font-bold text-[#05603A]">
            <span className="size-2.5 rounded-full bg-[#12B76A]" />
            Live · {h.online} enheter
          </span>
          <Clock show="time" className="text-4xl leading-none font-extrabold tracking-tight" />
        </div>
      </header>

      {warning && (
        <Link href="/larm" role="alert" className="flex items-center gap-3 rounded-[20px] bg-[#1E5BD6] px-4 py-3 text-white">
          <Icon name="rain" size={28} />
          <span className="text-lg font-extrabold">
            Nederbörd väntas kl {hhmm(warning.at)} – stäng {warning.windows.map((w) => w.name).join(', ')}
          </span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Hero bg={heatColor(h.outdoorTemp)} icon="thermo" label={sky ? `Ute · ${sky.label}` : 'Ute'}>
          <span className="flex items-center justify-between gap-2">
            <span className="text-5xl leading-none font-extrabold tracking-tight">{fmtTemp(h.outdoorTemp)}</span>
            {sky && <Icon name={sky.icon} size={52} />}
          </span>
          {weather && (
            <span className="text-[15px] font-bold">
              {weather.nextPrecip
                ? `${symbolInfo(weather.nextPrecip.symbol).label} från ${hhmm(weather.nextPrecip.time)}`
                : 'Uppehåll närmaste 6 tim'}
            </span>
          )}
        </Hero>
        <Hero bg="var(--color-sun)" icon="bulb" label="Lampor tända">
          <span className="flex items-center justify-between gap-2">
            <span className="text-5xl leading-none font-extrabold tracking-tight">{h.lightsOn}</span>
            <span className="text-[15px] font-bold">av {h.lightsTotal}</span>
          </span>
        </Hero>
        <Hero bg="var(--color-violet-soft)" icon="bolt" label="Effekt nu">
          <span className="text-5xl leading-none font-extrabold tracking-tight">{fmtWatt(h.powerW)}</span>
          <span className="text-[15px] font-bold">{h.powerMeters} mätare</span>
        </Hero>
        <Hero bg={price.level?.bg ?? '#E6E8F0'} icon="money" label={price.level ? `Elpris · ${price.level.label}` : 'Elpris SE3'}>
          <span className="text-5xl leading-none font-extrabold tracking-tight">
            {price.now ? Math.round(price.now.ore) : '–'}
            <span className="text-xl"> öre</span>
          </span>
          <span className="text-[15px] font-bold">
            {price.cheapest1h ? `Billigast ${hhmm(price.cheapest1h.start)}–${hhmm(price.cheapest1h.end)}` : 'Priser saknas'}
          </span>
        </Hero>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Status
          icon={open.length ? 'shieldAlert' : 'shield'}
          label="Dörrar & fönster"
          value={open.length ? (open.length === 1 ? `${open[0].name} öppen` : `${open.length} öppna`) : 'Alla stängda'}
          tone={open.length ? 'warn' : 'ok'}
          href="/larm#oppet"
        />
        <Status icon="motion" label="Rörelse" value={h.motion ? `${h.motion} aktiva` : 'Lugnt'} tone="info" />
        <Status
          icon="battery"
          label="Batteri"
          value={h.lowBattery ? `${h.lowBattery} låga` : 'Alla ok'}
          tone={h.lowBattery ? 'warn' : 'ok'}
          href="/larm#batteri"
        />
        <Status
          icon="wifi"
          label="Enheter"
          value={h.silent.length ? `${h.silent.length} svarar inte` : `${h.online} online`}
          tone={h.silent.length ? 'warn' : 'ok'}
          href="/larm#enheter"
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-extrabold">Rum</h2>
        <div className="flex flex-wrap gap-1.5 text-[13px] font-bold text-[#3A3F5C]">
          {HEAT.map((s) => (
            <span key={s.label} className="rounded-full px-2.5 py-1" style={{ background: s.color }}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {h.rooms.map((r) => (
          <RoomTile key={r.id} room={r} />
        ))}
      </section>
    </>
  );
}
