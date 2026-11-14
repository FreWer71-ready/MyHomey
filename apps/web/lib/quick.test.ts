import assert from 'node:assert/strict';
import { test } from 'node:test';
import { norm, quickActions, type QuickItem } from './quick.ts';

const all: QuickItem[] = [
  { id: 'f1', name: 'Släck alla lampor', kind: 'flow' },
  { id: 'f2', name: 'Gäster kommer', kind: 'flow' },
  { id: 'm1', name: 'Kväll 🌙', kind: 'mood' },
  { id: 'm2', name: 'Bajen', kind: 'mood' },
  { id: 'm3', name: 'Lounge  vardagsrum ', kind: 'mood' },
];

test('namn utan emoji och extra mellanslag', () => {
  assert.equal(norm('Kväll 🌙'), 'kväll');
  assert.equal(norm('Lounge  vardagsrum '), 'lounge vardagsrum');
});

test('fasta i angiven ordning, sedan mest använda utan dubbletter', () => {
  const usage = new Map([['mood:m2', 4], ['flow:f1', 9], ['mood:m3', 1]]);
  const r = quickActions(all, ['Kväll', 'Släck alla lampor', 'Finns inte'], usage);
  assert.deepEqual(r.pinned.map((x) => x.id), ['m1', 'f1']);
  assert.deepEqual(r.most.map((x) => x.id), ['m2', 'm3']);
});
