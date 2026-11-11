import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinNames, nameDays } from './days.ts';

test('namnsdag ur Svenska dagar', () => {
  const json = { dagar: [{ datum: '2026-11-11', namnsdag: ['Mårten'] }, { datum: '2026-11-12', namnsdag: ['Konrad', 'Kurt'] }] };
  assert.deepEqual(nameDays(json, '2026-11-11'), ['Mårten']);
  assert.deepEqual(nameDays(json, '2026-01-01'), []);
  assert.deepEqual(nameDays({}, '2026-11-11'), []);
});

test('namn i text', () => {
  assert.equal(joinNames(['Mårten']), 'Mårten');
  assert.equal(joinNames(['Konrad', 'Kurt']), 'Konrad och Kurt');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B och C');
  assert.equal(joinNames([]), '');
});
