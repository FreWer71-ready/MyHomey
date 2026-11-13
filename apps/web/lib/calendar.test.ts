import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, isOngoing, parseCalendar } from './calendar.ts';

const VTZ = `BEGIN:VTIMEZONE
TZID:Europe/Stockholm
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;
const ev = (lines: string) => `BEGIN:VEVENT\n${lines}\nEND:VEVENT`;
const ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', VTZ,
  // Varje torsdag 18:00 sedan oktober (sommartid) -> ska ligga kvar 18:00 lokal tid efter skiftet.
  ev('UID:yoga\nSUMMARY:Yoga\nDTSTART;TZID=Europe/Stockholm:20261001T180000\nDTEND;TZID=Europe/Stockholm:20261001T190000\nRRULE:FREQ=WEEKLY'),
  // Varje dag 07:30, ett tillfälle struket och ett flyttat till 09:00.
  ev('UID:promenad\nSUMMARY:Promenad\nDTSTART;TZID=Europe/Stockholm:20261110T073000\nDTEND;TZID=Europe/Stockholm:20261110T080000\nRRULE:FREQ=DAILY\nEXDATE;TZID=Europe/Stockholm:20261115T073000'),
  ev('UID:promenad\nRECURRENCE-ID;TZID=Europe/Stockholm:20261116T073000\nSUMMARY:Promenad (sen)\nDTSTART;TZID=Europe/Stockholm:20261116T090000\nDTEND;TZID=Europe/Stockholm:20261116T093000'),
  ev('UID:semester\nSUMMARY:Semester\nDTSTART;VALUE=DATE:20261114\nDTEND;VALUE=DATE:20261117'),
  ev('UID:tand\nSUMMARY:Tandläkare\nLOCATION:Kungsgatan 1\nDTSTART:20261113T083000Z\nDTEND:20261113T093000Z'),
  ev('UID:inst\nSUMMARY:Inställt möte\nSTATUS:CANCELLED\nDTSTART:20261113T120000Z\nDTEND:20261113T130000Z'),
  ev('UID:sopor\nSUMMARY:Sophämtning\nDTSTART;VALUE=DATE:20261102\nDTEND;VALUE=DATE:20261103\nRRULE:FREQ=WEEKLY;BYDAY=MO'),
  ev('UID:gammal\nSUMMARY:Förra veckan\nDTSTART:20261105T100000Z\nDTEND:20261105T110000Z'),
  'END:VCALENDAR'].join('\n');

const now = Date.parse('2026-11-13T10:00:00+01:00'); // fredag
const cal = parseCalendar(ICS, now, 7);
const day = (d: string) => cal.days.find((x) => x.date === d)!;
const hm = (ms: number | null) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(ms!);

test('kalender: idag + 7 dagar, inställda och gamla bort', () => {
  assert.equal(cal.days.length, 8);
  assert.equal(cal.days[0].date, '2026-11-13');
  assert.equal(cal.days[7].date, '2026-11-20');
  assert.deepEqual(day('2026-11-13').timed.map((e) => e.title), ['Promenad', 'Tandläkare']);
  assert.equal(day('2026-11-13').timed[1].location, 'Kungsgatan 1');
});

test('kalender: RRULE behåller lokal tid över sommartidsskiftet', () => {
  const yoga = day('2026-11-19').timed.find((e) => e.title === 'Yoga')!;
  assert.equal(hm(yoga.start), '18:00');
  assert.equal(hm(yoga.end), '19:00');
});

test('kalender: EXDATE och flyttat tillfälle', () => {
  assert.equal(day('2026-11-15').timed.some((e) => e.title.startsWith('Promenad')), false);
  const moved = day('2026-11-16').timed.filter((e) => e.title.startsWith('Promenad'));
  assert.deepEqual(moved.map((e) => [e.title, hm(e.start)]), [['Promenad (sen)', '09:00']]);
  assert.equal(hm(day('2026-11-17').timed.find((e) => e.title === 'Promenad')!.start), '07:30');
});

test('kalender: heldag separat, flerdagars och återkommande', () => {
  for (const d of ['2026-11-14', '2026-11-15', '2026-11-16']) assert.ok(day(d).allDay.some((e) => e.title === 'Semester'), d);
  assert.equal(day('2026-11-17').allDay.some((e) => e.title === 'Semester'), false);
  assert.deepEqual(day('2026-11-16').allDay.map((e) => e.title), ['Semester', 'Sophämtning']);
  assert.equal(day('2026-11-16').timed.some((e) => e.allDay), false);
});

test('kalender: pågående och rubriker', () => {
  const tand = day('2026-11-13').timed.find((e) => e.title === 'Tandläkare')!;
  assert.equal(isOngoing(tand, now), true);
  assert.equal(isOngoing(tand, now + 3600_000), false);
  assert.equal(dayLabel('2026-11-13', now), 'Idag');
  assert.equal(dayLabel('2026-11-14', now), 'Imorgon');
  assert.equal(dayLabel('2026-11-16', now), 'måndag 16 nov');
});
