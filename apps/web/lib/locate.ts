// "Var är": personer från Life360 och prylar från Apple Hitta (båda via Homey-appar). Ren tolkning; testas i locate.test.ts.

export type LocDevice = { id: string; name: string; driver_id: string | null };
export type LocCap = { device_id: string; capability_id: string; value_num: number | null; value_bool: boolean | null; value_text: string | null; last_updated: string | null };

export type Member = {
  id: string; name: string; first: string; home: boolean; place: string | null; address: string | null;
  driving: boolean; speed: number | null; stay: string | null; battery: number | null; charging: boolean;
  lat: number | null; lon: number | null; updated: string | null;
};
export type Item = {
  id: string; name: string; home: boolean; moving: boolean; km: number | null; battery: number | null;
  lowBattery: boolean; charging: boolean; lat: number | null; lon: number | null; updated: string | null; canSound: boolean;
};

/** "Apple Watch Series 11 - Apple Watch för Fredrik" → "Apple Watch för Fredrik". */
export const shortName = (n: string) => (n.includes(' - ') ? n.split(' - ').slice(1).join(' - ') : n).replace(/’/g, "'").trim();

export const isLife360 = (d: LocDevice) => /life360/i.test(d.driver_id ?? '');
export const isFindMy = (d: LocDevice) => /findmy/i.test(d.driver_id ?? '');

export function buildLocate(devices: LocDevice[], caps: LocCap[]): { members: Member[]; items: Item[] } {
  const by = new Map<string, Map<string, LocCap>>();
  for (const c of caps) {
    if (!by.has(c.device_id)) by.set(c.device_id, new Map());
    by.get(c.device_id)!.set(c.capability_id, c);
  }
  const get = (id: string, cap: string) => by.get(id)?.get(cap);
  const num = (id: string, cap: string) => get(id, cap)?.value_num ?? null;
  const bool = (id: string, cap: string) => get(id, cap)?.value_bool === true;
  const text = (id: string, cap: string) => get(id, cap)?.value_text?.trim() || null;
  const latest = (id: string) => [...(by.get(id)?.values() ?? [])].map((c) => c.last_updated).filter(Boolean).sort().at(-1) ?? null;

  const members = devices.filter(isLife360).map((d): Member => {
    const place = text(d.id, 'life360_place');
    return {
      id: d.id, name: d.name.trim(), first: d.name.trim().split(/\s+/)[0],
      home: /^hem(ma)?$/i.test(place ?? '') || (place == null && bool(d.id, 'alarm_presence')),
      place, address: text(d.id, 'life360_address'),
      driving: bool(d.id, 'life360_driving'), speed: num(d.id, 'life360_speed'), stay: text(d.id, 'life360_stay'),
      battery: num(d.id, 'measure_battery'), charging: bool(d.id, 'life360_charging'),
      lat: num(d.id, 'life360_latitude'), lon: num(d.id, 'life360_longitude'), updated: latest(d.id),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  const items = devices.filter(isFindMy).map((d): Item => {
    const battery = num(d.id, 'measure_battery') ?? num(d.id, 'measure_percent_battery');
    return {
      id: d.id, name: shortName(d.name), home: bool(d.id, 'alarm_is_home'), moving: bool(d.id, 'alarm_is_moving'),
      km: num(d.id, 'measure_distance'), battery, lowBattery: bool(d.id, 'alarm_battery') || (battery != null && battery <= 15),
      charging: bool(d.id, 'alarm_is_charging'), lat: num(d.id, 'measure_latitude'), lon: num(d.id, 'measure_longitude'),
      updated: latest(d.id), canSound: !!get(d.id, 'send_sound'),
    };
  }).sort((a, b) => Number(b.lowBattery) - Number(a.lowBattery) || Number(a.home) - Number(b.home) || a.name.localeCompare(b.name, 'sv'));

  return { members, items };
}

/** Kort text om var någon är när den inte är hemma: plats, "kör 70 km/h" eller gatan. */
export function whereText(m: Member): string | null {
  if (m.home) return null;
  if (m.driving) return `kör${m.speed ? ` ${Math.round(m.speed)} km/h` : ''}`;
  if (m.place) return m.place;
  return m.address?.split(',')[0]?.trim() || null;
}
