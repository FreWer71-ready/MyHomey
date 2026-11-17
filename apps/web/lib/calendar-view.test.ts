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
