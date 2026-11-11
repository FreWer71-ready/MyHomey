import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, fmtValue, type Row } from './history.ts';
import type { Device, Zone } from './home.ts';

const zones: Zone[] = [{ id: 'v', name: 'Vardagsrum', parent_id: 'r' }, { id: 'h', name: 'Hall', parent_id: 'r' }];
const devices: Device[] = [
  { id: 'wx', name: 'Väder', zone_id: 'r', class: 'service', available: true },
  { id: 's1', name: 'Temp', zone_id: 'v', class: 'sensor', available: true },
  { id: 'p1', name: 'Uttag', zone_id: 'v', class: 'socket', available: true },
  { id: 'm1', name: 'Hall uttag', zone_id: 'h', class: 'socket', available: true },
  { id: 'm2', name: 'Kattvind', zone_id: 'h', class: 'socket', available: true },
];
const row = (device_id: string, t: string, v: number, vmin = v, vmax = v): Row => ({ device_id, t, v, vmin, vmax });

test('temperatur: bara sensorer och väder, Ute först, rumsnamn som etikett', () => {
  const s = buildSeries('temp', [
    row('s1', '2026-11-11T10:00:00Z', 21, 20.5, 21.5), row('s1', '2026-11-11T10:10:00Z', 22),
    row('p1', '2026-11-11T10:00:00Z', 35), row('wx', '2026-11-11T10:00:00Z', 1.7),
  ], devices, zones);
  assert.deepEqual(s.map((x) => x.label), ['Ute', 'Vardagsrum']);
  const v = s[1];
  assert.equal(v.latest, 22);
  assert.equal(v.min, 20.5);
  assert.equal(v.max, 22);
  assert.equal(v.points[0][0], Date.parse('2026-11-11T10:00:00Z') / 1000);
});

test('energi: förbrukning per intervall, nollställning blir 0, flera i samma rum får enhetsnamn', () => {
  const s = buildSeries('energy', [
    row('m1', '2026-11-11T10:00:00Z', 5, 5, 5.0), row('m1', '2026-11-11T11:00:00Z', 5.2, 5, 5.2),
    row('m1', '2026-11-11T12:00:00Z', 0.1, 0, 0.1), row('m2', '2026-11-11T10:00:00Z', 1, 1, 1),
    row('m2', '2026-11-11T11:00:00Z', 1.5, 1, 1.5),
  ], devices, zones);
  const hall = s.find((x) => x.id === 'm1')!;
  assert.equal(hall.label, 'Hall · Hall uttag');
  assert.deepEqual(hall.points.map((p) => Math.round(p[1] * 10) / 10), [0.2, 0]);
  assert.equal(Math.round(hall.total! * 10) / 10, 0.2);
});

test('linjen dras fram till nu med senaste värdet', () => {
  const now = Date.parse('2026-11-11T12:00:00Z') / 1000;
  const s = buildSeries('temp', [row('s1', '2026-11-11T10:00:00Z', 21)], devices, zones, now);
  assert.deepEqual(s[0].points.at(-1), [now, 21]);
});

test('formattering', () => {
  assert.equal(fmtValue('temp', 21.04), '21,0°');
  assert.equal(fmtValue('energy', null), '–');
});

test('summering per tidpunkt', async () => {
  const { sumSeries } = await import('./history.ts');
  const mk = (id: string, pts: [number, number][]) => ({ id, label: id, color: '', points: pts, latest: null, min: null, max: null, total: null });
  const s = sumSeries([mk('a', [[1, 1], [2, 2]]), mk('b', [[2, 3], [3, 4]])], 'Alla', '#000');
  assert.deepEqual(s.points, [[1, 1], [2, 5], [3, 4]]);
  assert.equal(s.total, 10);
});

test('inaktuella sensorer tas bort ur historiken', () => {
  const s = buildSeries('temp', [row('s1', '2026-11-11T10:00:00Z', 21), row('wx', '2026-11-11T10:00:00Z', 2)], devices, zones, undefined, new Set(['s1']));
  assert.deepEqual(s.map((x) => x.label), ['Ute']);
});
