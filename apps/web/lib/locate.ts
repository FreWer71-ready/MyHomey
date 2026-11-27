// "Var är": personer från Life360 och prylar från Apple Hitta (båda via Homey-appar). Ren tolkning; testas i locate.test.ts.

import { km } from './trip.ts';

export type LocDevice = { id: string; name: string; driver_id: string | null };
export type LocCap = { device_id: string; capability_id: string; value_num: number | null; value_bool: boolean | null; value_text: string | null; last_updated: string | null };

export type Member = {
  id: string; name: string; first: string; home: boolean; place: string | null; address: string | null;
  driving: boolean; speed: number | null; stay: string | null; battery: number | null; charging: boolean;
  lat: number | null; lon: number | null; updated: string | null;
  /** Senaste ändring av själva positionen (lat/lon), inte t.ex. batteri. */ posUpdated: string | null;
};
export type Item = {
  id: string; name: string; home: boolean; moving: boolean; km: number | null; battery: number | null;
  lowBattery: boolean; charging: boolean; lat: number | null; lon: number | null; updated: string | null; canSound: boolean;
  /** Senaste ändring av själva positionen (lat/lon). */ posUpdated: string | null;
};

/** "Apple Watch Series 11 - Apple Watch för Fredrik" → "Apple Watch för Fredrik". */
export const shortName = (n: string) => (n.includes(' - ') ? n.split(' - ').slice(1).join(' - ') : n).replace(/’/g, "'").trim();

export const isLife360 = (d: LocDevice) => /life360/i.test(d.driver_id ?? '');
export const isFindMy = (d: LocDevice) => /findmy/i.test(d.driver_id ?? '');

/**
 * `homeAt`: dashboardens hem. Med position avgör avståndet (≤ 300 m) om personen är hemma – Life360-platsen "Hem"
 * kan vara en annan persons hem (t.ex. särbo). Utan position: platsnamnet eller närvaron.
 */
export function buildLocate(devices: LocDevice[], caps: LocCap[], homeAt?: { lat: number; lon: number }): { members: Member[]; items: Item[] } {
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
  const posAt = (id: string, la: string, lo: string) => [get(id, la)?.last_updated, get(id, lo)?.last_updated].filter(Boolean).sort().at(-1) ?? null;

  const members = devices.filter(isLife360).map((d): Member => {
    const place = text(d.id, 'life360_place');
    return {
      id: d.id, name: d.name.trim(), first: d.name.trim().split(/\s+/)[0],
      home: homeAt && num(d.id, 'life360_latitude') != null && num(d.id, 'life360_longitude') != null
        ? km(homeAt, { lat: num(d.id, 'life360_latitude')!, lon: num(d.id, 'life360_longitude')! }) <= 0.3
        : /^hem(ma)?$/i.test(place ?? '') || (place == null && bool(d.id, 'alarm_presence')),
      place, address: text(d.id, 'life360_address'),
      driving: bool(d.id, 'life360_driving'), speed: num(d.id, 'life360_speed'), stay: text(d.id, 'life360_stay'),
      battery: num(d.id, 'measure_battery'), charging: bool(d.id, 'life360_charging'),
      lat: num(d.id, 'life360_latitude'), lon: num(d.id, 'life360_longitude'), updated: latest(d.id),
      posUpdated: posAt(d.id, 'life360_latitude', 'life360_longitude'),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'sv'));

  const items = devices.filter(isFindMy).map((d): Item => {
    const battery = num(d.id, 'measure_battery') ?? num(d.id, 'measure_percent_battery');
    return {
      id: d.id, name: shortName(d.name), home: bool(d.id, 'alarm_is_home'), moving: bool(d.id, 'alarm_is_moving'),
      km: num(d.id, 'measure_distance'), battery, lowBattery: bool(d.id, 'alarm_battery') || (battery != null && battery <= 15),
      charging: bool(d.id, 'alarm_is_charging'), lat: num(d.id, 'measure_latitude'), lon: num(d.id, 'measure_longitude'),
      updated: latest(d.id), canSound: !!get(d.id, 'send_sound'),
      posUpdated: posAt(d.id, 'measure_latitude', 'measure_longitude'),
    };
  }).sort((a, b) => Number(b.lowBattery) - Number(a.lowBattery) || Number(a.home) - Number(b.home) || a.name.localeCompare(b.name, 'sv'));

  return { members, items };
}

/** Kort text om var någon är när den inte är hemma: plats, "kör 70 km/h" eller "gata, ort". */
export function whereText(m: Member): string | null {
  if (m.home) return null;
  if (m.driving) return `kör${m.speed ? ` ${Math.round(m.speed)} km/h` : ''}`;
  if (m.place) return m.place;
  return streetTown(m.address);
}

/** "Eskilstuna kommun" → "Eskilstuna", "Stockholms stad" → "Stockholm" (genitiv-s bort efter konsonant). */
function townName(t: string): string {
  const m = t.trim().match(/^(.+?)\s+(kommun|stad|municipality)$/i);
  if (!m) return t.trim();
  return /[^aeiouyåäös]s$/i.test(m[1]) ? m[1].slice(0, -1) : m[1];
}

/** "Fredsborgsgatan 24, 117 43 Stockholm, Sverige" → "Fredsborgsgatan 24, Stockholm" (gata, ort). */
export function streetTown(address: string | null): string | null {
  const parts = (address ?? '').split(',').map((x) => x.trim()).filter((x) => x && !/^(sverige|sweden)$/i.test(x) && !/\slän$/i.test(x));
  if (!parts.length) return null;
  const town = parts.length > 1 ? townName(parts.at(-1)!.replace(/^\d{3}\s?\d{2}\s*/, '')) : '';
  return town && town !== parts[0] ? `${parts[0]}, ${town}` : parts[0];
}
