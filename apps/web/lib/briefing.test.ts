import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefingText, greeting, pickVoice, speechChunks } from './briefing.ts';

// 23 nov 2026 är en måndag; Stockholm är UTC+1 då.
const at = (h: number, m = 0) => Date.UTC(2026, 10, 23, h - 1, m);

test('rapport: hälsning efter klockan i Stockholm', () => {
  assert.equal(greeting(at(7, 12)), 'Godmorgon');
  assert.equal(greeting(at(10)), 'God förmiddag');
  assert.equal(greeting(at(14)), 'God eftermiddag');
  assert.equal(greeting(at(19)), 'God kväll');
  assert.equal(greeting(at(23, 30)), 'Hej');
  assert.equal(greeting(at(2)), 'Hej');
});

test('rapport: text med namn, datum och valfria delar', () => {
  assert.equal(briefingText({ name: 'fredrik', now: at(7, 12) }), 'Godmorgon Fredrik, här är din rapport. Idag är det måndag 23 november.');
  assert.equal(briefingText({ now: at(7, 12) }), 'Godmorgon, här är din rapport. Idag är det måndag 23 november.');
  // Tomma delar hoppas över, övriga läggs efter datumet.
  assert.equal(briefingText({ name: 'Ulrika', now: at(19), parts: ['Ute är det 2 grader.', '  ', 'Tåget går snart.'] }),
    'God kväll Ulrika, här är din rapport. Idag är det måndag 23 november. Ute är det 2 grader. Tåget går snart.');
});

test('rapport: delas i meningar och långa meningar klipps vid komma eller mellanslag', () => {
  assert.deepEqual(speechChunks('Första. Andra! Tredje?'), ['Första.', 'Andra!', 'Tredje?']);
  assert.deepEqual(speechChunks(''), []);
  const long = `${'ord '.repeat(30)}slut, ${'mer '.repeat(30)}klart.`;
  const parts = speechChunks(long, 60);
  assert.ok(parts.length > 3);
  assert.ok(parts.every((p) => p.length <= 60));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '));
});

test('rapport: bästa svenska rösten', () => {
  const v = (name: string, lang: string) => ({ name, lang });
  const list = [v('Samantha', 'en-US'), v('Alva', 'sv-SE'), v('Alva (Premium)', 'sv_SE'), v('Klara', 'sv-SE')];
  assert.equal(pickVoice(list)?.name, 'Alva (Premium)');
  assert.equal(pickVoice([v('Samantha', 'en-US'), v('Klara', 'sv-SE')])?.name, 'Klara');
  assert.equal(pickVoice([v('Samantha', 'en-US')]), null);
  assert.equal(pickVoice([]), null);
});
