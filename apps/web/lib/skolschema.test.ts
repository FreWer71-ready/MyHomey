import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekMonday, parseSkolschema, parseSkolschemaConfig, schoolDays } from './skolschema.ts';

const lesson = (day: number, start: string, end: string, type: string, room = '4') => ({ dayOfWeekNumber: day, startStr: `${start}:00`, endStr: `${end}:00`, type, name: '', room });
// Så som skolschema.se bäddar in veckan: RSC-data i self.__next_f.push, och "Vecka 48, 2026" i rubriken med taggar emellan.
const page = (lessons: unknown, head = 'Vecka<!-- --> <span>48</span>,<!-- --> 2026') =>
  `<html><body><h1>Skolschema</h1><p>. ${head}.</p><script>self.__next_f.push(${JSON.stringify([1, `["$","$L16",null,{"x":"{ ej en lektion }","lessons":${JSON.stringify(lessons)},"currentWeek":true,"isWeekend":false}]`])})</script></body></html>`;

test('skolschema: veckans lektioner och vilken vecka sidan visar', () => {
  const w = parseSkolschema(page({ '1': [lesson(1, '08:00', '08:30', 'MT')], '3': [lesson(3, '08:25', '09:25', 'SV', 'A{1}')] }));
  assert.equal(w?.week, 48);
  assert.equal(w?.year, 2026);
  assert.equal(w?.lessons['3'][0].room, 'A{1}'); // klamrar i en sträng förvirrar inte tolkningen
  // Saknas lektioner eller veckan: null (låst, tom eller ändrad sida).
  assert.equal(parseSkolschema('<html><body>Schemat är låst</body></html>'), null);
  assert.equal(parseSkolschema(page({ '1': [] }, 'Ingen vecka här')), null);
  assert.equal(parseSkolschema('<script>self.__next_f.push([1,"trasig"])</script>'), null);
});

test('skolschema: måndag i ISO-vecka (årsskiften)', () => {
  assert.equal(isoWeekMonday(2026, 48), '2026-11-23');
  assert.equal(isoWeekMonday(2026, 1), '2025-12-29');
  assert.equal(isoWeekMonday(2020, 53), '2020-12-28');
  assert.equal(isoWeekMonday(2027, 1), '2027-01-04');
});

test('skolschema: skoldag = första start, sista slut och antal pass (parallella grupper räknas en gång)', () => {
  const w = parseSkolschema(page({
    '1': [lesson(1, '08:00', '08:30', 'MT'), lesson(1, '08:40', '09:40', 'EN'), lesson(1, '08:40', '09:40', 'NO', 'KEMI-SAL'), lesson(1, '09:55', '10:45', 'M2SPA'), lesson(1, '09:55', '10:45', 'M2FRA'), lesson(1, '13:00', '14:55', 'IDH')],
    '3': [lesson(3, '08:25', '09:25', 'SV')],
    '4': [],
  }))!;
  assert.deepEqual(schoolDays(w), [
    { date: '2026-11-23', start: '08:00', end: '14:55', slots: 4 },
    { date: '2026-11-25', start: '08:25', end: '09:25', slots: 1 },
  ]);
});

test('skolschema: konfiguration med namn och adress (bara skolschema.se, utan frågetecken)', () => {
  assert.deepEqual(parseSkolschemaConfig('Wilmer=https://skolschema.se/eskilstuna/g%C3%B6kstensskolan/7c?v=50&y=2026#x'),
    [{ name: 'Wilmer', url: 'https://skolschema.se/eskilstuna/g%C3%B6kstensskolan/7c' }]);
  assert.deepEqual(parseSkolschemaConfig('Wilmer=https://skolschema.se/eskilstuna/gökstensskolan/7c/ ; Molly = https://skolschema.se/a/b/c9'),
    [{ name: 'Wilmer', url: 'https://skolschema.se/eskilstuna/g%C3%B6kstensskolan/7c' }, { name: 'Molly', url: 'https://skolschema.se/a/b/c9' }]);
  // Fel adress, annan sajt, http, för kort sökväg, saknat namn eller ingenting.
  assert.deepEqual(parseSkolschemaConfig('A=http://skolschema.se/a/b/c;B=https://example.com/a/b/c;C=https://skolschema.se/a/b;=https://skolschema.se/a/b/c;D=inte-en-adress;E'), []);
  assert.deepEqual(parseSkolschemaConfig('A=https://skolschema.se.evil.com/a/b/c'), []);
  assert.deepEqual(parseSkolschemaConfig(undefined), []);
});
