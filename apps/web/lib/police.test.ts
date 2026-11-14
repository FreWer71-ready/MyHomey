import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePolice, policeAlerts, policeTime } from './police.ts';

const now = Date.parse('2026-11-14T22:00:00+01:00');
const raw = [
  { id: 1, datetime: '2026-11-14 21:10:00 +01:00', name: '14 november 21.05, Brand, Eskilstuna', summary: 'Brand i soprum.', url: '/a/', type: 'Brand' },
  { id: 2, datetime: '2026-11-14 7:54:42 +01:00', name: '14 november 07.54, Sammanfattning natt, Södermanlands län', summary: 'x', url: '/b/', type: 'Sammanfattning natt' },
  { id: 3, datetime: '2026-11-14 20:00:00 +01:00', name: '14 november 19.50, Stöld, Eskilstuna', summary: 'Stöld i butik.', url: '/c/', type: 'Stöld' },
  { id: 4, datetime: '2026-11-14 21:30:00 +01:00', name: '14 november 21.20, Brand, Nyköping', summary: 'Bilbrand.', url: '/d/', type: 'Brand' },
  { id: 5, datetime: '2026-11-12 10:00:00 +01:00', name: '12 november, Rån, Eskilstuna', summary: 'Gammal.', url: '/e/', type: 'Rån' },
];

test('tid med ensiffrig timme', () => {
  assert.equal(policeTime('2026-11-14 7:54:42 +01:00'), Date.parse('2026-11-14T07:54:42+01:00'));
});

test('bara vår ort, senaste dygnet, utan sammanfattningar; nyast först', () => {
  const ev = parsePolice(raw, ['Eskilstuna'], now);
  assert.deepEqual(ev.map((e) => e.id), [1, 3]);
  assert.equal(ev[0].level, 'orange');
  assert.equal(ev[0].url, 'https://polisen.se/a/');
  assert.equal(ev[1].level, 'yellow');
});

test('varning på Hem bara för allvarligt och färskt', () => {
  assert.deepEqual(policeAlerts(parsePolice(raw, ['Eskilstuna'], now), now).map((e) => e.id), [1]);
});
