// Räknar fram hemöversikten ur rådata från Supabase. Ren logik, inga anrop.

export type Zone = { id: string; name: string; parent_id: string | null };
export type Device = { id: string; name: string; zone_id: string | null; class: string | null; available: boolean };
export type Cap = {
  device_id: string;
  capability_id: string;
  value_num: number | null;
  value_bool: boolean | null;
  last_updated?: string;
};

export type Mood = { id: string; name: string; zone_id: string | null; favorite?: boolean };

export type RoomIcon = 'sofa' | 'bed' | 'door' | 'drop' | 'wc' | 'pot' | 'box';
export type Light = { id: string; name: string; on: boolean; dim: number | null };
export type Room = {
  id: string;
  name: string;
  icon: RoomIcon;
  temp: number | null;
  /** Rummet har temperatursensorer men inga värden från de senaste TEMP_MAX_DAYS dagarna. */
  tempStale: boolean;
  humidity: number | null;
  lights: Light[];
  lightsOn: number;
  moods: { id: string; name: string }[];
  deviceCount: number;
};
export type BatteryItem = { id: string; name: string; room: string; level: number | null };
export type Opening = { id: string; name: string; room: string; open: boolean; kind: 'door' | 'window' };
export type Silent = { id: string; name: string; room: string; lastSeen: string | null; reason: 'offline' | 'stale' };

export type Home = {
  outdoorTemp: number | null;
  lightsOn: number;
  lightsTotal: number;
  powerW: number;
  powerMeters: number;
  doorsOpen: number;
  doorsTotal: number;
  motion: number;
  lowBattery: number;
  lowBatteryList: BatteryItem[];
  openings: Opening[];
  silent: Silent[];
  online: number;
  deviceTotal: number;
  rooms: Room[];
  /** Zonen överst i Homey (hela hemmet) och dess moods. */
  rootZoneId: string | null;
  homeMoods: { id: string; name: string }[];
  /** Favoritmarkerade moods (Homey-appen), med rumsnamn. */
  favoriteMoods: { id: string; name: string; room: string | null }[];
};

/** Capabilities som vyerna behöver. */
export const CAPS = [
  'measure_temperature', 'measure_humidity', 'onoff', 'dim', 'measure_power',
  'alarm_contact', 'alarm_motion', 'measure_battery', 'alarm_battery', 'alarm_connectivity',
];

/** Luftfuktighet visas bara i våtrum. */
const HUMIDITY_ROOMS = /bad|toa|wc|dusch|tvätt/i;
const LOW_BATTERY = 20;
/** Sensorer som inte rapporterat på så här länge räknas som att de inte svarar. */
export const STALE_HOURS = 48;
/** Temperaturer äldre än så här används inte (sensorn räknas som ej nåbar). */
export const TEMP_MAX_DAYS = 5;
/** Bara kontaktsensorer med fönster i namnet räknas som fönster (regnvarning). */
const WINDOW = /fönster|window/i;
// Homey uppdaterar tidsstämpeln bara när värdet ändras, så bara mätvärden som
// normalt ändras flera gånger per dygn duger för att upptäcka tysta sensorer.
const REPORTING = ['measure_temperature', 'measure_humidity'];

const ICONS: [RegExp, RoomIcon][] = [
  [/vardag|soffa|tv-rum/i, 'sofa'],
  [/kök/i, 'pot'],
  [/bad|dusch/i, 'drop'],
  [/toa|wc/i, 'wc'],
  [/hall|entré|farstu/i, 'door'],
  [/förråd|garage|vind|källare/i, 'box'],
];
export const iconFor = (name: string): RoomIcon => ICONS.find(([re]) => re.test(name))?.[1] ?? 'bed';

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function buildHome(zones: Zone[], devices: Device[], caps: Cap[], moods: Mood[] = [], now = Date.now()): Home {
  const byDevice = new Map<string, Map<string, Cap>>();
  for (const c of caps) {
    if (!byDevice.has(c.device_id)) byDevice.set(c.device_id, new Map());
    byDevice.get(c.device_id)!.set(c.capability_id, c);
  }
  const cap = (d: Device, id: string) => byDevice.get(d.id)?.get(id);
  const nums = (ds: Device[], id: string) =>
    ds.map((d) => cap(d, id)?.value_num).filter((v): v is number => typeof v === 'number');
  const fresh = (c: Cap | undefined) => !c?.last_updated || now - Date.parse(c.last_updated) <= TEMP_MAX_DAYS * 86400_000;
  /** Temperaturer, utan värden äldre än TEMP_MAX_DAYS. */
  const temps = (ds: Device[]) => nums(ds.filter((d) => fresh(cap(d, 'measure_temperature'))), 'measure_temperature');
  const hasTemp = (ds: Device[]) => ds.some((d) => cap(d, 'measure_temperature')?.value_num != null);

  const active = devices.filter((d) => d.available);
  const lightOf = (d: Device): Light | null => {
    const onoff = cap(d, 'onoff');
    if (d.class !== 'light' || !onoff) return null;
    const dim = cap(d, 'dim')?.value_num;
    return { id: d.id, name: d.name.trim(), on: onoff.value_bool === true, dim: dim == null ? null : Math.round(dim * 100) };
  };
  const allLights = active.map(lightOf).filter((l): l is Light => l !== null);

  const rooms: Room[] = zones
    .filter((z) => z.parent_id !== null)
    .map((z) => {
      const ds = active.filter((d) => d.zone_id === z.id);
      const name = z.name.trim();
      const lights = ds.map(lightOf).filter((l): l is Light => l !== null)
        .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
      return {
        id: z.id,
        name,
        icon: iconFor(name),
        // Bara riktiga sensorer: uttag och lampor mäter sin egen värme.
        temp: avg(temps(ds.filter((d) => d.class === 'sensor'))),
        tempStale: hasTemp(ds.filter((d) => d.class === 'sensor')) && !temps(ds.filter((d) => d.class === 'sensor')).length,
        humidity: HUMIDITY_ROOMS.test(name) ? avg(nums(ds, 'measure_humidity')) : null,
        lights,
        lightsOn: lights.filter((l) => l.on).length,
        moods: moods
          .filter((m) => m.zone_id === z.id)
          .map((m) => ({ id: m.id, name: m.name.trim() }))
          .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
        deviceCount: ds.length,
      };
    })
    .filter((r) => r.deviceCount > 0)
    .sort((a, b) => b.deviceCount - a.deviceCount || a.name.localeCompare(b.name, 'sv'));

  const contacts = active.map((d) => cap(d, 'alarm_contact')).filter(Boolean) as Cap[];
  const power = nums(active, 'measure_power');

  const zoneName = new Map(zones.map((z) => [z.id, z.name.trim()]));
  const roomOf = (d: Device) => zoneName.get(d.zone_id ?? '') ?? '';
  const lowBatteryList: BatteryItem[] = active.flatMap((d) => {
    const level = cap(d, 'measure_battery')?.value_num ?? null;
    const low = (level != null && level < LOW_BATTERY) || cap(d, 'alarm_battery')?.value_bool === true;
    return low ? [{ id: d.id, name: d.name.trim(), room: roomOf(d), level }] : [];
  }).sort((a, b) => (a.level ?? -1) - (b.level ?? -1));
  const openings: Opening[] = active.flatMap((d) => {
    const c = cap(d, 'alarm_contact');
    return c ? [{ id: d.id, name: d.name.trim(), room: roomOf(d), open: c.value_bool === true, kind: WINDOW.test(d.name) ? 'window' as const : 'door' as const }] : [];
  });
  // Inte svarar: otillgänglig i Homey, eller sensor som inte rapporterat på STALE_HOURS.
  const silent: Silent[] = devices.flatMap((d): Silent[] => {
    const base = { id: d.id, name: d.name.trim(), room: roomOf(d) };
    if (!d.available || cap(d, 'alarm_connectivity')?.value_bool === true) return [{ ...base, lastSeen: null, reason: 'offline' as const }];
    const seen = REPORTING.map((id) => cap(d, id)?.last_updated).filter((x): x is string => !!x).sort().at(-1);
    if (seen && now - Date.parse(seen) > STALE_HOURS * 3600_000) return [{ ...base, lastSeen: seen, reason: 'stale' as const }];
    return [];
  }).sort((a, b) => (a.lastSeen ?? '').localeCompare(b.lastSeen ?? ''));

  const root = zones.find((z) => z.parent_id === null) ?? null;
  const homeMoods = moods
    .filter((m) => root && m.zone_id === root.id)
    .map((m) => ({ id: m.id, name: m.name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  const favoriteMoods = moods
    .filter((m) => m.favorite)
    .map((m) => ({ id: m.id, name: m.name.trim(), room: m.zone_id && m.zone_id !== root?.id ? (zoneName.get(m.zone_id) ?? null) : null }))
    .sort((a, b) => (a.room ?? '').localeCompare(b.room ?? '', 'sv') || a.name.localeCompare(b.name, 'sv'));

  return {
    // Väderstationer (t.ex. Trafikverket) har klassen service.
    outdoorTemp: avg(temps(active.filter((d) => d.class === 'service'))),
    lightsOn: allLights.filter((l) => l.on).length,
    lightsTotal: allLights.length,
    powerW: Math.round(power.reduce((a, b) => a + b, 0) * 10) / 10,
    powerMeters: power.length,
    doorsOpen: contacts.filter((c) => c.value_bool === true).length,
    doorsTotal: contacts.length,
    motion: active.filter((d) => cap(d, 'alarm_motion')?.value_bool === true).length,
    lowBattery: lowBatteryList.length,
    lowBatteryList,
    openings,
    silent,
    online: active.length,
    deviceTotal: devices.length,
    rooms,
    rootZoneId: root?.id ?? null,
    homeMoods,
    favoriteMoods,
  };
}
