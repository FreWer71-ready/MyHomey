import type { Action } from '@/components/ActionTiles';

type Scene = 'varmt' | 'mys' | 'slack' | 'stad';
// Namnen ska skilja sig tydligt: Varmt ljus (75 %, varmvitt), Mys (dämpat, solnedgångsfärger), Städ kallvitt (100 %, kallaste vita ljuset).
const LABEL: Record<Scene, string> = { varmt: 'Varmt ljus 75 %', mys: 'Mys i hela huset', slack: 'Släck alla lampor', stad: 'Städ kallvitt' };

/** Hela huset med ett tryck: scenen i alla rum som har lampor (Varmt ljus = 75 % varmvitt, Städ = 100 % kallvitt). Tom lista om inget rum har lampor. */
export function houseActions(rooms: { id: string; lights: unknown[] }[], scenes: Scene[] = ['mys', 'slack']): Action[] {
  const zones = rooms.filter((r) => r.lights.length > 0).map((r) => r.id);
  return zones.length ? scenes.map((s) => ({ id: `house-${s}`, name: LABEL[s], kind: 'room' as const, zones, scene: s })) : [];
}
