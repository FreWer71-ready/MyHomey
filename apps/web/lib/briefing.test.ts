import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearer, keyOk } from './briefing-auth.ts';
import { briefingParts, briefingText, greeting, joinList, numWords, pickVoice, sectionsOn, speechChunks, spokenDate, spokenTime, tempPhrase, todayPlan, weatherPhrase } from './briefing.ts';

// 23 nov 2026 är en måndag; Stockholm är UTC+1 då.
const at = (h: number, m = 0) => Date.UTC(2026, 10, 23, h - 1, m);

test('rapport: siffror som ord (klockslag, datum, temperatur)', () => {
  assert.deepEqual([0, 13, 21, 57].map(numWords), ['noll', 'tretton', 'tjugoett', 'femtiosju']);
  assert.equal(spokenTime(at(6, 57)), 'sex femtiosju');
  assert.equal(spokenTime(at(9)), 'nio');
  assert.equal(spokenTime(at(7, 5)), 'sju noll fem');
  assert.equal(spokenTime(at(16, 4)), 'sexton noll fyra');
  assert.equal(spokenTime(at(17, 45)), 'sjutton fyrtiofem');
  assert.equal(spokenDate(at(7)), 'tjugotredje november');
  assert.equal(tempPhrase(1), 'en plusgrad');
  assert.equal(tempPhrase(2.4), 'två plusgrader');
  assert.equal(tempPhrase(-1), 'en minusgrad');
  assert.equal(tempPhrase(-3), 'tre minusgrader');
  assert.equal(tempPhrase(0.3), 'noll grader');
  assert.equal(weatherPhrase('Regn', 1), 'regn och en plusgrad');
  assert.equal(weatherPhrase(null, 5), 'fem plusgrader');
  assert.equal(weatherPhrase('Mulet', null), 'mulet');
  assert.equal(weatherPhrase(null, null), '');
  assert.equal(joinList(['a', 'b', 'c']), 'a, b och c');
  assert.equal(joinList(['a', 'b']), 'a och b');
});

test('rapport: hälsning och första meningen', () => {
  assert.equal(greeting(at(7, 12)), 'Godmorgon');
  assert.equal(greeting(at(10)), 'Hej');
  assert.equal(greeting(at(2)), 'Hej');
  assert.equal(briefingText({ name: 'fredrik', now: at(7, 12), weather: 'regn och en plusgrad' }), 'Godmorgon Fredrik.\n\nIdag är det tjugotredje november och det är regn och en plusgrad ute.');
  assert.equal(briefingText({ name: 'Ulrika', now: at(14), parts: ['Ha en trevlig dag.', ' '] }), 'Hej Ulrika.\n\nIdag är det tjugotredje november. Ha en trevlig dag.');
  assert.equal(briefingText({ now: at(14) }), 'Hej.\n\nIdag är det tjugotredje november.');
});

test('rapport: Fredriks manus (tåg, första händelse, sista möte och hemresa)', () => {
  const on = sectionsOn('tag,forsta,hemresa', { vader: true, tag: true, pendlar: true, bil: false });
  const parts = briefingParts({
    train: { dep: at(6, 57), delay: 2, leave: at(6, 43) },
    first: { title: 'Möten på jobbet', start: at(9), next: false, meetings: true },
    lastEnd: at(15, 30), homePlan: { trainDep: at(16, 4), home: at(17, 45) },
  }, on);
  assert.deepEqual(parts, [
    'Tåget sex femtiosju är två minuter försenat, så du bör gå sex fyrtiotre för att hinna i tid.',
    'Din första kalenderhändelse är möte klockan nio.',
    'Ditt sista möte för dagen slutar femton trettio, så du borde hinna med tåget sexton noll fyra, då är du hemma sjutton fyrtiofem.',
  ]);
  // I tid, nästa händelse, utan hemresa (ingen plan hittades) och med en minuts försening.
  const more = briefingParts({
    train: { dep: at(6, 57), delay: 0, leave: at(6, 43) }, first: { title: 'Tandläkare', start: at(10, 15), next: true, meetings: false }, lastEnd: at(15, 30),
  }, on);
  assert.deepEqual(more, ['Tåget sex femtiosju går i tid, så du bör gå sex fyrtiotre.', 'Din nästa kalenderhändelse är Tandläkare klockan tio femton.', 'Ditt sista möte för dagen slutar femton trettio.']);
  assert.match(briefingParts({ train: { dep: at(6, 57), delay: 1, leave: at(6, 43) } }, on)[0], /är en minut försenat/);
});

test('rapport: Ulrikas manus (bilresa med vägvarning, kvällens händelser, avslut)', () => {
  const on = sectionsOn(undefined, { vader: true, tag: false, pendlar: false, bil: true });
  const parts = briefingParts({
    car: { home: false, label: 'Västerås', minutes: 38, trafficMin: 2, warnings: 1 },
    evening: [{ title: 'Wilmer golf', start: at(17, 30) }, { title: 'Molly pianolektion', start: at(19, 30) }],
  }, on);
  assert.deepEqual(parts, [
    'Resan till Västerås ser ut att ta trettioåtta minuter, det finns en vägvarning för resan, den påverkar restiden med två minuter.',
    'Ikväll har Wilmer golf klockan sjutton trettio och Molly pianolektion klockan nitton trettio.',
    'Ha en trevlig dag.',
  ]);
  // Utan vägvarning men med trafik, utan trafik alls, hem och jobbet.
  assert.equal(briefingParts({ car: { home: false, label: 'Västerås', minutes: 38, trafficMin: 3, warnings: 0 } }, new Set(['bil']))[0], 'Resan till Västerås ser ut att ta trettioåtta minuter, trafiken ger tre minuter längre restid.');
  assert.equal(briefingParts({ car: { home: true, label: 'Hem', minutes: 1, trafficMin: 0, warnings: 2 } }, new Set(['bil']))[0], 'Resan hem ser ut att ta en minut, det finns två vägvarningar för resan.');
  assert.equal(briefingParts({ car: { home: false, label: 'Jobbet', minutes: 20, trafficMin: 0, warnings: 0 } }, new Set(['bil']))[0], 'Resan till jobbet ser ut att ta tjugo minuter.');
  // Hel timme får "klockan" och tankstreck mellan lag blir "mot".
  assert.equal(briefingParts({ evening: [{ title: 'Hammarby IF – IFK Göteborg', start: at(19) }] }, new Set(['kvall']))[0], 'Ikväll har Hammarby IF mot IFK Göteborg klockan nitton.');
  // Delar utan data hoppas över.
  assert.deepEqual(briefingParts({}, new Set(['tag', 'forsta', 'hemresa', 'bil', 'kvall'])), []);
});

test('rapport: delar väljs av BRIEFING eller efter vad hushållet har', () => {
  const has = { vader: true, tag: true, pendlar: true, bil: false };
  assert.deepEqual([...sectionsOn('kvall, avslut ,okänd', has)], ['kvall', 'avslut']);
  assert.deepEqual([...sectionsOn(undefined, has)], ['vader', 'tag', 'forsta', 'hemresa', 'kvall', 'avslut']);
  assert.deepEqual([...sectionsOn('', { vader: false, tag: false, pendlar: false, bil: true })], ['bil', 'kvall', 'avslut']);
});

test('rapport: dagens läge ur kalendern', () => {
  const ev = (id: string, title: string, s: number, e: number | null = null) => ({ id, title, start: s, end: e });
  const day = [ev('a', 'Frukostmöte', at(7), at(8)), ev('jobb@2026-11-23', 'Möten på jobbet', at(9), at(15, 30)), ev('b', 'Wilmer golf', at(17, 30)), ev('c', 'Pianolektion', at(19, 30)), { id: 'h', title: 'Heldag', start: null, end: null }];
  const early = todayPlan(day, at(6));
  assert.deepEqual(early.first, { title: 'Frukostmöte', start: at(7), next: false, meetings: false });
  assert.equal(early.lastEnd, at(15, 30));
  assert.deepEqual(early.evening, [{ title: 'Wilmer golf', start: at(17, 30) }, { title: 'Pianolektion', start: at(19, 30) }]);
  // Efter frukostmötet: nästa händelse är jobbmötena (heter möte). Efter sista mötet finns ingen sluttid kvar.
  const mid = todayPlan(day, at(8));
  assert.deepEqual(mid.first, { title: 'Möten på jobbet', start: at(9), next: true, meetings: true });
  assert.equal(todayPlan(day, at(16)).lastEnd, null);
  assert.equal(todayPlan(day, at(20)).first, null);
  assert.deepEqual(todayPlan([], at(6)), { first: null, lastEnd: null, evening: [] });
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

test('rapport: nyckeln till textadressen jämförs exakt', () => {
  assert.equal(keyOk('hemlig-nyckel', 'hemlig-nyckel'), true);
  assert.equal(keyOk('hemlig-nyckel', 'hemlig-nyckeL'), false);
  assert.equal(keyOk('kort', 'hemlig-nyckel'), false);
  assert.equal(keyOk('', 'hemlig-nyckel'), false);
  assert.equal(keyOk(null, 'hemlig-nyckel'), false);
  assert.equal(keyOk('x', undefined), false);
  assert.equal(keyOk('', ''), false);
  assert.equal(bearer('Bearer abc '), 'abc');
  assert.equal(bearer('Basic abc'), null);
  assert.equal(bearer(null), null);
});

test('rapport: bästa svenska rösten', () => {
  const v = (name: string, lang: string) => ({ name, lang });
  const list = [v('Samantha', 'en-US'), v('Alva', 'sv-SE'), v('Alva (Premium)', 'sv_SE'), v('Klara', 'sv-SE')];
  assert.equal(pickVoice(list)?.name, 'Alva (Premium)');
  assert.equal(pickVoice([v('Klara', 'sv-SE'), v('Siri röst 1', 'sv-SE')])?.name, 'Siri röst 1');
  assert.equal(pickVoice([v('Samantha', 'en-US'), v('Klara', 'sv-SE')])?.name, 'Klara');
  assert.equal(pickVoice([v('Samantha', 'en-US')]), null);
  assert.equal(pickVoice([]), null);
});
