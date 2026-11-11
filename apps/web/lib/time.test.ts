import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startOfDayStockholm } from './time.ts';

test('midnatt svensk tid, vinter och sommar', () => {
  assert.equal(new Date(startOfDayStockholm(Date.parse('2026-11-11T20:00:00Z'))).toISOString(), '2026-11-10T23:00:00.000Z');
  assert.equal(new Date(startOfDayStockholm(Date.parse('2026-07-01T10:00:00Z'))).toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(new Date(startOfDayStockholm(Date.parse('2026-11-10T23:30:00Z'))).toISOString(), '2026-11-10T23:00:00.000Z');
});
