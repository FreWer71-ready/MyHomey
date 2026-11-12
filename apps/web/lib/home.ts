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
export type Light = {
  id: string; name: string; on: boolean;
  /** Ljusstyrka 0–100 %, null om lampan saknar dimmer. */
  dim: number | null;
  /** Vad lampan klarar: dimmer, färgtemperatur (vit), färg. */
  can: { dim: boolean; temp: boolean; color: boolean };
  /** light_temperature 0 = kallt … 1 = varmt; hue/sat 0–1. */
  temp: number | null; hue: number | null; sat: number | null;
};
export type Room = {
  id: string;
  name: string;
  icon: RoomIcon;
  temp: number | null;
  /** Temperaturtrend senaste timmen. */
  tempTrend: Trend;
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

/** Väderstation (Trafikverket): vind i m/s, riktning som kompasstext, vägytans temperatur. */
export type Trend = 'up' | 'down' | null;
/** Ändring per timme som räknas som trend (inne reagerar långsammare än ute). */
export const TREND_INDOOR = 0.2;
export const TREND_OUTDOOR = 0.5;

export type Station = { wind: number | null; gust: number | null; dir: string | null; road: number | null };

export type Home = {
  outdoorTemp: number | null;
  /** Personer från närvaroappar i Homey (t.ex. Smart Presence, capability presence). */
  /** since = när närvaron senast ändrades (för den som är borta: senast sedd). */
  people: { id: string; name: string; present: boolean; since: string | null }[];
  outdoorTrend: Trend;
  /** Det finns en väderstation men den har inte rapporterat på WEATHER_MAX_HOURS. */
  outdoorStale: boolean;
  station: Station | null;
  lightsOn: number;
  lightsTotal: number;
  powerW: number;
  powerMeters: number;
  /** Enheter där effekten är Homeys uppskattning (ingen egen mätare). */
  powerEstimated: number;
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
  'measure_wind_strength', 'measure_gust_strength', 'measure_wind_angle', 'measure_temperature.surface',
  'light_temperature', 'light_hue', 'light_saturation',
  'presence',
  // Homey Energys uppskattning för enheter utan egen mätare (skickas av Dashboard-skriptet).
  'measure_power.homey',
];

const COMPASS = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
/** Vindriktning i grader (varifrån det blåser) → kompasstext. */
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

/** Luftfuktighet visas bara i våtrum. */
const HUMIDITY_ROOMS = /bad|toa|wc|dusch|tvätt/i;
const LOW_BATTERY = 20;
/** Sensorer som inte rapporterat på så här länge räknas som att de inte svarar. */
export const STALE_HOURS = 48;
/** Temperaturer äldre än så här används inte (sensorn räknas som ej nåbar). */
export const TEMP_MAX_DAYS = 5;
/** Väderstationens värden räknas som ej tillgängliga om stationen inte rapporterat på så här länge. */
export const WEATHER_MAX_HOURS = 4;
/** Personer vars närvaro inte ändrats på så här länge visas inte (mobilen spåras troligen inte längre). */
export const PRESENCE_MAX_DAYS = 28;
const STATION_CAPS = ['measure_temperature', 'measure_wind_strength', 'measure_gust_strength', 'measure_wind_angle', 'measure_temperature.surface'];
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

/** trends: temperaturändring senaste timmen per enhet (nuvärde minus värdet för en timme sedan). */
export function buildHome(
  zones: Zone[], devices: Device[], caps: Cap[], moods: Mood[] = [], now = Date.now(), trends: Record<string, number> = {},
): Home {
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
  /** Snittet av sensorernas ändring senaste timmen → upp, ned eller ingen trend. */
  const trendOf = (ds: Device[], limit: number): Trend => {
    const d = avg(ds.map((x) => trends[x.id]).filter((v): v is number => typeof v === 'number'));
    return d == null || Math.abs(d) < limit ? null : d > 0 ? 'up' : 'down';
  };
  const hasTemp = (ds: Device[]) => ds.some((d) => cap(d, 'measure_temperature')?.value_num != null);

  const active = devices.filter((d) => d.available);
  const lightOf = (d: Device): Light | null => {
    const onoff = cap(d, 'onoff');
    if (d.class !== 'light' || !onoff) return null;
    const dim = cap(d, 'dim')?.value_num;
    const num = (id: string) => cap(d, id)?.value_num ?? null;
    return {
      id: d.id, name: d.name.trim(), on: onoff.value_bool === true, dim: dim == null ? null : Math.round(dim * 100),
      can: { dim: !!cap(d, 'dim'), temp: !!cap(d, 'light_temperature'), color: !!cap(d, 'light_hue') && !!cap(d, 'light_saturation') },
      temp: num('light_temperature'), hue: num('light_hue'), sat: num('light_saturation'),
    };
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
        tempTrend: trendOf(ds.filter((d) => d.class === 'sensor' && fresh(cap(d, 'measure_temperature'))), TREND_INDOOR),
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
  // Uppmätt effekt i första hand, annars Homeys uppskattning.
  const measured = nums(active, 'measure_power');
  const estimated = active
    .filter((d) => cap(d, 'measure_power')?.value_num == null)
    .map((d) => cap(d, 'measure_power.homey')?.value_num)
    .filter((v): v is number => typeof v === 'number');
  const power = [...measured, ...estimated];

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

  // Väderstationer (t.ex. Trafikverket) har klassen service.
  // Homey uppdaterar tidsstämpeln bara vid ändrat värde, så stationen räknas som vid liv
  // om något av dess värden ändrats inom WEATHER_MAX_HOURS (vinden kan stå still länge).
  const allStations = devices.filter((d) => d.class === 'service');
  const stationSeen = (d: Device) => STATION_CAPS.map((id) => cap(d, id)?.last_updated).filter((x): x is string => !!x).sort().at(-1);
  const stations = allStations.filter((d) => {
    const seen = stationSeen(d);
    return d.available && (!seen || now - Date.parse(seen) <= WEATHER_MAX_HOURS * 3600_000);
  });
  const sNum = (id: string) => avg(stations.map((d) => cap(d, id)?.value_num).filter((v): v is number => typeof v === 'number'));
  const angle = sNum('measure_wind_angle');
  const station: Station = { wind: sNum('measure_wind_strength'), gust: sNum('measure_gust_strength'), dir: angle == null ? null : compass(angle), road: sNum('measure_temperature.surface') };

  return {
    outdoorTemp: avg(nums(stations, 'measure_temperature')),
    people: devices
      .filter((d) => {
        const p = cap(d, 'presence');
        return typeof p?.value_bool === 'boolean' && (!p.last_updated || now - Date.parse(p.last_updated) <= PRESENCE_MAX_DAYS * 86400_000);
      })
      .map((d) => ({ id: d.id, name: d.name.trim(), present: cap(d, 'presence')!.value_bool === true, since: cap(d, 'presence')!.last_updated ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    outdoorStale: allStations.length > 0 && stations.length === 0,
    outdoorTrend: trendOf(stations, TREND_OUTDOOR),
    station: Object.values(station).some((v) => v != null) ? station : null,
    lightsOn: allLights.filter((l) => l.on).length,
    lightsTotal: allLights.length,
    powerW: Math.round(power.reduce((a, b) => a + b, 0) * 10) / 10,
    powerMeters: measured.length,
    powerEstimated: estimated.length,
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
