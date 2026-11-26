import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alongRoute, boxFor, onRoute, thinPath, editDistance, isWeekend, km, nearHome, nextTrip, placeCandidates, placeLabel } from './trip.ts';
import type { RoadEvent } from './commute.ts';

const home = { lat: 59.371, lon: 16.51 }; // Eskilstuna
const mariefred = { lat: 59.26, lon: 17.22 };
const ev = (id: string, lat: number, lon: number): RoadEvent => ({ id, road: 'Väg', type: 'Vägarbete', code: '', incident: false, text: null, place: null, severity: 3, severityText: null, start: null, end: null, lat, lon });

test('helgläge fredag 20:00 – söndag 12:00 (Stockholmstid)', () => {
  const at = (iso: string) => isWeekend(Date.parse(iso));
  assert.equal(at('2026-11-13T18:59:00Z'), false); // fredag 19:59
  assert.equal(at('2026-11-13T19:00:00Z'), true); // fredag 20:00
  assert.equal(at('2026-11-14T12:00:00Z'), true); // lördag
  assert.equal(at('2026-11-15T10:59:00Z'), true); // söndag 11:59
  assert.equal(at('2026-11-15T11:00:00Z'), false); // söndag 12:00
  assert.equal(at('2026-11-16T12:00:00Z'), false); // måndag
});

test('ortnamn ur adress', () => {
  assert.equal(placeLabel('Storgatan 5, 647 30 Mariefred, Sverige'), 'Mariefred');
  assert.equal(placeLabel('Mariefred'), 'Mariefred');
});

test('nästa resa: tidsatt med plats, inte online', () => {
  const now = Date.parse('2026-11-14T09:00:00Z');
  const days = [{ date: '2026-11-14', allDay: [], timed: [
    { id: 'a', title: 'Möte', location: 'https://meet.google.com/x', start: now + 3600_000, end: null, allDay: false, firstDay: '', lastDay: '' },
    { id: 'b', title: 'Match', location: 'Mariefreds IP, Mariefred', start: now + 5 * 3600_000, end: null, allDay: false, firstDay: '', lastDay: '' },
  ] }];
  assert.deepEqual(nextTrip(days, now), { title: 'Match', location: 'Mariefreds IP, Mariefred', place: 'Mariefred', start: now + 5 * 3600_000 });
  assert.equal(nextTrip(days, now + 10 * 3600_000), null);
});

test('korridor längs vägen och närområde', () => {
  assert.ok(Math.abs(km(home, mariefred) - 42) < 5);
  const strangnas = ev('s', 59.31, 16.95); // nära linjen (Strängnäs)
  const sala = ev('n', 59.92, 16.6); // långt norrut
  const torshalla = ev('t', 59.42, 16.47); // nära hemma
  assert.deepEqual(alongRoute([strangnas, sala], home, mariefred).map((e) => e.id), ['s']);
  assert.deepEqual(nearHome([strangnas, sala, torshalla], home).map((e) => e.id), ['t']);
  const [x0, y0, x1, y1] = boxFor([home, mariefred], 8);
  assert.ok(x0 < 16.51 && x1 > 17.22 && y0 < 59.26 && y1 > 59.371);
});

test('resa: platsnamn ur titel', () => {
  assert.deepEqual(placeCandidates('Tunahallen W fotboll'), ['Tunahallen']);
  assert.deepEqual(placeCandidates('Match Nykvarns IF – Tyresö Trollbäcken IBK'), ['Nykvarns', 'Tyresö Trollbäcken', 'Tyresö']);
  assert.deepEqual(placeCandidates('Möte med Anna'), []);
  assert.equal(editDistance('Tunavallen', 'Tunahallen'), 1);
  assert.ok(editDistance('Refreshments by Anna', 'Anna') > 2);
});

test('hinder bara på den faktiska rutten', () => {
  const path = thinPath([{ lat: 59.37, lon: 16.51 }, { lat: 59.30, lon: 17.20 }, { lat: 59.31, lon: 18.0 }]);
  const ev = (id: string, lat: number, lon: number) => ({ id, lat, lon }) as never;
  // På vägen, 2 km bredvid, och nära målet men inte på rutten.
  const hit = onRoute([ev('på', 59.335, 16.855), ev('bredvid', 59.355, 16.855), ev('mål', 59.29, 18.02)], path).map((e: { id: string }) => e.id);
  assert.deepEqual(hit, ['på']);
});

test('platssökning: naturplatser duger inte (holmen "Köpenhamn" i Småland)', async () => {
  const { usableHit } = await import('./trip.ts');
  assert.equal(usableHit({ lat: '56.69', lon: '14.18', category: 'place', type: 'islet' }), false);
  assert.equal(usableHit({ lat: '55.68', lon: '12.57', category: 'place', type: 'city' }), true);
  assert.equal(usableHit({ lat: '59.3', lon: '18.0', category: 'highway', type: 'residential' }), true);
  assert.equal(usableHit(undefined), false);
});
