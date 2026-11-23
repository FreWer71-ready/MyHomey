import assert from 'node:assert/strict';
import test from 'node:test';
import { houseActions } from './house-actions.ts';

test('houseActions: bara rum med lampor, Mys och Släck som standard', () => {
  const a = houseActions([{ id: 'a', lights: [1] }, { id: 'b', lights: [] }, { id: 'c', lights: [1, 2] }]);
  assert.deepEqual(a.map((x) => [x.name, x.scene]), [['Mys i hela huset', 'mys'], ['Släck alla lampor', 'slack']]);
  assert.deepEqual(a[0].zones, ['a', 'c']);
});

test('houseActions: valfria scener i given ordning, och tomt utan lampor', () => {
  assert.deepEqual(houseActions([{ id: 'a', lights: [1] }], ['varmt', 'mys', 'slack', 'stad']).map((x) => x.name), ['Varmt ljus 75 %', 'Mys i hela huset', 'Släck alla lampor', 'Städ kallvitt']);
  assert.equal(houseActions([{ id: 'a', lights: [1] }], ['stad'])[0].scene, 'stad');
  assert.equal(houseActions([{ id: 'a', lights: [1] }], ['varmt'])[0].scene, 'varmt');
  assert.deepEqual(houseActions([{ id: 'a', lights: [] }]), []);
});
