import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshestPosition, matchTrain, parsePoint } from './onboard.ts';

const now = Date.parse('2026-11-18T07:30:00+01:00');
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
const member = (o: object) => ({ id: 'm', name: 'Fredrik T', first: 'Fredrik', home: false, place: null, address: null, driving: true, speed: 110, stay: null, battery: 80, charging: false, lat: 59.2, lon: 17.6, updated: iso(4), ...o });
const watch = (o: object) => ({ id: 'w', name: 'Apple Watch för Fredrik', home: false, moving: true, km: null, battery: 70, lowBattery: false, charging: false, lat: 59.21, lon: 17.61, updated: iso(1), canSound: true, ...o });

test('tågläge: färskaste position och matchning mot tåg', () => {
  assert.equal(freshestPosition([member({})], [watch({})], 'Fredrik', now)!.src, 'watch');
  assert.equal(freshestPosition([member({})], [watch({ updated: iso(20) })], 'Fredrik', now)!.src, 'life360');
  assert.equal(freshestPosition([member({ updated: iso(30) })], [], 'Fredrik', now), null);
  assert.deepEqual(parsePoint('POINT (17.628788 59.190920)'), { lon: 17.628788, lat: 59.19092 });
  const pos = { at: { lat: 59.19, lon: 17.629 }, ts: now, speed: 110, src: 'life360' as const };
  const trains = [
    { train: '914', at: { lat: 59.1915, lon: 17.629 }, ts: now - 30_000, speed: 140 },
    { train: '2645', at: { lat: 59.1905, lon: 17.629 }, ts: now - 30_000, speed: 5 },
    { train: '20954', at: { lat: 59.21, lon: 17.629 }, ts: now - 30_000, speed: 140 },
  ];
  assert.equal(matchTrain(pos, trains, now)?.train, '914');
  assert.equal(matchTrain({ ...pos, speed: 3 }, trains, now), null);
});
