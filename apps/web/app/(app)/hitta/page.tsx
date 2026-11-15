import { Icon } from '@/components/Icon';
import { SoundButton } from '@/components/SoundButton';
import { loadLocate } from '@/lib/data';
import { whereText } from '@/lib/locate';
import { seenAgo } from '@/lib/time';

export const dynamic = 'force-dynamic';

const card = 'flex min-w-0 flex-col gap-2 rounded-[20px] bg-card p-5 lg:p-6';
const h2 = 'flex items-center gap-2.5 text-[18px] font-semibold text-dim';
// Kartlänk öppnas bara när man trycker (positionen skickas inte någonstans annars).
const mapUrl = (lat: number | null, lon: number | null) => (lat != null && lon != null ? `https://maps.google.com/?q=${lat},${lon}` : null);
const pct = (b: number | null, low = false) => b != null && <span className={`tabular-nums ${low || b <= 15 ? 'text-danger' : 'text-dim'}`}>{Math.round(b)} %</span>;

/** Var är alla? Personer från Life360 och prylar från Apple Hitta. */
export default async function LocatePage() {
  const { members, items } = await loadLocate();
  const now = Date.now();
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:col-span-12">Var är</h1>

      <section aria-label="Familjen" className={`${card} lg:col-span-6`}>
        <h2 className={h2}><Icon name="home" size={22} />Familjen · Life360</h2>
        {members.length === 0 && <p className="text-[16px] text-dim">Ingen Life360-medlem i Homey.</p>}
        <ul>
          {members.map((m) => {
            const where = whereText(m);
            const map = mapUrl(m.lat, m.lon);
            return (
              <li key={m.id} className="flex min-h-[68px] items-center gap-3 border-b border-line py-2 last:border-b-0">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-full text-[18px] font-bold ${m.home ? 'bg-ok/20 text-ok' : 'bg-white/[0.06] text-fg'}`}>{m.first[0]}</span>
                <span className="flex min-w-0 grow flex-col leading-tight">
                  <span className="truncate text-[17px] font-semibold">{m.first}{m.driving && <span className="ml-2 rounded-full bg-[#F0883E]/20 px-2 py-0.5 text-[13px] text-[#F0883E]">Kör</span>}</span>
                  <span className="truncate text-[15px] text-dim">
                    {m.home ? 'Hemma' : where ?? 'Borta'}{m.stay ? ` · ${m.stay}` : ''}{!m.home && m.address && where !== m.address.split(',')[0] ? ` · ${m.address}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 text-[15px]">
                  {pct(m.battery)}
                  {map && !m.home && <a href={map} target="_blank" rel="noopener noreferrer" className="font-semibold text-fg underline">Karta</a>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {(items.length > 0 || process.env.CONTROL !== 'hue') && <section aria-label="Prylar" className={`${card} lg:col-span-6`}>
        <h2 className={h2}><Icon name="star" size={22} />Prylar · Apple Hitta</h2>
        {items.length === 0 && <p className="text-[16px] text-dim">Inga Hitta-prylar i Homey.</p>}
        <ul>
          {items.map((it) => {
            const map = mapUrl(it.lat, it.lon);
            return (
              <li key={it.id} className="flex min-h-[68px] items-center gap-3 border-b border-line py-2 last:border-b-0">
                <span className="flex min-w-0 grow flex-col leading-tight">
                  <span className="truncate text-[17px] font-semibold">{it.name}</span>
                  <span className="truncate text-[15px] text-dim">
                    {it.home ? 'Hemma' : it.km != null ? `${it.km < 1 ? `${Math.round(it.km * 1000)} m` : `${it.km.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} km`} bort` : 'Borta'}
                    {it.moving ? ' · rör sig' : ''}{it.charging ? ' · laddar' : ''}{it.updated ? ` · ${seenAgo(it.updated, now)}` : ''}
                    {!it.home && map && <> · <a href={map} target="_blank" rel="noopener noreferrer" className="font-semibold text-fg underline">Karta</a></>}
                  </span>
                </span>
                {pct(it.battery, it.lowBattery)}
                {it.canSound && <SoundButton id={it.id} />}
              </li>
            );
          })}
        </ul>
      </section>}
    </div>
  );
}
