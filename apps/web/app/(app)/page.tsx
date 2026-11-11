import { Clock } from '@/components/Clock';
import { Icon, type IconName } from '@/components/Icon';
import { RoomTile } from '@/components/RoomTile';
import { loadHome } from '@/lib/data';
import { HEAT, fmtTemp, fmtWatt, heatColor } from '@/lib/scale';

export const dynamic = 'force-dynamic';

function Hero({ bg, icon, label, children }: { bg: string; icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[28px] p-5" style={{ background: bg }}>
      <span className="flex size-13 items-center justify-center rounded-2xl bg-white/60">
        <Icon name={icon} size={28} />
      </span>
      <span className="text-[17px] font-bold">{label}</span>
      {children}
    </div>
  );
}

function Status({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: 'ok' | 'info' | 'warn' }) {
  const tones = {
    ok: ['bg-white', 'bg-[#BFF0D4] text-[#05603A]', 'text-ink-2'],
    info: ['bg-white', 'bg-[#E3DAFF] text-[#5B2FD0]', 'text-ink-2'],
    warn: ['bg-[#FFE3D1] shadow-[inset_0_0_0_3px_#FF7A1A]', 'bg-[#FF7A1A] text-white', 'text-[#6B2A05]'],
  }[tone];
  return (
    <div className={`flex min-h-30 items-center gap-4 rounded-[26px] px-5 py-4 ${tones[0]}`}>
      <span className={`flex size-17 shrink-0 items-center justify-center rounded-[22px] ${tones[1]}`}>
        <Icon name={icon} size={36} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className={`font-bold ${tones[2]}`}>{label}</span>
        <span className="text-2xl leading-tight font-extrabold">{value}</span>
      </span>
    </div>
  );
}

export default async function HomePage() {
  const h = await loadHome();
  const doorsOk = h.doorsOpen === 0;

  return (
    <>
      <header className="flex items-end justify-between gap-4">
        <div>
          <Clock show="date" className="text-[15px] font-bold tracking-wider text-ink-2 uppercase" />
          <h1 className="text-[44px] leading-tight font-extrabold tracking-tight">Hemma</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 rounded-full bg-[#D9F5E6] px-4 py-2.5 text-[15px] font-bold text-[#05603A]">
            <span className="size-2.5 rounded-full bg-[#12B76A]" />
            Live · {h.online} enheter
          </span>
          <Clock show="time" className="text-5xl leading-none font-extrabold tracking-tight" />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Hero bg={heatColor(h.outdoorTemp)} icon="thermo" label="Ute">
          <span className="text-6xl leading-none font-extrabold tracking-tight">{fmtTemp(h.outdoorTemp)}</span>
        </Hero>
        <Hero bg="var(--color-sun)" icon="bulb" label="Lampor tända">
          <span className="flex items-center justify-between gap-2">
            <span className="text-6xl leading-none font-extrabold tracking-tight">{h.lightsOn}</span>
            <span className="text-[15px] font-bold">av {h.lightsTotal}</span>
          </span>
        </Hero>
        <Hero bg="var(--color-violet-soft)" icon="bolt" label="Effekt nu">
          <span className="text-6xl leading-none font-extrabold tracking-tight">{fmtWatt(h.powerW)}</span>
          <span className="text-[15px] font-bold">{h.powerMeters} mätare</span>
        </Hero>
        <Hero bg="#E6E8F0" icon="money" label="Elpris SE3">
          <span className="text-[40px] leading-tight font-extrabold tracking-tight">Kommer</span>
          <span className="text-[15px] font-bold text-ink-2">Steg 5 i byggordningen</span>
        </Hero>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Status
          icon={doorsOk ? 'shield' : 'shieldAlert'}
          label="Dörrar"
          value={doorsOk ? 'Alla stängda' : `${h.doorsOpen} öppna`}
          tone={doorsOk ? 'ok' : 'warn'}
        />
        <Status icon="motion" label="Rörelse" value={h.motion ? `${h.motion} aktiva` : 'Lugnt'} tone="info" />
        <Status
          icon="battery"
          label="Batteri"
          value={h.lowBattery ? `${h.lowBattery} låga` : 'Alla ok'}
          tone={h.lowBattery ? 'warn' : 'ok'}
        />
        <Status
          icon="wifi"
          label="Enheter"
          value={`${h.online} online`}
          tone={h.online === h.deviceTotal ? 'ok' : 'warn'}
        />
      </section>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[26px] font-extrabold">Rum</h2>
        <div className="flex flex-wrap gap-1.5 text-[13px] font-bold text-[#3A3F5C]">
          {HEAT.map((s) => (
            <span key={s.label} className="rounded-full px-2.5 py-1" style={{ background: s.color }}>
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        {h.rooms.map((r) => (
          <RoomTile key={r.id} room={r} />
        ))}
      </section>
    </>
  );
}
