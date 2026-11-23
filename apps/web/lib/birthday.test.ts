import assert from 'node:assert/strict';
import test from 'node:test';
import { birthdaysToday, joinNames, parseBirthdays } from './birthday.ts';

const names = (l: ReturnType<typeof birthdaysToday>) => l.map((b) => b.name);

test('parseBirthdays: tolkar poster och hoppar över ogiltiga', () => {
  assert.deepEqual(parseBirthdays('Ulrika=11-23, Fredrik = 3-14'), [{ name: 'Ulrika', month: 11, day: 23 }, { name: 'Fredrik', month: 3, day: 14 }]);
  assert.deepEqual(parseBirthdays('Fel=13-01,Fel2=02-30,Fel3=abc,=05-05'), []);
  assert.deepEqual(parseBirthdays(undefined), []);
  assert.equal(parseBirthdays('Skott=02-29').length, 1);
});

test('birthdaysToday: matchar datum i Stockholm och upprepas varje år', () => {
  const l = parseBirthdays('Ulrika=11-23');
  assert.deepEqual(names(birthdaysToday(l, new Date('2026-11-23T09:00:00Z'))), ['Ulrika']);
  assert.deepEqual(names(birthdaysToday(l, new Date('2027-11-23T12:00:00Z'))), ['Ulrika']);
  assert.deepEqual(birthdaysToday(l, new Date('2026-11-22T12:00:00Z')), []);
  assert.deepEqual(birthdaysToday(l, new Date('2026-11-24T12:00:00Z')), []);
});

test('birthdaysToday: flera födelsedagar att hålla reda på, även samma dag', () => {
  const l = parseBirthdays('Ulrika=11-23,Fredrik=03-14,Molly=11-23,Wilmer=07-02');
  assert.deepEqual(names(birthdaysToday(l, new Date('2026-11-23T12:00:00Z'))), ['Ulrika', 'Molly']);
  assert.deepEqual(names(birthdaysToday(l, new Date('2027-03-14T12:00:00Z'))), ['Fredrik']);
  assert.deepEqual(birthdaysToday(l, new Date('2026-05-05T12:00:00Z')), []);
});

test('birthdaysToday: går efter lokal tid, inte UTC', () => {
  const l = parseBirthdays('Ulrika=11-23');
  // 22 nov 23:30 UTC = 23 nov 00:30 i Stockholm (vintertid).
  assert.deepEqual(names(birthdaysToday(l, new Date('2026-11-22T23:30:00Z'))), ['Ulrika']);
  // 23 nov 23:30 UTC = 24 nov 00:30 i Stockholm.
  assert.deepEqual(birthdaysToday(l, new Date('2026-11-23T23:30:00Z')), []);
});

test('birthdaysToday: 29 februari firas 28 februari under icke-skottår', () => {
  const l = parseBirthdays('Skott=02-29');
  assert.deepEqual(names(birthdaysToday(l, new Date('2027-02-28T12:00:00Z'))), ['Skott']);
  assert.deepEqual(birthdaysToday(l, new Date('2028-02-28T12:00:00Z')), []);
  assert.deepEqual(names(birthdaysToday(l, new Date('2028-02-29T12:00:00Z'))), ['Skott']);
});

test('joinNames: ett, två och tre namn', () => {
  assert.equal(joinNames(['Ulrika']), 'Ulrika');
  assert.equal(joinNames(['Ulrika', 'Fredrik']), 'Ulrika & Fredrik');
  assert.equal(joinNames(['Ulrika', 'Fredrik', 'Molly']), 'Ulrika, Fredrik & Molly');
  assert.equal(joinNames([]), '');
});
