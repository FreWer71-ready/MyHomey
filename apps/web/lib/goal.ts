import 'server-only';
import { geocode, PLACE } from './data';
import type { Member } from './locate';
import { routeEta, type Eta } from './route';
import { km, type LatLon } from './trip';

// Resor med TomTom: var dashboardens person befinner sig och standardmålet (t.ex. jobbet).

/** Dashboardens person (HOUSEHOLD = förnamnet i Life360). Startpunkt: hennes position om hon är borta, annars hemmet. */
export function origin(members: Member[]): { pos: LatLon | null; away: boolean; from: LatLon } {
  const me = members.find((m) => m.first.toLowerCase() === process.env.HOUSEHOLD?.toLowerCase());
  const pos = me?.lat != null && me.lon != null ? { lat: me.lat, lon: me.lon } : null;
  const away = !!pos && km(PLACE, pos) > 1;
  return { pos, away, from: away ? pos! : PLACE };
}

/** Standardmålet: DEFAULT_DESTINATION (adress eller "lat,lon") med rubrik DEFAULT_DESTINATION_LABEL. */
export async function defaultGoal(): Promise<{ label: string; address: string; at: LatLon } | null> {
  const address = process.env.DEFAULT_DESTINATION;
  if (!address) return null;
  const c = address.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  const at = c ? { lat: Number(c[1]), lon: Number(c[2]) } : await geocode(address);
  return at ? { label: process.env.DEFAULT_DESTINATION_LABEL || 'Jobbet', address, at } : null;
}

export type GoalEta = { label: string; address: string; eta: Eta; fromHere: boolean; km: number };

/** Restid nu ("åk nu", aktuell trafik) till standardmålet, eller null om det saknas eller personen redan är där. */
export async function goalEta(members: Member[], now = Date.now()): Promise<GoalEta | null> {
  const goal = await defaultGoal();
  if (!goal) return null;
  const o = origin(members);
  if (o.pos && km(o.pos, goal.at) <= 1) return null;
  const eta = await routeEta(o.from, goal.at, null, now);
  return eta ? { label: goal.label, address: goal.address, eta, fromHere: o.away, km: km(o.from, goal.at) } : null;
}
