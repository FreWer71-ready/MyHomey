import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CalDay, CalEvent, Calendar } from './calendar-view.ts';
import { isoWeekMonday, mergeSchoolDays, parseManualDays, parseSkolschema, parseSkolschemaConfig, schoolDays, withSchoolDays } from './skolschema.ts';

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

test('skolschema: manuella skoldagar (namn|datum|start-slut|lektioner) och hur de slås ihop med hämtade', () => {
  const raw = 'Molly|2026-11-23|08:30-15:45|4; Molly|2026-11-24|8:30-15:35|5;Molly|2026-11-30|09:10-15:40|5';
  assert.deepEqual(parseManualDays(raw), [
    { name: 'Molly', date: '2026-11-23', start: '08:30', end: '15:45', slots: 4 },
    { name: 'Molly', date: '2026-11-24', start: '08:30', end: '15:35', slots: 5 },
    { name: 'Molly', date: '2026-11-30', start: '09:10', end: '15:40', slots: 5 },
  ]);
  // Ogiltigt hoppas över: slut före start, 0 lektioner, fel datum, saknat namn, skräp.
  assert.deepEqual(parseManualDays('A|2026-11-23|15:00-08:00|3;A|2026-11-23|08:00-15:00|0;A|2026-13-45|08:00-15:00|3;|2026-11-23|08:00-15:00|3;skräp;A|2026-11-23|08:00-15:00'), []);
  assert.deepEqual(parseManualDays(undefined), []);
  // Hämtat + manuellt: manuellt gäller på samma datum, sorterat; inget alls ger null; bara manuellt går bra.
  const fetched = [{ date: '2026-11-23', start: '08:00', end: '14:55', slots: 7 }, { date: '2026-11-24', start: '08:10', end: '16:10', slots: 8 }];
  const manual = [{ date: '2026-11-24', start: '09:00', end: '15:00', slots: 5 }, { date: '2026-11-25', start: '08:25', end: '15:25', slots: 6 }];
  assert.deepEqual(mergeSchoolDays(fetched, manual)!.map((d) => `${d.date} ${d.start}-${d.end} ${d.slots}`), ['2026-11-23 08:00-14:55 7', '2026-11-24 09:00-15:00 5', '2026-11-25 08:25-15:25 6']);
  assert.equal(mergeSchoolDays(null, []), null);
  assert.equal(mergeSchoolDays(null, manual)?.length, 2);
  assert.equal(mergeSchoolDays(fetched, [])?.length, 2);
});

test('skolschema: barnens skoldagar som poster i en kalender (bara dagar i fönstret, sorterat, originalet orört)', () => {
  const ev = (id: string, title: string, h: number, e = h + 1, extra: Partial<CalEvent> = {}): CalEvent => ({ id, title, location: null, start: Date.UTC(2026, 10, 23, h - 1), end: Date.UTC(2026, 10, 23, e - 1), allDay: false, firstDay: '2026-11-23', lastDay: '2026-11-23', ...extra });
  const day = (date: string, timed: CalEvent[]): CalDay => ({ date, allDay: [], timed });
  const cal: Calendar = { generated: 1, days: [day('2026-11-23', [ev('a', 'Pilates', 18)]), day('2026-11-24', [])] };
  const school = (date: string, h: number) => ({ days: [day(date, [ev(`skola@${date}`, 'Skola', h, 15, { location: '7 lektioner', src: 2 })])], generated: 1 });
  const merged = withSchoolDays(cal, [{ name: 'Wilmer', cal: school('2026-11-23', 8) }, { name: 'Molly', cal: school('2026-11-24', 9) }, { name: 'Fel', cal: null }]);
  assert.deepEqual(merged.days[0].timed.map((e) => `${e.title}|${e.location}|${e.id}|${e.src}`), ['Wilmer i skolan|7 lektioner|skola@2026-11-23@Wilmer|undefined', 'Pilates|null|a|undefined']);
  assert.deepEqual(merged.days[1].timed.map((e) => e.title), ['Molly i skolan']);
  // Dagar utanför kalenderns fönster läggs inte till, och originalet ändras inte.
  assert.equal(withSchoolDays(cal, [{ name: 'Wilmer', cal: school('2026-12-24', 8) }]).days.flatMap((d) => d.timed).length, 1);
  assert.equal(cal.days[0].timed.length, 1);
});
