import { Icon } from '@/components/Icon';
import { loadContactLog, loadHome, type ContactEvent } from '@/lib/data';
import { seenAgo } from '@/lib/time';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Stockholm';
const time = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);
const dayKey = (ms: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short' }).format(ms);
const dayLabel = (ms: number, now: number) => {
  if (dayKey(ms) === dayKey(now)) return 'Idag';
  if (dayKey(ms) === dayKey(now - 86400_000)) return 'Igår';
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).format(ms).replace('.', '');
  return s[0].toUpperCase() + s.slice(1);
};
const dur = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${Math.round(m / 1440)} d`;
};
const card = 'flex min-w-0 flex-col gap-2 rounded-[20px] bg-card p-5 lg:p-6';
const h2 = 'flex items-center gap-2.5 text-[18px] font-semibold text-dim';

/** Alla dörrar och fönster med nuläge, och en logg över öppnat/stängt de senaste 7 dygnen. */
export default async function DoorsPage() {
  const h = await loadHome();
  const list = [...h.openings].sort((a, b) => Number(b.open) - Number(a.open) || a.room.localeCompare(b.room, 'sv') || a.name.localeCompare(b.name, 'sv'));
  const log = await loadContactLog(list.map((o) => o.id)).catch(() => [] as ContactEvent[]);
  const byId = new Map(list.map((o) => [o.id, o]));
  const lastOf = new Map<string, number>();
  for (const e of log) if (!lastOf.has(e.device)) lastOf.set(e.device, e.ts);
  // Hur länge något var öppet: närmast följande stängning för samma sensor.
  const openFor = new Map<ContactEvent, number>();
  const nextClose = new Map<string, number>();
  for (const e of log) {
    if (!e.open) nextClose.set(e.device, e.ts);
    else if (nextClose.has(e.device)) { openFor.set(e, nextClose.get(e.device)! - e.ts); nextClose.delete(e.device); }
  }
  const now = Date.now();
  const days = [...new Set(log.map((e) => dayKey(e.ts)))];
  const nOpen = list.filter((o) => o.open).length;

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <header className="lg:col-span-12">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">Dörrar & fönster</h1>
        <p className="text-[16px] text-dim">{nOpen ? `${nOpen} öppna` : 'Alla stängda'} · {list.length} {list.length === 1 ? 'sensor' : 'sensorer'}</p>
      </header>

      <section aria-label="Nuläge" className={`${card} lg:col-span-5`}>
        <h2 className={h2}><Icon name="shield" size={22} />Nuläge</h2>
        <ul>
          {list.map((o) => {
            const since = lastOf.get(o.id);
            return (
              <li key={o.id} className="flex min-h-[60px] items-center gap-3 border-b border-line py-2 last:border-b-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.06]"><Icon name={o.kind} size={24} /></span>
                <span className="flex min-w-0 grow flex-col leading-tight">
                  <span className="truncate text-[17px] font-semibold">{o.name}</span>
                  <span className="truncate text-[15px] text-dim">{o.room}{since ? ` · sedan ${seenAgo(new Date(since).toISOString(), now)}` : ''}</span>
                </span>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[15px] font-semibold ${o.open ? 'bg-[#F0883E]/20 text-[#F0883E]' : 'bg-white/[0.06] text-dim'}`}>
                  {o.open ? 'Öppen' : 'Stängd'}
                </span>
              </li>
            );
          })}
        </ul>
        {list.length === 0 && <p className="text-[16px] text-dim">Inga dörr- eller fönstersensorer.</p>}
      </section>

      <section aria-label="Logg" className={`${card} lg:col-span-7`}>
        <h2 className={h2}><Icon name="chart" size={22} />Logg · 7 dygn</h2>
        {days.length === 0 && <p className="text-[16px] text-dim">Inga händelser.</p>}
        {days.map((d) => {
          const evs = log.filter((e) => dayKey(e.ts) === d);
          return (
            <div key={d} className="flex flex-col">
              <h3 className="pt-2 pb-1 text-[15px] font-semibold text-dim">{dayLabel(evs[0].ts, now)}</h3>
              <ol>
                {evs.map((e, i) => {
                  const o = byId.get(e.device);
                  const len = openFor.get(e);
                  return (
                    <li key={`${e.device}-${e.ts}-${i}`} className="flex min-h-[44px] items-center gap-3 border-b border-line py-1.5 text-[16px] last:border-b-0">
                      <span className="w-12 shrink-0 text-dim tabular-nums">{time(e.ts)}</span>
                      <span className={`size-2.5 shrink-0 rounded-full ${e.open ? 'bg-[#F0883E]' : 'bg-white/25'}`} />
                      <span className="min-w-0 grow truncate"><span className="font-semibold">{o?.name ?? 'Okänd'}</span> <span className="text-dim">{e.open ? 'öppnades' : 'stängdes'}</span></span>
                      {len != null && <span className="shrink-0 text-[15px] text-dim tabular-nums">{dur(len)}</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </section>
    </div>
  );
}
