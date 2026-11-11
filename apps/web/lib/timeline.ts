// Tidslinje för lampor: när var varje lampa tänd under perioden. Ren logik.
import type { Device, Zone } from './home';

export type OnOffRow = { device_id: string; ts: string; value: number };
export type Segment = { left: number; width: number }; // procent av perioden
export type LampLine = { id: string; name: string; segments: Segment[]; onMinutes: number; onNow: boolean };
export type RoomLines = { name: string; lamps: LampLine[] };

export function buildTimeline(rows: OnOffRow[], devices: Device[], zones: Zone[], since: number, now: number): RoomLines[] {
  const span = now - since;
  const zoneName = new Map(zones.map((z) => [z.id, z.name.trim()]));
  const byDevice = new Map<string, OnOffRow[]>();
  for (const r of rows) {
    if (!byDevice.has(r.device_id)) byDevice.set(r.device_id, []);
    byDevice.get(r.device_id)!.push(r);
  }

  const rooms = new Map<string, LampLine[]>();
  for (const d of devices) {
    if (d.class !== 'light' || !d.available) continue;
    const rs = (byDevice.get(d.id) ?? []).sort((a, b) => a.ts.localeCompare(b.ts));
    const segments: Segment[] = [];
    let onMs = 0;
    let onFrom: number | null = null;
    const close = (to: number) => {
      if (onFrom == null) return;
      const a = Math.max(onFrom, since);
      const b = Math.min(to, now);
      if (b > a) {
        segments.push({ left: ((a - since) / span) * 100, width: ((b - a) / span) * 100 });
        onMs += b - a;
      }
      onFrom = null;
    };
    for (const r of rs) {
      const t = Date.parse(r.ts);
      if (r.value >= 0.5 && onFrom == null) onFrom = t;
      else if (r.value < 0.5) close(t);
    }
    const onNow = onFrom != null;
    close(now);
    const room = zoneName.get(d.zone_id ?? '') ?? 'Övrigt';
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room)!.push({ id: d.id, name: d.name.trim(), segments, onMinutes: Math.round(onMs / 60000), onNow });
  }

  return [...rooms.entries()]
    .map(([name, lamps]) => ({ name, lamps: lamps.sort((a, b) => a.name.localeCompare(b.name, 'sv')) }))
    .sort((a, b) => b.lamps.length - a.lamps.length || a.name.localeCompare(b.name, 'sv'));
}

export const fmtDuration = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
