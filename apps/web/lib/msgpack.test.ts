import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeMsgpack } from './msgpack.ts';

// Testvektor från Python (msgpack.packb): heltal i alla storlekar, flyttal, str, nil, bool, nästlade map/array och tidsstämplar (32 och 64 bitar).
const HEX = '8ca16101a1629701ffcd012cd1fed4ce00011170cb400c000000000000d2fffeee90a173ab48616d6d6172627920c3a5a16ec0a174c3a166c2a16482a16ba176a16590a474733332d6ff6afd86c0a474733634d7ff773594006afd86c0a3626967cf0000010000000000a36e6567d3ffffff0000000000a46c6f6e67d92878787878787878787878787878787878787878787878787878787878787878787878787878787878';
const bytes = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

test('msgpack: avkodar typer, nästlat och tidsstämplar', () => {
  const o = decodeMsgpack(bytes(HEX)) as Record<string, unknown>;
  assert.equal(o.a, 1);
  assert.deepEqual(o.b, [1, -1, 300, -300, 70000, 3.5, -70000]);
  assert.equal(o.s, 'Hammarby å');
  assert.equal(o.n, null);
  assert.equal(o.t, true);
  assert.equal(o.f, false);
  assert.deepEqual(o.d, { k: 'v', e: [] });
  assert.equal((o.ts32 as Date).getTime(), 1795000000 * 1000);
  assert.equal((o.ts64 as Date).getTime(), 1795000000 * 1000 + 500);
  assert.equal(o.big, 2 ** 40);
  assert.equal(o.neg, -(2 ** 40));
  assert.equal(o.long, 'x'.repeat(40));
});

test('msgpack: avskuret innehåll och okänd byte ger fel', () => {
  assert.throws(() => decodeMsgpack(bytes('92')), /avskuret/);
  assert.throws(() => decodeMsgpack(bytes('c1')), /okänd byte/);
});
