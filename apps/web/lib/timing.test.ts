import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleWhileRevalidate, stopwatch, withDeadline } from './timing.ts';

const later = <T>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));

test('tidsgräns: värdet om det hinner, annars reservvärdet (en gång), även vid fel', async () => {
  let late = 0;
  assert.equal(await withDeadline(later('klar', 5), 200, 'sen', () => late++), 'klar');
  assert.equal(late, 0);
  assert.equal(await withDeadline(later('klar', 200), 20, 'sen', () => late++), 'sen');
  assert.equal(late, 1);
  assert.equal(await withDeadline(Promise.reject(new Error('fel')), 200, null, () => late++), null);
  assert.equal(late, 2);
  // Sent fel efter tidsgränsen räknas inte en gång till.
  const slowFail = new Promise<string>((_, rej) => setTimeout(() => rej(new Error('sent')), 40));
  assert.equal(await withDeadline(slowFail, 10, 'sen', () => late++), 'sen');
  await later(null, 60);
  assert.equal(late, 3);
});

test('stoppur: raden visar när varje del blev klar och totalen', async () => {
  let t = 1000;
  const sw = stopwatch(() => t);
  const a = sw.lap('hem', Promise.resolve(1));
  t = 1120; await a; await later(null, 1);
  const b = sw.lap('vader', Promise.reject(new Error('x')));
  await b.catch(() => null); await later(null, 1);
  t = 1500;
  assert.equal(await a, 1);
  assert.equal(sw.line(), 'hem=120 vader=120 totalt=500');
  sw.mark('steg');
  assert.equal(sw.line(), 'hem=120 vader=120 steg=500 totalt=500');
});

test('föråldrad-medan-uppdateras: färskt direkt, utgånget direkt + uppdatering efteråt, för gammalt väntar, samtidiga delar körning', async () => {
  let t = 0, builds = 0;
  const later: (() => Promise<unknown>)[] = [];
  const get = staleWhileRevalidate(async (k: string) => { builds++; await later_(5); return k === 'fel' ? null : `${k}#${builds}`; },
    { ttl: 100, maxStale: 1000, later: (j) => later.push(j), now: () => t });
  function later_(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
  // Tomt: anroparen väntar. Två samtidiga anrop delar en körning.
  const [a, b] = await Promise.all([get('x'), get('x')]);
  assert.deepEqual([a, b, builds], ['x#1', 'x#1', 1]);
  // Färskt: direkt, ingen ny körning.
  t = 50; assert.equal(await get('x'), 'x#1'); assert.equal(builds, 1); assert.equal(later.length, 0);
  // Utgånget men inte för gammalt: det gamla direkt, uppdatering lagd efteråt (delas även om flera begär det).
  t = 500; assert.equal(await get('x'), 'x#1'); assert.equal(await get('x'), 'x#1');
  assert.equal(later.length, 2); assert.equal(builds, 1);
  await Promise.all(later.map((j) => j())); assert.equal(builds, 2);
  assert.equal(await get('x'), 'x#2'); // uppdaterat värde
  // För gammalt: väntar på ny körning.
  t = 5000; assert.equal(await get('x'), 'x#3');
  // Null sparas inte (nästa anrop försöker igen).
  assert.equal(await get('fel'), null); const before = builds; assert.equal(await get('fel'), null); assert.equal(builds, before + 1);
});
