import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshestPosition, inferTrain, matchTrain, parsePoint, pickRun, TERMINALS } from './onboard.ts';

const now = Date.parse('2026-11-18T07:30:00+01:00');
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();
const member = (o: object) => ({ id: 'm', name: 'Fredrik T', first: 'Fredrik', home: false, place: null, address: null, driving: true, speed: 110, stay: null, battery: 80, charging: false, lat: 59.2, lon: 17.6, updated: iso(4), posUpdated: iso(4), ...o });
const watch = (o: object) => ({ id: 'w', name: 'Apple Watch för Fredrik', home: false, moving: true, km: null, battery: 70, lowBattery: false, charging: false, lat: 59.21, lon: 17.61, updated: iso(1), posUpdated: iso(1), canSound: true, ...o });

test('tågläge: färskaste position och matchning mot tåg', () => {
  assert.equal(freshestPosition([member({})], [watch({})], 'Fredrik', now)!.src, 'watch');
  assert.equal(freshestPosition([member({})], [watch({ posUpdated: iso(20) })], 'Fredrik', now)!.src, 'life360');
  // Nytt batterivärde gör inte en gammal position färsk.
  assert.equal(freshestPosition([member({ updated: iso(1), posUpdated: iso(30) })], [], 'Fredrik', now), null);
  assert.equal(freshestPosition([member({ updated: iso(30), posUpdated: iso(30) })], [], 'Fredrik', now), null);
  assert.deepEqual(parsePoint('POINT (17.628788 59.190920)'), { lon: 17.628788, lat: 59.19092 });
  const pos = { at: { lat: 59.19, lon: 17.629 }, ts: now, speed: 110, src: 'life360' as const };
  const trains = [
    { train: '914', at: { lat: 59.1915, lon: 17.629 }, ts: now - 30_000, speed: 140 },
    { train: '2645', at: { lat: 59.1905, lon: 17.629 }, ts: now - 30_000, speed: 5 },
    { train: '20954', at: { lat: 59.21, lon: 17.629 }, ts: now - 30_000, speed: 140 },
  ];
  assert.equal(matchTrain(pos, trains, now)?.train, '914');
  assert.equal(matchTrain({ ...pos, speed: 3 }, trains, now), null);
  // Bara tåg i aktuell riktning: 914 utesluts om bara 20954 är tillåtet (och den är för långt bort).
  assert.equal(matchTrain(pos, trains, now, new Set(['20954'])), null);
  // Vid Eskilstuna C avgörs inget (många tåg passerar).
  const atStation = { at: { lat: 59.3692, lon: 16.5063 }, ts: now, speed: null, src: 'watch' as const };
  assert.equal(matchTrain(atStation, [{ train: '907', at: { lat: 59.3695, lon: 16.5055 }, ts: now, speed: 40 }], now), null);
});

test('tågläge: troligen på tåget när positionen står kvar vid stationen', () => {
  const at = (h: number, m: number) => Date.parse(`2026-11-19T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`);
  const pos = { at: { lat: 59.36911, lon: 16.506825 }, ts: at(6, 52), speed: 0.6, src: 'life360' as const };
  const list = [
    { ident: '10914', dep: at(6, 57), est: null, arr: at(8, 9), canceled: false },
    { ident: '914', dep: at(7, 4), est: null, arr: at(8, 5), canceled: false },
  ];
  assert.equal(inferTrain([pos], TERMINALS[0], list, at(7, 14)), '10914');
  assert.equal(inferTrain([pos], TERMINALS[0], list, at(6, 55)), null);
  assert.equal(inferTrain([{ ...pos, at: { lat: 59.3759, lon: 16.5097 } }], TERMINALS[0], list, at(7, 14)), null);
  assert.equal(inferTrain([pos], TERMINALS[0], list, at(8, 30)), null);
  // Klockan rapporterade 06:59 (efter avgång), Life360 06:52: tidigaste observationen avgör → 10914, inte 914.
  const watch = { at: { lat: 59.3692, lon: 16.5063 }, ts: at(6, 59), speed: null, src: 'watch' as const };
  assert.equal(inferTrain([watch, pos], TERMINALS[0], list, at(7, 29)), '10914');
});

test('tågläge: rätt tur av samma tågnummer (idag, inte i morgon)', () => {
  const today = { ident: '10914', dep: Date.parse('2026-11-19T06:57:00+01:00'), est: null, arr: Date.parse('2026-11-19T07:49:00+01:00'), canceled: false };
  const tomorrow = { ...today, dep: today.dep + 86400_000, arr: today.arr + 86400_000 };
  assert.equal(pickRun([tomorrow, today], '10914', Date.parse('2026-11-19T07:45:00+01:00')), today);
});

test('tågläge: resan pågår efter ankomst (på tunnelbanan i Stockholm)', () => {
  const t0 = Date.parse('2026-11-19T06:50:00+01:00');
  const train = { ident: '10914', dep: Date.parse('2026-11-19T06:57:00+01:00'), est: null, arr: Date.parse('2026-11-19T07:49:00+01:00'), canceled: false };
  const pos = [
    { at: TERMINALS[0], ts: t0, src: 'watch' },
    { at: { lat: 59.3179, lon: 18.0498 }, ts: Date.parse('2026-11-19T08:02:00+01:00'), src: 'life360' },
  ];
  assert.equal(inferTrain(pos as never, TERMINALS[0], [train], Date.parse('2026-11-19T08:03:00+01:00')), '10914');
  // Kvar nära stationen (gått därifrån, inte åkt): inget tågläge.
  const near = [pos[0], { ...pos[1], at: { lat: 59.38, lon: 16.52 } }];
  assert.equal(inferTrain(near as never, TERMINALS[0], [train], Date.parse('2026-11-19T07:10:00+01:00')), null);
});
