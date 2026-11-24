import assert from 'node:assert/strict';
import test from 'node:test';
import { forzaTeams, forzaToIcs } from './forza.ts';
import { parseCalendar } from './calendar.ts';

const now = Date.parse('2026-11-23T10:00:00Z');
const data = {
  matches: [
    { id: 1, status: 'before', kickoff_at: new Date('2026-11-23T18:00:00Z'), home_team: { name: 'Hammarby IF' }, away_team: { name: 'IFK Göteborg' }, stadium: { name: '3Arena' }, tournament: { name: 'Allsvenskan' }, match_time: { length: 90 } },
    { id: 2, status: 'after', kickoff_at: new Date('2026-11-06T18:15:00Z'), home_team: { name: 'Hammarby IF' }, away_team: { name: 'IF Elfsborg' }, score: { current: [4, 1] } },
    { id: 3, status: 'before', kickoff_at: new Date('2026-11-29T14:00:00Z'), home_team: { name: 'Västerås SK' }, away_team: { name: 'Hammarby IF' }, stadium: { name: 'Hitachi Energy Arena' } },
    { id: 4, status: 'before', kickoff_at: new Date('2026-12-05T12:00:00Z'), kickoff_time_tbd: true, home_team: { name: 'A, B' }, away_team: { name: 'C; D' } },
    { id: 5, status: 'postponed', kickoff_at: new Date('2026-12-06T12:00:00Z'), home_team: { name: 'X' }, away_team: { name: 'Y' } },
    { status: 'before', kickoff_at: new Date('2026-12-07T12:00:00Z') }, // utan id: hoppas över
    { id: 7, status: 'before', kickoff_at: null }, // utan tid: hoppas över
  ],
};

test('forza: lag-id, bara siffror', () => {
  assert.deepEqual(forzaTeams('11413, 22 ,abc,../x,123456789012'), ['11413', '22']);
  assert.deepEqual(forzaTeams(undefined), []);
});

test('forza: matcher blir kalenderhändelser med titel, plats och längd', () => {
  const cal = parseCalendar(forzaToIcs(data), now, 40, 22); // 1 nov … 3 jan
  const find = (d: string) => cal.days.find((x) => x.date === d)!;
  const m1 = find('2026-11-23').timed[0];
  assert.equal(m1.title, 'Hammarby IF – IFK Göteborg');
  assert.equal(m1.location, '3Arena');
  assert.equal(m1.start, Date.parse('2026-11-23T18:00:00Z'));
  assert.equal(m1.end! - m1.start!, 115 * 60_000); // 90 min + 25 min paus och tillägg
  assert.equal(find('2026-11-06').timed[0].title, 'Hammarby IF 4–1 IF Elfsborg'); // spelad: med resultat
  assert.equal(find('2026-11-29').timed[0].title, 'Västerås SK – Hammarby IF');
});

test('forza: okänd tid ger heldag, inställd och ofullständiga hoppas över', () => {
  const cal = parseCalendar(forzaToIcs(data), now, 40, 22);
  const d5 = cal.days.find((x) => x.date === '2026-12-05')!;
  assert.deepEqual(d5.allDay.map((e) => e.title), ['A, B – C; D']); // kommatecken och semikolon klarar escape
  assert.equal(d5.timed.length, 0);
  assert.equal(cal.days.find((x) => x.date === '2026-12-06')!.timed.length, 0); // postponed
  assert.equal(cal.days.find((x) => x.date === '2026-12-07')!.timed.length, 0);
});
