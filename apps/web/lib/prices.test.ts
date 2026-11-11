import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheapestWindow, hourly, levelOf, summarize, type Price } from './prices.ts';

const t0 = Date.parse('2026-11-11T00:00:00+01:00');
const q = (i: number, ore: number): Price => ({ start: t0 + i * 900_000, end: t0 + (i + 1) * 900_000, ore });
// 24 h kvartspriser: dyrt dagtid, billigt kl 02–04.
const day = Array.from({ length: 96 }, (_, i) => q(i, i >= 8 && i < 16 ? 50 : i >= 32 && i < 80 ? 300 : 150));

test('nivå relativt snitt', () => {
  assert.equal(levelOf(70, 100).key, 'cheap');
  assert.equal(levelOf(100, 100).key, 'normal');
  assert.equal(levelOf(130, 100).key, 'high');
  assert.equal(levelOf(200, 100).key, 'peak');
});

test('timmedel och billigaste fönster', () => {
  assert.equal(hourly(day).length, 24);
  assert.equal(hourly(day)[2].ore, 50);
  const w = cheapestWindow(day, t0, 2)!;
  assert.equal(w.start, t0 + 2 * 3600_000);
  assert.equal(w.ore, 50);
  assert.equal(cheapestWindow(day, t0 + 5 * 3600_000, 1)!.ore, 150); // efter det billiga fönstret
});

test('sammanfattning', () => {
  const s = summarize(day, t0 + 12 * 3600_000);
  assert.equal(s.now!.ore, 300);
  assert.equal(s.level!.key, 'high');
  assert.equal(s.todayMin!.ore, 50);
  assert.equal(s.hasTomorrow, false);
});
