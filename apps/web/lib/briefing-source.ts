import 'server-only';
import { humidityWarnings } from './alerts.ts';
import { batteryLabel, briefingParts, parseClosings, sectionsOn, todayPlan, weatherPhrase, type HomeInput } from './briefing.ts';
import { calendarConfigured, loadCalendarServer } from './calendar-source.ts';
import { dayInfo, dayOf } from './calendar-view.ts';
import { direction, groupRoad } from './commute.ts';
import { loadCommute, loadHome, loadLocate, loadNet, loadWeather, PLACE } from './data.ts';
import { goalEta } from './goal.ts';
import { buildHome, CAPS, type Cap, type Device, type Zone } from './home.ts';
import { buildLocate, type LocCap } from './locate.ts';
import { summarizeNet, type NetDevice, type NetIsp, type NetStatusRow } from './net.ts';
import { etaConfigured } from './route.ts';
import { createClient } from './supabase/server.ts';
import { journeyFor, loadTransit, transitConfigured, transitGoal } from './transit-source.ts';
import { isWeekend } from './trip.ts';
import { symbolInfo } from './weather.ts';

/**
 * Hemmets data utan inloggning: databasfunktionen `briefing_rows` (migrationen briefing_token) ger det hushåll nyckeln
 * hör till samma rader som hemsidans läsningar, och de byggs med samma funktioner. Null om nyckeln inte finns eller något går fel.
 */
async function homeByToken(token: string) {
  const sb = await createClient();
  const { data, error } = await sb.rpc('briefing_rows', { p_token: token, p_caps: CAPS });
  if (error || !data) return null;
  const r = data as { zones: Zone[]; devices: Device[]; caps: Cap[]; net_status: NetStatusRow | null; net_isp: NetIsp[]; net_devices: NetDevice[];
    shared: (LocCap & { name: string; driver_id: string })[]; items: { id: string; name: string; driver_id: string }[]; item_caps: LocCap[] };
  const lifeDevices = [...new Map(r.shared.map((x) => [x.device_id, { id: x.device_id, name: x.name, driver_id: x.driver_id }])).values()];
  return {
    h: buildHome(r.zones, r.devices, r.caps, [], Date.now()),
    net: summarizeNet(r.net_status, r.net_isp, r.net_devices),
    locate: buildLocate([...lifeDevices, ...r.items], [...r.shared, ...r.item_caps], PLACE),
  };
}

/**
 * Rapportens innehåll för hushållet (HOUSEHOLD), hämtat från samma källor som Hem: väder, nästa tåg och när man ska gå,
 * dagens kalender, hemresan efter sista mötet, bilresan och kvällens händelser. `weather` är väderfrasen till första
 * meningen, `parts` övriga meningar. Delar utan data hoppas över; `BRIEFING` väljer delar (se `sectionsOn`).
 * Bara läsning, ingenting sparas.
 */
export async function loadBriefing(now = Date.now(), opts: { anonymous?: boolean; token?: string } = {}): Promise<{ name: string; weather: string; parts: string[] }> {
  const name = process.env.HOUSEHOLD ?? '';
  // Med inloggning (knappen i appen): hushållets egna läsningar. Utan (adressen för genvägar): hemmets data via nyckeln
  // (homeByToken), annars inga hushållsdata; bilresan räknas då hemifrån.
  const session = !opts.anonymous;
  const [hSes, w, commute, locSes, netSes, tok] = await Promise.all([
    session ? loadHome().catch(() => null) : null, loadWeather().catch(() => null), loadCommute().catch(() => null),
    session ? loadLocate().catch(() => ({ members: [], items: [] })) : null, session ? loadNet().catch(() => null) : null,
    !session && opts.token ? homeByToken(opts.token).catch(() => null) : null,
  ]);
  const h = hSes ?? tok?.h ?? null;
  const locate = locSes ?? tok?.locate ?? { members: [], items: [] };
  const net = session ? netSes : tok?.net ?? null;
  const weather = weatherPhrase(w ? symbolInfo(w.current.symbol).label : null, h?.outdoorTemp ?? (w && Number.isFinite(w.current.temp) ? w.current.temp : null));
  const home = h ? homeInput(name, h, locate.members, net) : null;
  // Tåg: en arbetsdag för den som pendlar. Resplanen (när man ska gå) kräver föredragen väg (TRANSIT_VIA och TRANSIT_TRANSFER).
  const goal = transitConfigured() && commute?.trains && !isWeekend(now) && !dayInfo(dayOf(now), now).free ? transitGoal() : null;
  const viaPref = !!process.env.TRANSIT_VIA && !!process.env.TRANSIT_TRANSFER;
  const carGoal = etaConfigured() && !!process.env.DEFAULT_DESTINATION && !!commute && !commute.trains;
  const on = sectionsOn(process.env.BRIEFING, { vader: !!weather, tag: !!goal && viaPref, pendlar: !!goal, bil: carGoal, hemma: !!home });

  let train: { dep: number; delay: number; leave: number } | null = null;
  if (on.has('tag') && goal && viaPref && commute) {
    const dir = direction(now);
    const next = commute[dir].find((t) => !t.canceled && (t.est ?? t.dep) > now);
    const j = next ? await journeyFor(next, dir === 'out', PLACE).catch(() => null) : null;
    // Att "gå" i det förflutna vore missvisande: då hoppas meningen över.
    if (next && j && j.leave >= now) train = { dep: next.dep, delay: next.delay, leave: j.leave };
  }

  let car: { home: boolean; label: string; minutes: number; trafficMin: number; warnings: number } | null = null;
  if (on.has('bil') && carGoal && commute) {
    const g = await goalEta(locate.members, now).catch(() => null);
    if (g && !g.atGoal) car = { home: !!g.home, label: g.label, minutes: g.eta.minutes, trafficMin: g.eta.trafficMin, warnings: groupRoad(commute.road).length };
  }

  let plan = todayPlan([], now);
  if ((on.has('forsta') || on.has('hemresa') || on.has('kvall')) && calendarConfigured()) {
    const day = (await loadCalendarServer().catch(() => null))?.days.find((d) => d.date === dayOf(now));
    if (day) plan = todayPlan(day.timed, now);
  }

  // Hemresan efter sista mötet: från jobbet när mötet slutat. Sista tåget i planen är tåget hem (SL-benen före är tunnelbana/pendel).
  let homePlan: { trainDep: number | null; home: number } | null = null;
  if (on.has('hemresa') && plan.lastEnd != null && goal) {
    const trip = (await loadTransit(goal.at, PLACE, plan.lastEnd, 1, false, true))[0];
    if (trip) homePlan = { trainDep: [...trip.legs].reverse().find((l) => l.kind === 'train')?.dep ?? null, home: trip.arr };
  }

  return {
    name, weather: on.has('vader') ? weather : '',
    parts: briefingParts({ train, first: plan.first, lastEnd: plan.lastEnd, homePlan, car, evening: plan.evening, home, now, closings: parseClosings(process.env.BRIEFING_AVSLUT) }, on),
  };
}

type HomeData = NonNullable<Awaited<ReturnType<typeof homeByToken>>>['h'];
/** Hemmet för rapporten ur samma data som Hem: lampor, snittemperatur, vilka som är hemma (Homey-närvaro och Life360), internet, fukt och lågt batteri. */
function homeInput(me: string, h: HomeData, members: { first: string; home: boolean }[], net: { state: HomeInput['internet'] } | null): HomeInput {
  const first = (n: string) => n.split(/\s+/)[0];
  const cap = (n: string) => `${n.charAt(0).toUpperCase()}${n.slice(1)}`;
  const present = new Map<string, boolean>();
  // Life360 går före Homeys närvaroappar (som på Hem).
  for (const p of h.people) { const m = members.find((x) => x.first.toLowerCase() === first(p.name).toLowerCase()); present.set(cap(first(p.name)), m ? m.home : p.present); }
  for (const m of members) if (![...present.keys()].some((n) => n.toLowerCase() === m.first.toLowerCase())) present.set(cap(m.first), m.home);
  const people = [...present].map(([n, p]) => ({ name: n, present: p }));
  const temps = h.rooms.filter((r) => r.temp != null).map((r) => r.temp!);
  return {
    me, lightsOn: h.lightsOn, lightsTotal: h.lightsTotal,
    tempAvg: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
    people, internet: net?.state ?? null,
    humidity: { measured: h.rooms.some((r) => r.humidity != null), damp: humidityWarnings(h.rooms).map((r) => r.name) },
    batteries: h.batteryTotal > 0 ? h.lowBatteryList.map((b) => batteryLabel(b.name, me, people.map((p) => p.name).filter((n) => n.toLowerCase() !== me.toLowerCase()))) : null,
  };
}
