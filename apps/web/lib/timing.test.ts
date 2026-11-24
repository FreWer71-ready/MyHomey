import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopwatch, withDeadline } from './timing.ts';

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
