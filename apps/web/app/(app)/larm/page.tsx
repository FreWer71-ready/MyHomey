import { Icon, type IconName } from '@/components/Icon';
import { HUMIDITY_LIMIT, humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadHome, loadWeather } from '@/lib/data';
import { STALE_HOURS } from '@/lib/home';
import { hhmm } from '@/lib/prices';
import { symbolInfo } from '@/lib/weather';

export const dynamic = 'force-dynamic';

function since(iso: string | null) {
  if (!iso) return 'Otillgänglig i Homey';
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600_000);
  return h < 48 ? `Senast hörd för ${h} tim sedan` : `Senast hörd för ${Math.round(h / 24)} dagar sedan`;
}

function Section({ id, icon, title, count, tone, children }: {
  id: string; icon: IconName; title: string; count: number; tone: 'ok' | 'warn'; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-[24px] glass p-4">
      <h2 className="mb-3 flex items-center gap-3 text-[22px] font-extrabold">
        <span className={`flex size-11 items-center justify-center rounded-2xl ${tone === 'warn' ? 'bg-warn-strong text-white' : 'bg-ok-soft text-ok'}`}>
          <Icon name={icon} size={24} />
        </span>
        {title}
        <span className={`rounded-full px-3 py-0.5 text-base ${tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-glass-2 text-dim'}`}>{count}</span>
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-2xl bg-glass-2 p-4 font-bold text-dim">{text}</p>;

export default async function AlarmPage() {
  const [h, weather] = await Promise.all([loadHome(), loadWeather()]);
  const warning = rainWarning(weather, h.openings);
  const open = h.openings.filter((o) => o.open);
  const wet = h.rooms.filter((r) => r.humidity != null);
  const damp = humidityWarnings(h.rooms);

  return (
    <>
      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight">Larm</h1>

      {warning && (
        <div role="alert" className="flex items-center gap-3 rounded-[20px] bg-info-strong px-4 py-3 text-white">
          <Icon name="rain" size={28} />
          <span className="text-lg font-extrabold">
            {symbolInfo(weather!.nextPrecip?.symbol ?? weather!.current.symbol).label} väntas kl {hhmm(warning.at)} –{' '}
            {warning.windows.map((w) => `${w.name} (${w.room})`).join(', ')} är öppet
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section id="batteri" icon="battery" title="Lågt batteri" count={h.lowBatteryList.length} tone={h.lowBatteryList.length ? 'warn' : 'ok'}>
          {h.lowBatteryList.length ? (
            <ul className="flex flex-col gap-2">
              {h.lowBatteryList.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-4 py-3">
                  <span className="min-w-0 grow">
                    <span className="block truncate font-extrabold">{b.name}</span>
                    <span className="block text-sm font-bold text-dim">{b.room || 'Inget rum'}</span>
                  </span>
                  <span className="flex h-3 w-24 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <span className="h-full rounded-full bg-danger-strong" style={{ width: `${Math.max(4, b.level ?? 5)}%` }} />
                  </span>
                  <span className="w-14 text-right text-lg font-extrabold">{b.level == null ? 'Lågt' : `${Math.round(b.level)} %`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Alla batterier är ok." />
          )}
        </Section>

        <Section id="enheter" icon="wifi" title="Svarar inte" count={h.silent.length} tone={h.silent.length ? 'warn' : 'ok'}>
          {h.silent.length ? (
            <ul className="flex flex-col gap-2">
              {h.silent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-4 py-3">
                  <span className="min-w-0 grow">
                    <span className="block truncate font-extrabold">{s.name}</span>
                    <span className="block text-sm font-bold text-dim">{s.room || 'Inget rum'}</span>
                  </span>
                  <span className={`text-right text-sm font-extrabold ${s.reason === 'offline' ? 'text-danger' : ''}`}>{since(s.lastSeen)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text={`Alla sensorer har rapporterat de senaste ${STALE_HOURS} timmarna.`} />
          )}
        </Section>

        <Section id="oppet" icon="window" title="Öppna dörrar och fönster" count={open.length} tone={open.length ? 'warn' : 'ok'}>
          <ul className="flex flex-col gap-2">
            {h.openings.map((o) => (
              <li key={o.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-4 py-3">
                <Icon name={o.kind === 'door' ? 'door' : 'window'} size={22} />
                <span className="min-w-0 grow">
                  <span className="block truncate font-extrabold">{o.name}</span>
                  <span className="block text-sm font-bold text-dim">{o.room || 'Inget rum'}</span>
                </span>
                <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${o.open ? 'bg-warn-strong text-white' : 'bg-ok-soft text-ok'}`}>
                  {o.open ? 'Öppen' : 'Stängd'}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="fukt" icon="drop" title="Luftfuktighet i våtrum" count={damp.length} tone={damp.length ? 'warn' : 'ok'}>
          {wet.length ? (
            <ul className="flex flex-col gap-2">
              {wet.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-4 py-3">
                  <span className="min-w-0 grow font-extrabold">{r.name}</span>
                  <span className="text-sm font-bold text-dim">gräns {HUMIDITY_LIMIT} %</span>
                  <span className={`rounded-full px-3 py-1 font-extrabold ${r.humidity! >= HUMIDITY_LIMIT ? 'bg-teal text-white' : 'bg-ok-soft text-ok'}`}>
                    {Math.round(r.humidity!)} %
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Ingen fuktsensor i badrum eller toalett." />
          )}
        </Section>
      </div>
    </>
  );
}
