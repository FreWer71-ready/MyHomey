import type { Action } from '@/components/ActionTiles';

type Scene = 'ljust' | 'mys' | 'slack' | 'stad';
const LABEL: Record<Scene, string> = { ljust: 'Ljust i hela huset', mys: 'Mys i hela huset', slack: 'Släck alla lampor', stad: 'Städ i hela huset' };

/** Hela huset med ett tryck: scenen i alla rum som har lampor (Städ = 100 %, kallvitt). Tom lista om inget rum har lampor. */
export function houseActions(rooms: { id: string; lights: unknown[] }[], scenes: Scene[] = ['mys', 'slack']): Action[] {
  const zones = rooms.filter((r) => r.lights.length > 0).map((r) => r.id);
  return zones.length ? scenes.map((s) => ({ id: `house-${s}`, name: LABEL[s], kind: 'room' as const, zones, scene: s })) : [];
}
