import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextLegIndex } from './transit-view.ts';

const M = 60_000;
// Gå 06:43–06:55, tåg 06:57–07:49, gå 07:58–08:02.
const legs = [{ dep: 643 * M, arr: 655 * M }, { dep: 657 * M, arr: 749 * M }, { dep: 758 * M, arr: 762 * M }];

test('nästa sträcka: klockan styr utan position (nästa, pågående, mellan sträckor, klart)', () => {
  assert.equal(nextLegIndex(legs, 619 * M), 0); // före första: första sträckan är nästa
  assert.equal(nextLegIndex(legs, 650 * M), 0); // pågående
  assert.equal(nextLegIndex(legs, 656 * M), 1); // mellan sträckor: nästa är tåget
  assert.equal(nextLegIndex(legs, 700 * M), 1);
  assert.equal(nextLegIndex(legs, 760 * M), 2);
  assert.equal(nextLegIndex(legs, 800 * M), -1); // allt passerat
  assert.equal(nextLegIndex([], 600 * M), -1);
});

test('nästa sträcka: positionen styr när den är känd', () => {
  // Positionen säger att första sträckan är gjord fast klockan är före tåget: nästa är tåget.
  assert.equal(nextLegIndex(legs, 650 * M, { known: true, done: 1, waiting: false }), 1);
  // Man har inte gått än (väntar vid start): första sträckan är nästa, inte "pågående".
  assert.equal(nextLegIndex(legs, 650 * M, { known: true, done: 0, waiting: true }), 0);
  // Okänd position: klockan.
  assert.equal(nextLegIndex(legs, 700 * M, { known: false, done: 0, waiting: false }), 1);
});
