import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayInfo, holidays } from './calendar-view.ts';

test('kalender: röda dagar och helg', () => {
  const h = holidays(2026);
  assert.equal(h.get('2026-04-05'), 'Påskdagen');
  assert.equal(h.get('2026-04-03'), 'Långfredagen');
  assert.equal(h.get('2026-05-14'), 'Kristi himmelsfärd');
  assert.equal(h.get('2026-06-19'), 'Midsommarafton');
  assert.equal(h.get('2026-10-31'), 'Alla helgons dag');
  const now = Date.parse('2026-11-17T12:00:00+01:00');
  assert.deepEqual(dayInfo('2026-11-17', now), { main: 'Idag', sub: 'tis 17 nov', free: false, holiday: null, week: 47 });
  assert.equal(dayInfo('2026-11-19', now).main, 'Torsdag');
  assert.equal(dayInfo('2026-11-21', now).free, true);
  assert.equal(dayInfo('2026-12-25', now).holiday, 'Juldagen');
  assert.equal(dayInfo('2026-11-23', now).week, 48);
});

test('kalender: månadsfönster, innevarande och nästa månad', async () => {
  const { monthsWindow } = await import('./calendar-view.ts');
  const a = monthsWindow(Date.parse('2026-11-23T12:00:00+01:00'));
  assert.deepEqual(a, { start: '2026-11-01', end: '2026-12-31', back: 22, ahead: 38 });
  const b = monthsWindow(Date.parse('2026-12-15T12:00:00+01:00')); // nästa månad är januari
  assert.equal(b.start, '2026-12-01'); assert.equal(b.end, '2027-01-31');
  const c = monthsWindow(Date.parse('2027-01-31T12:00:00+01:00')); // februari 2027 har 28 dagar
  assert.equal(c.end, '2027-02-28'); assert.equal(c.back, 30);
  const d = monthsWindow(Date.parse('2026-11-30T23:30:00Z')); // 1 dec 00:30 i Stockholm
  assert.equal(d.start, '2026-12-01'); assert.equal(d.back, 0);
});
