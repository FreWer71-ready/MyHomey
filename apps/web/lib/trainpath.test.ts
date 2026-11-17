import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPath, whereNow, type RawAnn } from './trainpath.ts';

const a = (sig: string, act: string, plan: string, actual?: string, adv = true): RawAnn => ({
  LocationSignature: sig, ActivityType: act, Advertised: adv, AdvertisedTimeAtLocation: `2026-11-17T${plan}:00+01:00`,
  ...(actual ? { TimeAtLocation: `2026-11-17T${actual}:00+01:00` } : {}),
});

test('tåg 950: driftplats mellan stationerna, senaste passage och nästa', () => {
  const p = buildPath([
    a('Arb', 'Avgang', '14:34', '14:38'), a('Vsg', 'Avgang', '14:39', '14:47', false),
    a('Kör', 'Ankomst', '14:45', '14:54'), a('Kör', 'Avgang', '14:45', '14:56'),
    a('Et', 'Ankomst', '15:00'), a('Et', 'Avgang', '15:04'),
  ], { Arb: 'Arboga', Vsg: 'Valskog', Kör: 'Kungsör', Et: 'Eskilstuna C' });
  assert.deepEqual(p.stops.map((s) => [s.name, s.station, s.passed, s.delay]), [
    ['Arboga', true, true, 4], ['Valskog', false, true, 8], ['Kungsör', true, true, 11], ['Eskilstuna C', true, false, null],
  ]);
  assert.equal(p.last?.name, 'Kungsör');
  assert.equal(p.next?.name, 'Eskilstuna C');
  assert.equal(whereNow(p), 'Passerade Kungsör 14:56 · +11 min');
});

test('ej avgått och framme', () => {
  assert.equal(whereNow(buildPath([a('Et', 'Avgang', '15:04'), a('Cst', 'Ankomst', '16:05')], { Et: 'Eskilstuna C', Cst: 'Stockholm C' })), 'Ej avgått från Eskilstuna C (15:04)');
  assert.equal(whereNow(buildPath([a('Et', 'Avgang', '15:04', '15:05'), a('Cst', 'Ankomst', '16:05', '16:07')], { Et: 'Eskilstuna C', Cst: 'Stockholm C' })), 'Framme i Stockholm C 16:07');
});
