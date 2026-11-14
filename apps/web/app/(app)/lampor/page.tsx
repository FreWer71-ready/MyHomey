import Link from 'next/link';

import { AllOffButton } from '@/components/AllOffButton';
import { Icon } from '@/components/Icon';
import { LightControl } from '@/components/LightControl';
import { loadHome } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Alla lampor i hemmet per rum, rum med tända lampor först, och en knapp som släcker allt. */
export default async function LightsPage() {
  const h = await loadHome();
  const rooms = h.rooms.filter((r) => r.lights.length > 0)
    .sort((a, b) => Number(b.lightsOn > 0) - Number(a.lightsOn > 0) || a.name.localeCompare(b.name, 'sv'));
  const lit = rooms.flatMap((r) => r.lights.filter((l) => l.on).map((l) => l.id));
  const h2 = 'flex items-center gap-2.5 text-[18px] font-semibold text-dim';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight">Lampor</h1>
          <p className="text-[16px] text-dim">{h.lightsOn} av {h.lightsTotal} tända</p>
        </div>
        <AllOffButton ids={lit} />
      </header>

      {rooms.map((r) => (
        <section key={r.id} className="flex flex-col gap-3">
          <h2 className={`${h2} px-1`}>
            <Icon name="bulb" size={22} />
            <Link href={`/rum/${r.id}`} className="text-fg">{r.name}</Link>
            <span>· {r.lightsOn ? `${r.lightsOn} tända` : 'släckt'}</span>
          </h2>
          <ul className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {r.lights.map((l) => <LightControl key={l.id} light={l} />)}
          </ul>
        </section>
      ))}
      {rooms.length === 0 && <p className="rounded-[20px] bg-card p-5 text-[17px] text-dim">Inga lampor hittades.</p>}
    </div>
  );
}
