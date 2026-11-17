import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestTrips, parseTrips, stopName, withWalk, withWalkEnd } from './transit.ts';

test('kollektiv: ResRobot-resa tolkas till ben', () => {
  const raw = JSON.parse(readFileSync(new URL('./transit.fixture.json', import.meta.url), 'utf8'));
  const [t] = parseTrips(raw);
  assert.deepEqual(t.legs.map((l) => l.kind), ['walk', 'bus', 'train', 'train', 'walk']);
  assert.deepEqual(t.legs.map((l) => l.label), [null, 'Buss 3', 'Regionaltåg 914', 'Pendeltåg 41', null]);
  assert.equal(t.legs[2].num, '914');
  assert.equal(t.legs[0].from, 'Start');
  assert.equal(t.legs[3].to, 'Årstaberg');
  assert.equal(t.dep, Date.parse('2026-11-18T06:45:00+01:00'));
  assert.equal(t.arr, Date.parse('2026-11-18T08:35:00+01:00'));
  assert.equal(stopName('Eskilstuna Centralstation'), 'Eskilstuna C');
  assert.equal(stopName('Fredsborgsgatan 24, Liljeholmen'), 'Fredsborgsgatan 24');
});

test('kollektiv: dubbletter och sämre resor rensas, promenad läggs till', () => {
  const leg = (kind: 'walk' | 'train', dep: number, arr: number, label: string | null) =>
    ({ kind, from: 'A', to: 'B', dep, arr, minutes: (arr - dep) / 60_000, label, num: null, dir: null, track: null });
  const m = (h: number, mi = 0) => Date.UTC(2026, 10, 18, h, mi);
  const t = (dep: number, arr: number, label: string, extra = 0) => ({ dep, arr: arr + extra, legs: [leg('train', dep, arr + extra, label)], startAt: null, endAt: null });
  const best = bestTrips([t(m(7, 4), m(8, 35), 'Regionaltåg 914'), t(m(7, 4), m(8, 35), 'Regionaltåg 914', 2 * 60_000), t(m(6, 15), m(9, 50), 'Tåg 48'), t(m(8, 2), m(9, 35), 'Regionaltåg 918')]);
  assert.deepEqual(best.map((x) => x.legs[0].label), ['Regionaltåg 914', 'Regionaltåg 918']);
  const w = withWalk(best[0], 0.7);
  assert.equal(w.legs[0].kind, 'walk');
  assert.equal(w.legs[0].minutes, 11);
  assert.equal(w.dep, m(7, 4) - 13 * 60_000);
});

test('kollektiv: promenad hem läggs efter sista hållplatsen', () => {
  const dep = Date.UTC(2026, 10, 18, 16, 0), arr = Date.UTC(2026, 10, 18, 17, 30);
  const t = { dep, arr, startAt: null, endAt: null, legs: [{ kind: 'train' as const, from: 'Stockholm C', to: 'Eskilstuna C', dep, arr, minutes: 90, label: 'Regionaltåg 949', num: '949', dir: null, track: null }] };
  const w = withWalkEnd(t, 0.7);
  assert.equal(w.legs.at(-1)!.to, 'Hemma');
  assert.equal(w.arr, arr + 11 * 60_000);
});
