import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinNames } from './days.ts';

test('namn i text', () => {
  assert.equal(joinNames(['Mårten']), 'Mårten');
  assert.equal(joinNames(['Konrad', 'Kurt']), 'Konrad och Kurt');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B och C');
  assert.equal(joinNames([]), '');
});
