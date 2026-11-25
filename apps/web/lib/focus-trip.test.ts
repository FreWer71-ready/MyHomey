import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packFocus, parseFocus } from './focus-trip.ts';

test('dagens resa: packas, gäller bara samma dag och kräver giltiga ben', () => {
  const dep = Date.parse('2026-11-25T06:54:00+01:00');
  const legs = [
    { kind: 'walk', from: 'Din plats', to: 'Eskilstuna C', dep, arr: dep + 12 * 60_000, minutes: 12, label: null, num: null, dir: null, track: null, meters: 960, fromAt: { lat: 59.37, lon: 16.5 } },
    { kind: 'train', from: 'Eskilstuna C', to: 'Kristianstad', dep: dep + 14 * 60_000, arr: dep + 300 * 60_000, minutes: 286, label: 'Regionaltåg 2107', num: '2107', dir: 'Linköping', track: '3', toAt: { lat: 56.03123456, lon: 14.15 } },
  ];
  const f = packFocus({ legs: legs as never }, 'Kristianstad', false)!;
  assert.equal(f.day, '2026-11-25');
  assert.equal(f.arr, dep + 300 * 60_000);
  assert.equal(f.legs[1].toAt!.lat, 56.03123);
  assert.equal('fromAt' in f.legs[0], false);
  const raw = JSON.stringify(f);
  assert.ok(parseFocus(raw, dep + 3600_000));
  assert.equal(parseFocus(raw, Date.parse('2026-11-26T08:00:00+01:00')), null);
  assert.equal(parseFocus('{trasig', dep), null);
  assert.equal(packFocus({ legs: [{ ...legs[0], kind: 'raket' }] as never }, 'X', false), null);
});
