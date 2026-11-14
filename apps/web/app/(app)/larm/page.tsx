import { Icon, type IconName } from '@/components/Icon';
import { HUMIDITY_LIMIT, humidityWarnings, rainWarning } from '@/lib/alerts';
import { loadHome, loadNet, loadOpeningsToday, loadWarnings, loadWeather } from '@/lib/data';
import { when } from '@/components/WarningBanners';
import { NET_LABEL } from '@/lib/net';
import { HistoryChart } from '@/components/HistoryChart';
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
    <section id={id} className="scroll-mt-4 rounded-[24px] glass p-3">
      <h2 className="mb-2 flex items-center gap-3 text-xl font-extrabold">
        <span className={`flex size-10 items-center justify-center rounded-2xl ${tone === 'warn' ? 'bg-warn-soft ring-1 ring-warn-strong' : 'bg-glass-hi'}`}>
          <Icon name={icon} size={24} />
        </span>
        {title}
        <span className={`rounded-full px-3 py-0.5 text-base ${tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-glass-2 text-dim'}`}>{count}</span>
      </h2>
      {children}
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="rounded-2xl bg-glass-2 p-3 font-bold text-dim">{text}</p>;

export default async function AlarmPage() {
  const [h, weather, openedToday, net] = await Promise.all([loadHome(), loadWeather(), loadOpeningsToday(), loadNet()]);
  const warning = rainWarning(weather, h.openings);
  // Lampor som är otillgängliga får en egen lista; övriga enheter ligger kvar under Svarar inte.
  const deadLights = h.silent.filter((x) => x.light && x.reason === 'offline');
  const otherSilent = h.silent.filter((x) => !(x.light && x.reason === 'offline'));
  const open = h.openings.filter((o) => o.open);
  const wet = h.rooms.filter((r) => r.humidity != null);
  const damp = humidityWarnings(h.rooms);
  const wx = await loadWarnings(weather);
  const wxCount = wx.vma.length + wx.smhi.length + wx.storms.length;

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

      {/* Vädervarningar (SMHI), VMA (Krisinformation) och kommande oväder – visas bara när något finns. */}
      {wxCount > 0 && <Section id="vader" icon="rain" title="Väder & VMA" count={wxCount} tone="warn">
        {(
          <ul className="flex flex-col gap-2">
            {wx.vma.map((v) => (
              <li key={v.id} className="flex flex-col gap-0.5 rounded-2xl bg-danger-strong px-3 py-2 text-white">
                <span className="font-extrabold">VMA: {v.headline}</span>
                {v.text && <span className="text-sm font-bold">{v.text}</span>}
                <span className="text-[13px] font-bold opacity-90">{v.area}{v.url && <> · <a href={v.url} target="_blank" rel="noopener noreferrer" className="underline">Läs mer</a></>}</span>
              </li>
            ))}
            {wx.smhi.map((w) => (
              <li key={w.id} className={`flex flex-col gap-0.5 rounded-2xl px-3 py-2 ${w.level === 'red' ? 'bg-danger-strong text-white' : w.level === 'orange' ? 'bg-[#FF8A3D] text-[#1A1205]' : 'bg-[#E8B400] text-[#1A1205]'}`}>
                <span className="font-extrabold">{w.level === 'red' ? 'Röd' : w.level === 'orange' ? 'Orange' : 'Gul'} varning: {w.event}</span>
                <span className="text-[13px] font-bold">{w.area}{w.start ? ` · ${when(w.start)}` : ''}{w.end ? `–${when(w.end)}` : ''}</span>
                {w.text && <span className="text-sm font-bold">{w.text}</span>}
              </li>
            ))}
            {wx.storms.map((s) => (
              <li key={s.kind} className="flex items-center justify-between gap-3 rounded-2xl bg-glass-2 px-3 py-2">
                <span className="font-extrabold">{s.label}</span>
                <span className="text-sm font-bold text-dim">från {when(s.at)} · prognos SMHI</span>
              </li>
            ))}
          </ul>
        )}
      </Section>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section id="batteri" icon="battery" title="Lågt batteri" count={h.lowBatteryList.length} tone={h.lowBatteryList.length ? 'warn' : 'ok'}>
          {h.lowBatteryList.length ? (
            <ul className="flex flex-col gap-2">
              {h.lowBatteryList.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-3 py-2">
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

        {/* Lampor som inte går att nå (otillgängliga i Homey, t.ex. strömbrytaren avslagen). */}
        <Section id="lampor" icon="bulb" title="Lampor som inte nås" count={deadLights.length} tone={deadLights.length ? 'warn' : 'ok'}>
          {deadLights.length ? (
            <ul className="flex flex-col gap-2">
              {deadLights.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-3 py-2">
                  <span className="min-w-0 grow">
                    <span className="block truncate font-extrabold">{s.name}</span>
                    <span className="block text-sm font-bold text-dim">{s.room || 'Inget rum'}</span>
                  </span>
                  <span className="text-right text-sm font-extrabold text-danger">Kan inte nås</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="Alla lampor går att nå." />
          )}
        </Section>

        <Section id="enheter" icon="wifi" title="Svarar inte" count={otherSilent.length} tone={otherSilent.length ? 'warn' : 'ok'}>
          {otherSilent.length ? (
            <ul className="flex flex-col gap-2">
              {otherSilent.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-3 py-2">
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
              <li key={o.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-3 py-2">
                <Icon name={o.kind === 'door' ? 'door' : 'window'} size={22} />
                <span className="min-w-0 grow">
                  <span className="block truncate font-extrabold">{o.name}</span>
                  <span className="block text-sm font-bold text-dim">
                    {o.room || 'Inget rum'} · öppnad {openedToday[o.id] ?? 0}× i dag
                  </span>
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
                <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-glass-2 px-3 py-2">
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

      {net && (
        <Section
          id="natverk"
          icon="wifi"
          title="Internet & nätverk"
          count={net.offline.length + net.updates.length + (net.state === 'down' ? 1 : 0)}
          tone={net.state === 'ok' && !net.offline.length && !net.updates.length ? 'ok' : 'warn'}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {[
              ['Status', NET_LABEL[net.state].replace('Internet ', ''), net.state === 'ok' ? 'text-ok' : 'text-warn'],
              ['Operatör', net.isp ?? '–', ''],
              ['Svarstid nu', net.latency == null ? '–' : `${Math.round(net.latency)} ms`, ''],
              ['Snitt / förlust 24 h', `${net.avgLatency == null ? '–' : Math.round(net.avgLatency)} ms · ${net.loss == null ? '–' : `${net.loss.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`}`, ''],
              ['Upptid 24 h', net.uptime == null ? '–' : `${net.uptime.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} %`, ''],
              ['Abonnemang', net.downMbit == null ? '–' : `${net.downMbit}/${net.upMbit} Mbit`, ''],
            ].map(([k, v, c]) => (
              <div key={k} className="flex flex-col rounded-2xl bg-glass-2 px-3 py-1.5">
                <span className="text-sm font-bold text-dim">{k}</span>
                <span className={`text-lg leading-tight font-extrabold ${c}`}>{v}</span>
              </div>
            ))}
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {net.devices.map((d) => {
              const up = d.status === 'online';
              const fw = d.firmware_status && d.firmware_status !== 'upToDate';
              return (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-2xl bg-glass-2 px-3 py-1.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-extrabold">{d.name}</span>
                    <span className="text-sm font-bold text-dim">{d.model}{d.is_console ? ' · router' : ''}</span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {fw && <span className="rounded-full bg-warn-soft px-3 py-1 font-extrabold text-warn">Uppdatering</span>}
                    <span className={`rounded-full px-3 py-1 font-extrabold ${up ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>{up ? 'Online' : 'Offline'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {net.latencySeries.length > 1 && (
            <details className="group mt-2 rounded-2xl bg-glass-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 font-extrabold">
                Svarstid senaste dygnet{net.clients != null ? ` · ${net.clients} anslutna klienter` : ''}
                <span className="text-dim transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="px-2 pb-2">
                <HistoryChart series={[{ id: 'lat', label: 'Svarstid', color: '#2BB5C4', points: net.latencySeries }]} unit=" ms" decimals={0} bars={false} longPeriod={false} fit={430} />
              </div>
            </details>
          )}
        </Section>
      )}
    </>
  );
}
