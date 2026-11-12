import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHome, iconFor, type Cap, type Device, type Zone } from './home.ts';
import { heatColor, fmtTemp } from './scale.ts';

const zones: Zone[] = [
  { id: 'root', name: 'Hem', parent_id: null },
  { id: 'v', name: 'Vardagsrum', parent_id: 'root' },
  { id: 'b', name: 'Badrum', parent_id: 'root' },
  { id: 'tom', name: 'Ute', parent_id: 'root' },
];
const devices: Device[] = [
  { id: 'wx', name: 'Eskilstuna Ö', zone_id: 'root', class: 'service', available: true },
  { id: 's1', name: 'Temp vardagsrum', zone_id: 'v', class: 'sensor', available: true },
  { id: 'p1', name: 'Växtlampa', zone_id: 'v', class: 'socket', available: true },
  { id: 'l1', name: 'Tak', zone_id: 'v', class: 'light', available: true },
  { id: 'l2', name: 'Golv', zone_id: 'v', class: 'light', available: true },
  { id: 'old', name: 'Gammal', zone_id: 'v', class: 'light', available: false },
  { id: 's2', name: 'Temp badrum', zone_id: 'b', class: 'sensor', available: true },
];
const c = (device_id: string, capability_id: string, v: number | boolean): Cap => ({
  device_id, capability_id,
  value_num: typeof v === 'number' ? v : null,
  value_bool: typeof v === 'boolean' ? v : null,
});
const caps: Cap[] = [
  c('wx', 'measure_temperature', 1.7),
  c('s1', 'measure_temperature', 22), c('s1', 'measure_humidity', 40), c('s1', 'alarm_contact', false),
  c('p1', 'measure_temperature', 35.5), c('p1', 'measure_power', 13.06),
  c('l1', 'onoff', true), c('l1', 'dim', 0.65), c('l2', 'onoff', false),
  c('old', 'onoff', true),
  c('s2', 'measure_temperature', 24.1), c('s2', 'measure_humidity', 36), c('s2', 'measure_battery', 12),
];

test('rumstemperatur räknas bara från sensorer', () => {
  const v = buildHome(zones, devices, caps).rooms.find((r) => r.id === 'v')!;
  assert.equal(v.temp, 22);
});

test('luftfuktighet bara i våtrum', () => {
  const rooms = buildHome(zones, devices, caps).rooms;
  assert.equal(rooms.find((r) => r.id === 'v')!.humidity, null);
  assert.equal(rooms.find((r) => r.id === 'b')!.humidity, 36);
});

test('översikt: ute, lampor, effekt, batteri, rum utan enheter döljs', () => {
  const h = buildHome(zones, devices, caps);
  assert.equal(h.outdoorTemp, 1.7);
  assert.equal(h.lightsOn, 1);
  assert.equal(h.lightsTotal, 2);
  assert.equal(h.powerW, 13.1);
  assert.equal(h.lowBattery, 1);
  assert.equal(h.doorsTotal, 1);
  assert.equal(h.online, 6);
  assert.deepEqual(h.rooms.map((r) => r.id), ['v', 'b']);
  assert.deepEqual(h.rooms[0].lights.map((l) => [l.name, l.on, l.dim]), [['Golv', false, null], ['Tak', true, 65]]);
});

test('moods per rum, sorterade', () => {
  const h = buildHome(zones, devices, caps, [
    { id: 'm2', name: 'Mys', zone_id: 'v' }, { id: 'm1', name: 'Film', zone_id: 'v' }, { id: 'm3', name: 'Bad', zone_id: 'b' },
  ]);
  assert.deepEqual(h.rooms[0].moods.map((m) => m.name), ['Film', 'Mys']);
  assert.deepEqual(h.rooms[1].moods.map((m) => m.name), ['Bad']);
});

test('favoritmoods med rumsnamn, hela hemmet utan rum', () => {
  const h = buildHome(zones, devices, caps, [
    { id: 'm1', name: 'Film', zone_id: 'v', favorite: true }, { id: 'm2', name: 'Natt', zone_id: 'root', favorite: true }, { id: 'm3', name: 'Bad', zone_id: 'b' },
  ]);
  assert.deepEqual(h.favoriteMoods, [{ id: 'm2', name: 'Natt', room: null }, { id: 'm1', name: 'Film', room: 'Vardagsrum' }]);
});

test('ikoner och färgskala', () => {
  assert.equal(iconFor('Kök'), 'pot');
  assert.equal(iconFor('Molly'), 'bed');
  assert.equal(heatColor(21), '#BFF0D4');
  assert.equal(heatColor(null), '#9AA1B5');
  assert.equal(fmtTemp(22), '22,0°');
});

test('batterilista, dörrar/fönster och enheter som inte svarar', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const zs: Zone[] = [{ id: 'r', name: 'Hem', parent_id: null }, { id: 'k', name: 'Kontor', parent_id: 'r' }];
  const ds: Device[] = [
    { id: 'w', name: 'Kontor Fönster 1', zone_id: 'k', class: 'sensor', available: true },
    { id: 'e', name: 'Entredörr', zone_id: 'k', class: 'sensor', available: true },
    { id: 't', name: 'Temp', zone_id: 'k', class: 'sensor', available: true },
    { id: 'x', name: 'Borta', zone_id: 'k', class: 'sensor', available: false },
  ];
  const cs: Cap[] = [
    { device_id: 'w', capability_id: 'alarm_contact', value_num: null, value_bool: true },
    { device_id: 'e', capability_id: 'alarm_contact', value_num: null, value_bool: false },
    { device_id: 't', capability_id: 'measure_battery', value_num: 3, value_bool: null, last_updated: '2020-01-01T00:00:00Z' },
    { device_id: 't', capability_id: 'measure_temperature', value_num: 21, value_bool: null, last_updated: '2026-11-08T12:00:00Z' },
    { device_id: 'w', capability_id: 'measure_battery', value_num: 90, value_bool: null, last_updated: '2026-11-11T11:00:00Z' },
  ];
  const h = buildHome(zs, ds, cs, [], now);
  assert.deepEqual(h.lowBatteryList.map((b) => [b.name, b.level, b.room]), [['Temp', 3, 'Kontor']]);
  assert.deepEqual(h.openings.map((o) => [o.name, o.kind, o.open]), [['Kontor Fönster 1', 'window', true], ['Entredörr', 'door', false]]);
  assert.deepEqual(h.silent.map((s) => [s.name, s.reason]), [['Borta', 'offline'], ['Temp', 'stale']]);
});

test('regnvarning kräver nederbörd och öppet fönster', async () => {
  const { rainWarning } = await import('./alerts.ts');
  const w = { current: { time: 1, symbol: 'rain', precip: 1, temp: 2 }, nextPrecip: { time: 2, symbol: 'rain', precip: 1, temp: 2 }, rainSoon: true };
  const win = { id: 'w', name: 'Fönster', room: 'Kontor', open: true, kind: 'window' as const };
  const door = { ...win, id: 'd', kind: 'door' as const };
  assert.equal(rainWarning(w, [win])!.at, 2);
  assert.equal(rainWarning(w, [door]), null);
  assert.equal(rainWarning({ ...w, rainSoon: false }, [win]), null);
  assert.equal(rainWarning(null, [win]), null);
});

test('fuktvarning från 70 %', async () => {
  const { humidityWarnings } = await import('./alerts.ts');
  const r = (name: string, humidity: number | null) => ({ id: name, name, icon: 'drop' as const, temp: 22, tempStale: false, humidity, lights: [], lightsOn: 0, moods: [], deviceCount: 1 });
  assert.deepEqual(humidityWarnings([r('Badrum', 74), r('Toa', 55), r('Kök', null)]).map((x) => x.name), ['Badrum']);
});

test('temperaturer äldre än 5 dagar räknas inte, rummet blir ej nåbart', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const zs: Zone[] = [{ id: 'r', name: 'Hem', parent_id: null }, { id: 'a', name: 'A', parent_id: 'r' }, { id: 'b', name: 'B', parent_id: 'r' }];
  const ds: Device[] = [
    { id: 'old', name: 'Gammal', zone_id: 'a', class: 'sensor', available: true },
    { id: 'new', name: 'Ny', zone_id: 'b', class: 'sensor', available: true },
    { id: 'old2', name: 'Gammal 2', zone_id: 'b', class: 'sensor', available: true },
  ];
  const t = (device_id: string, v: number, last_updated: string): Cap => ({ device_id, capability_id: 'measure_temperature', value_num: v, value_bool: null, last_updated });
  const h = buildHome(zs, ds, [t('old', 26.8, '2026-07-01T00:00:00Z'), t('new', 21, '2026-11-11T11:00:00Z'), t('old2', 30, '2026-10-01T00:00:00Z')], [], now);
  const a = h.rooms.find((r) => r.id === 'a')!, b = h.rooms.find((r) => r.id === 'b')!;
  assert.deepEqual([a.temp, a.tempStale], [null, true]);
  assert.deepEqual([b.temp, b.tempStale], [21, false]);
  assert.equal(fmtTemp(a.temp, a.tempStale), 'Ej nåbar');
});

test('SMHI: timmen räknas från intervallets start, symbol i MET-format med dag/natt', async () => {
  const { parseSmhi, summarizeWeather } = await import('./weather.ts');
  const json = { timeSeries: [
    { time: '2026-11-12T12:00:00Z', intervalParametersStartTime: '2026-11-12T11:00:00Z', data: { symbol_code: 3, air_temperature: 5, precipitation_amount_mean_deterministic: 0 } },
    { time: '2026-11-12T13:00:00Z', intervalParametersStartTime: '2026-11-12T12:00:00Z', data: { symbol_code: 18, air_temperature: 5, precipitation_amount_mean_deterministic: 0.4 } },
    { time: '2026-11-12T23:00:00Z', intervalParametersStartTime: '2026-11-12T22:00:00Z', data: { symbol_code: 1, air_temperature: 1 } },
    { time: '2026-11-14T00:00:00Z', intervalParametersStartTime: '2026-11-13T12:00:00Z', data: { symbol_code: 5 } },
  ] };
  const h = parseSmhi(json, (ms) => new Date(ms).getUTCHours() < 15);
  assert.deepEqual(h.map((x) => [new Date(x.time).toISOString().slice(11, 16), x.symbol]), [['11:00', 'partlycloudy_day'], ['12:00', 'lightrain'], ['22:00', 'clearsky_night']]);
  const w = summarizeWeather(h, Date.parse('2026-11-12T11:20:00Z'))!;
  assert.equal(w.nextPrecip!.time, Date.parse('2026-11-12T12:00:00Z'));
  assert.equal(w.rainSoon, true);
});

test('väderstation: vind, by, riktning och vägyta', async () => {
  const { compass } = await import('./home.ts');
  const h = buildHome(zones, devices, [...caps, c('wx', 'measure_wind_strength', 1), c('wx', 'measure_gust_strength', 2.2), c('wx', 'measure_wind_angle', 157), c('wx', 'measure_temperature.surface', 4.2)]);
  assert.deepEqual(h.station, { wind: 1, gust: 2.2, dir: 'SSO', road: 4.2 });
  assert.equal(buildHome(zones, devices, caps).station, null);
  assert.deepEqual([compass(0), compass(350), compass(270)], ['N', 'N', 'V']);
});
