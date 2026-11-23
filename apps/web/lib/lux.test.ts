import assert from 'node:assert/strict';
import test from 'node:test';
import { fmtLux, luxLabel } from './lux.ts';

test('lux: ord efter nivå', () => {
  assert.deepEqual([0, 4, 5, 49, 50, 199, 200, 499, 500, 1999, 2000, 20000].map(luxLabel),
    ['Mörkt', 'Mörkt', 'Dunkelt', 'Dunkelt', 'Svagt ljus', 'Svagt ljus', 'Normalt', 'Normalt', 'Ljust', 'Ljust', 'Dagsljus', 'Dagsljus']);
});

test('lux: avrundat med tusentalsavgränsare', () => {
  assert.equal(fmtLux(120.4), '120');
  assert.equal(fmtLux(1234.6).replace(/\s/g, ' '), '1 235');
});
