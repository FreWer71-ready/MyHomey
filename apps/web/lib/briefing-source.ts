import 'server-only';
import { briefingParts, sectionsOn, todayPlan, weatherPhrase } from './briefing.ts';
import { calendarConfigured, loadCalendarServer } from './calendar-source.ts';
import { dayInfo, dayOf } from './calendar-view.ts';
import { direction, groupRoad } from './commute.ts';
import { loadCommute, loadHome, loadLocate, loadWeather, PLACE } from './data.ts';
import { goalEta } from './goal.ts';
import { etaConfigured } from './route.ts';
import { journeyFor, loadTransit, transitConfigured, transitGoal } from './transit-source.ts';
import { isWeekend } from './trip.ts';
import { symbolInfo } from './weather.ts';

/**
 * Rapportens innehåll för hushållet (HOUSEHOLD), hämtat från samma källor som Hem: väder, nästa tåg och när man ska gå,
 * dagens kalender, hemresan efter sista mötet, bilresan och kvällens händelser. `weather` är väderfrasen till första
 * meningen, `parts` övriga meningar. Delar utan data hoppas över; `BRIEFING` väljer delar (se `sectionsOn`).
 * Bara läsning, ingenting sparas.
 */
export async function loadBriefing(now = Date.now(), opts: { anonymous?: boolean } = {}): Promise<{ name: string; weather: string; parts: string[] }> {
  const name = process.env.HOUSEHOLD ?? '';
  // anonymous (adressen för genvägar, utan inloggning): inga hushållsdata (Hue, Life360). Temperaturen tas då från SMHI
  // och bilresan räknas hemifrån.
  const [h, w, commute, locate] = await Promise.all([
    opts.anonymous ? null : loadHome().catch(() => null), loadWeather().catch(() => null), loadCommute().catch(() => null),
    opts.anonymous ? { members: [], items: [] } : loadLocate().catch(() => ({ members: [], items: [] })),
  ]);
  const weather = weatherPhrase(w ? symbolInfo(w.current.symbol).label : null, h?.outdoorTemp ?? (w && Number.isFinite(w.current.temp) ? w.current.temp : null));
  // Tåg: en arbetsdag för den som pendlar. Resplanen (när man ska gå) kräver föredragen väg (TRANSIT_VIA och TRANSIT_TRANSFER).
  const goal = transitConfigured() && commute?.trains && !isWeekend(now) && !dayInfo(dayOf(now), now).free ? transitGoal() : null;
  const viaPref = !!process.env.TRANSIT_VIA && !!process.env.TRANSIT_TRANSFER;
  const carGoal = etaConfigured() && !!process.env.DEFAULT_DESTINATION && !!commute && !commute.trains;
  const on = sectionsOn(process.env.BRIEFING, { vader: !!weather, tag: !!goal && viaPref, pendlar: !!goal, bil: carGoal });

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
    parts: briefingParts({ train, first: plan.first, lastEnd: plan.lastEnd, homePlan, car, evening: plan.evening }, on),
  };
}
