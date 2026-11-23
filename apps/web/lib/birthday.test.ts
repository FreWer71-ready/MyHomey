import assert from 'node:assert/strict';
import test from 'node:test';
import { birthdayToday, parseBirthdays } from './birthday.ts';

test('parseBirthdays: tolkar poster och hoppar över ogiltiga', () => {
  assert.deepEqual(parseBirthdays('Ulrika=11-23, Fredrik = 3-14'), [{ name: 'Ulrika', month: 11, day: 23 }, { name: 'Fredrik', month: 3, day: 14 }]);
  assert.deepEqual(parseBirthdays('Fel=13-01,Fel2=02-30,Fel3=abc,=05-05'), []);
  assert.deepEqual(parseBirthdays(undefined), []);
  assert.equal(parseBirthdays('Skott=02-29').length, 1);
});

test('birthdayToday: matchar datum i Stockholm och upprepas varje år', () => {
  const l = parseBirthdays('Ulrika=11-23');
  assert.equal(birthdayToday(l, new Date('2026-11-23T09:00:00Z'))?.name, 'Ulrika');
  assert.equal(birthdayToday(l, new Date('2027-11-23T12:00:00Z'))?.name, 'Ulrika');
  assert.equal(birthdayToday(l, new Date('2026-11-22T12:00:00Z')), null);
  assert.equal(birthdayToday(l, new Date('2026-11-24T12:00:00Z')), null);
});

test('birthdayToday: går efter lokal tid, inte UTC', () => {
  const l = parseBirthdays('Ulrika=11-23');
  // 22 nov 23:30 UTC = 23 nov 00:30 i Stockholm (vintertid).
  assert.equal(birthdayToday(l, new Date('2026-11-22T23:30:00Z'))?.name, 'Ulrika');
  // 23 nov 23:30 UTC = 24 nov 00:30 i Stockholm.
  assert.equal(birthdayToday(l, new Date('2026-11-23T23:30:00Z')), null);
});

test('birthdayToday: 29 februari firas 28 februari under icke-skottår', () => {
  const l = parseBirthdays('Skott=02-29');
  assert.equal(birthdayToday(l, new Date('2027-02-28T12:00:00Z'))?.name, 'Skott');
  assert.equal(birthdayToday(l, new Date('2028-02-28T12:00:00Z')), null);
  assert.equal(birthdayToday(l, new Date('2028-02-29T12:00:00Z'))?.name, 'Skott');
});
