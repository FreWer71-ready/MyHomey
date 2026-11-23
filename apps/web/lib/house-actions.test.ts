import assert from 'node:assert/strict';
import test from 'node:test';
import { houseActions } from './house-actions.ts';

test('houseActions: bara rum med lampor, Mys och Släck som standard', () => {
  const a = houseActions([{ id: 'a', lights: [1] }, { id: 'b', lights: [] }, { id: 'c', lights: [1, 2] }]);
  assert.deepEqual(a.map((x) => [x.name, x.scene]), [['Mys i hela huset', 'mys'], ['Släck alla lampor', 'slack']]);
  assert.deepEqual(a[0].zones, ['a', 'c']);
});

test('houseActions: valfria scener i given ordning, och tomt utan lampor', () => {
  assert.deepEqual(houseActions([{ id: 'a', lights: [1] }], ['ljust', 'mys', 'slack']).map((x) => x.name), ['Ljust i hela huset', 'Mys i hela huset', 'Släck alla lampor']);
  assert.deepEqual(houseActions([{ id: 'a', lights: [] }]), []);
});
