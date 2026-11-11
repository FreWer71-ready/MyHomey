import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backgroundSrc, conditionOf, phaseOf } from './sky.ts';

const LAT = 59.3759, LON = 16.5097; // Eskilstuna

test('väderlek från MET-symbol', () => {
  assert.equal(conditionOf('clearsky_night'), 'clear');
  assert.equal(conditionOf('fair_day'), 'clear');
  assert.equal(conditionOf('partlycloudy_day'), 'cloudy');
  assert.equal(conditionOf('heavyrainandthunder'), 'rain');
  assert.equal(conditionOf('lightsleet'), 'rain');
  assert.equal(conditionOf('snowshowers_night'), 'snow');
  assert.equal(conditionOf('fog'), 'fog');
  assert.equal(conditionOf(undefined), 'clear');
});

test('tid på dygnet i Eskilstuna', () => {
  assert.equal(phaseOf(Date.parse('2026-06-21T11:00:00Z'), LAT, LON), 'day'); // midsommar, mitt på dagen
  assert.equal(phaseOf(Date.parse('2026-12-21T23:00:00Z'), LAT, LON), 'night'); // midvinter, natt
  assert.equal(phaseOf(Date.parse('2026-11-11T15:00:00Z'), LAT, LON), 'dusk'); // novemberskymning ~16 lokal tid
  assert.equal(backgroundSrc('rain', Date.parse('2026-12-21T23:00:00Z'), LAT, LON), '/mydashboard/bg/rain-night');
});
