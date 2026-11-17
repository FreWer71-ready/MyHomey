import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alongRoute, boxFor, editDistance, isWeekend, km, nearHome, nextTrip, placeCandidates, placeLabel } from './trip.ts';
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
