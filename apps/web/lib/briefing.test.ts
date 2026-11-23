import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearer, keyOk } from './briefing-auth.ts';
import { batteryLabel, briefingParts, briefingText, closing, dayPart, greeting, homeSentences, joinList, parseClosings, schoolSentences, statusSentences, numWords, pickVoice, sectionsOn, speechChunks, spokenDate, spokenTime, tempPhrase, todayPlan, weatherPhrase } from './briefing.ts';

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
  // Match (Forza-titel): egen mening med "match mellan"; övriga händelser i listan före. Hel timme får "klockan".
  assert.deepEqual(briefingParts({ evening: [{ title: 'Hammarby IF – IFK Göteborg', start: at(19) }] }, new Set(['kvall'])), ['Ikväll klockan nitton är det match mellan Hammarby IF och IFK Göteborg.']);
  assert.deepEqual(briefingParts({ evening: [{ title: 'Wilmer golf', start: at(17, 30) }, { title: 'Hammarby IF – IFK Göteborg', start: at(19) }] }, new Set(['kvall'])),
    ['Ikväll har Wilmer golf klockan sjutton trettio.', 'Klockan nitton är det match mellan Hammarby IF och IFK Göteborg.']);
  assert.equal(briefingParts({ first: { title: 'Hammarby IF – IFK Göteborg', start: at(19), next: false, meetings: false } }, new Set(['forsta']))[0], 'Din första kalenderhändelse är match mellan Hammarby IF och IFK Göteborg klockan nitton.');
  // Vanliga titlar med bindestreck rörs inte.
  assert.equal(briefingParts({ evening: [{ title: 'Tandläkare - Karin', start: at(18) }] }, new Set(['kvall']))[0], 'Ikväll har Tandläkare - Karin klockan arton.');
  // Delar utan data hoppas över.
  assert.deepEqual(briefingParts({}, new Set(['tag', 'forsta', 'hemresa', 'bil', 'kvall'])), []);
});

test('rapport: delar väljs av BRIEFING eller efter vad hushållet har', () => {
  const has = { vader: true, tag: true, pendlar: true, bil: false };
  assert.deepEqual([...sectionsOn('kvall, avslut ,okänd', has)], ['kvall', 'avslut']);
  assert.deepEqual([...sectionsOn(undefined, has)], ['vader', 'tag', 'forsta', 'hemresa', 'kvall', 'avslut']);
  assert.deepEqual([...sectionsOn('', { vader: false, tag: false, pendlar: false, bil: true })], ['bil', 'kvall', 'avslut']);
  // Nästa händelse för alla med kalender (utan pendling), men hemresan bara för pendlare.
  assert.deepEqual([...sectionsOn(undefined, { vader: true, tag: false, pendlar: false, bil: true, kalender: true })], ['vader', 'forsta', 'bil', 'kvall', 'avslut']);
});

test('rapport: nästa händelse nämns inte två gånger när den är en av kvällens', () => {
  const on = sectionsOn(undefined, { vader: false, tag: false, pendlar: false, bil: false, kalender: true });
  const plan = todayPlan([{ id: 'a', title: 'Tandläkare', start: at(10), end: at(11) }, { id: 'b', title: 'Wilmer golf', start: at(17, 30), end: at(19) }], at(7));
  assert.deepEqual(briefingParts({ first: plan.first, evening: plan.evening }, on), ['Din första kalenderhändelse är Tandläkare klockan tio.', 'Ikväll har Wilmer golf klockan sjutton trettio.', 'Ha en trevlig dag.']);
  const late = todayPlan([{ id: 'b', title: 'Wilmer golf', start: at(17, 30), end: at(19) }], at(12));
  assert.deepEqual(briefingParts({ first: late.first, evening: late.evening }, on), ['Ikväll har Wilmer golf klockan sjutton trettio.', 'Ha en trevlig dag.']);
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

test('rapport: avslutet följer tiden på dygnet, med egna ord som val', () => {
  assert.deepEqual([at(4), at(7), at(17, 59), at(18), at(21, 59), at(22), at(2)].map(dayPart), ['dag', 'dag', 'dag', 'kvall', 'kvall', 'natt', 'natt']);
  assert.equal(closing(at(8)), 'Ha en trevlig dag.');
  assert.equal(closing(at(19)), 'Ha en bra kväll.');
  assert.equal(closing(at(23, 30)), 'Sov gott.');
  const own = parseClosings('dag=Ha en fin dag; kväll = Ha en härlig kväll ;natt=Sov gott och drömmer sött;okänd=x;dag2=;');
  assert.deepEqual(own, { dag: 'Ha en fin dag.', kvall: 'Ha en härlig kväll.', natt: 'Sov gott och drömmer sött.' });
  assert.equal(closing(at(19), own), 'Ha en härlig kväll.');
  assert.equal(closing(at(10), { kvall: 'x.' }), 'Ha en trevlig dag.');
  assert.deepEqual(parseClosings(undefined), {});
  assert.deepEqual(parseClosings('natt=Godnatt!'), { natt: 'Godnatt!' });
  // I rapporten: avslutet efter tid, och utan tid (som tidigare) dagens.
  const on = new Set(['avslut' as const]);
  assert.deepEqual(briefingParts({ now: at(20) }, on), ['Ha en bra kväll.']);
  assert.deepEqual(briefingParts({ now: at(23) }, on), ['Sov gott.']);
  assert.deepEqual(briefingParts({ now: at(23), closings: { natt: 'Godnatt.' } }, on), ['Godnatt.']);
  assert.deepEqual(briefingParts({}, on), ['Ha en trevlig dag.']);
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

test('rapport: barnens skolstart i en mening (idag/imorgon, sorterat, samma tid ihop)', () => {
  const day = (h1: number, m1: number, h2: number, m2: number) => ({ start: at(h1, m1), end: at(h2, m2) });
  const wilmer = { name: 'Wilmer', today: day(8, 0, 14, 55), tomorrow: day(8, 10, 16, 10) };
  const molly = { name: 'Molly', today: day(8, 30, 15, 45), tomorrow: day(9, 0, 15, 0) };
  assert.deepEqual(schoolSentences([wilmer], at(6, 12)), ['Idag börjar Wilmer klockan åtta.']);
  assert.deepEqual(schoolSentences([wilmer, molly], at(6, 12)), ['Idag börjar Wilmer klockan åtta och Molly klockan åtta trettio.']);
  // Sorterat på starttid, även om Molly står först i listan. Samma start ihop.
  assert.deepEqual(schoolSentences([molly, wilmer], at(6, 12)), ['Idag börjar Wilmer klockan åtta och Molly klockan åtta trettio.']);
  assert.deepEqual(schoolSentences([wilmer, { ...molly, today: day(8, 0, 15, 45) }], at(6, 12)), ['Idag börjar Wilmer och Molly klockan åtta.']);
  // Pågår: den som börjat slutar; den som inte börjat börjar.
  assert.deepEqual(schoolSentences([wilmer], at(10, 0)), ['Wilmer slutar klockan fjorton femtiofem.']);
  assert.deepEqual(schoolSentences([wilmer, molly], at(8, 10)), ['Idag börjar Molly klockan åtta trettio.', 'Wilmer slutar klockan fjorton femtiofem.']);
  assert.deepEqual(schoolSentences([wilmer, { ...molly, today: day(8, 0, 14, 55) }], at(10, 0)), ['Wilmer och Molly slutar klockan fjorton femtiofem.']);
  // Skolan är slut: inget på dagen, imorgon från klockan 16 (och bara när alla är klara för dagen).
  assert.deepEqual(schoolSentences([wilmer], at(15, 30)), []);
  assert.deepEqual(schoolSentences([wilmer, molly], at(19, 0)), ['Imorgon börjar Wilmer klockan åtta tio och Molly klockan nio.']);
  assert.deepEqual(schoolSentences([wilmer, molly], at(16, 30)), ['Imorgon börjar Wilmer klockan åtta tio och Molly klockan nio.']);
  assert.deepEqual(schoolSentences([wilmer, { ...molly, today: day(8, 30, 17, 30) }], at(16, 30)), ['Molly slutar klockan sjutton trettio.']);
  assert.deepEqual(schoolSentences([{ name: 'Wilmer', today: null, tomorrow: null }], at(18, 0)), []);
  // I rapporten: skolan kommer efter bilen och före hemmet, och bara om delen är på.
  const on = sectionsOn(undefined, { vader: false, tag: false, pendlar: false, bil: false, hemma: true, skola: true });
  assert.deepEqual([...on], ['skola', 'hemma', 'kvall', 'avslut']);
  assert.equal(briefingParts({ school: [wilmer], now: at(6, 12) }, on)[0], 'Idag börjar Wilmer klockan åtta.');
  assert.deepEqual(briefingParts({ school: [wilmer], now: at(6, 12) }, new Set(['kvall'])), []);
});

test('rapport: hemmet (lampor, temperatur, vilka som är hemma, internet, fukt och larm)', () => {
  const base = { me: 'Fredrik', lightsOn: 13, lightsTotal: 20, tempAvg: 22.7, people: [{ name: 'Ulrika', present: true }, { name: 'Fredrik', present: true }, { name: 'Molly', present: false }],
    internet: 'ok' as const, humidity: { measured: true, damp: [] }, batteries: ['din klocka'] };
  assert.deepEqual(homeSentences(base), [
    'Hemma lyser tretton lampor och det är tjugotre grader i snitt.',
    'Ulrika och du är hemma.',
    'Det är dåligt batteri i din klocka.',
    'Internet och fuktnivåerna är ok.',
  ]);
  // Bara du, släckt, en lampa, hög fukt, nere, flera batterier, inga larm.
  assert.equal(homeSentences({ ...base, people: [{ name: 'Fredrik', present: true }] })[1], 'Du är hemma.');
  assert.equal(homeSentences({ ...base, people: [{ name: 'Ulrika', present: true }, { name: 'Molly', present: true }, { name: 'Fredrik', present: true }] })[1], 'Ulrika, Molly och du är hemma.');
  assert.equal(homeSentences({ ...base, people: [{ name: 'Ulrika', present: true }, { name: 'Fredrik', present: false }] })[1], 'Ulrika är hemma.');
  assert.equal(homeSentences({ ...base, people: [{ name: 'Ulrika', present: false }] })[1], 'Ingen är hemma.');
  assert.equal(homeSentences({ ...base, lightsOn: 0 })[0], 'Hemma är alla lampor släckta och det är tjugotre grader i snitt.');
  assert.equal(homeSentences({ ...base, lightsOn: 1, tempAvg: null })[0], 'Hemma lyser en lampa.');
  assert.equal(homeSentences({ ...base, lightsTotal: 0, lightsOn: 0 })[0], 'Hemma är det tjugotre grader i snitt.');
  assert.deepEqual(homeSentences({ ...base, internet: 'down', humidity: { measured: true, damp: ['Badrum', 'Tvättstuga'] }, batteries: [] }).slice(2), ['Internet är nere och fuktnivåerna är höga i Badrum och Tvättstuga.', 'Inga larm.']);
  assert.deepEqual(homeSentences({ ...base, batteries: ['a', 'b', 'c'] }).slice(2), ['Det är dåligt batteri i tre enheter.', 'Internet och fuktnivåerna är ok.']);
  assert.deepEqual(homeSentences({ ...base, batteries: ['din klocka', 'Dörrsensor hall'] }).slice(2), ['Det är dåligt batteri i din klocka och Dörrsensor hall.', 'Internet och fuktnivåerna är ok.']);
  // Utan data hoppas delarna över.
  assert.deepEqual(homeSentences({ me: 'Fredrik', lightsOn: 0, lightsTotal: 0, tempAvg: null, people: [], internet: null, humidity: { measured: false, damp: [] }, batteries: null }), []);
  assert.deepEqual(homeSentences({ me: 'Ulrika', lightsOn: 2, lightsTotal: 5, tempAvg: null, people: [], internet: 'unknown', humidity: { measured: false, damp: [] }, batteries: null }), ['Hemma lyser två lampor.']);
  // Klockor: din, någon annans, okänd; andra enheter med sitt namn.
  assert.equal(batteryLabel('Apple Watch - Apple Watch för Fredrik', 'Fredrik', ['Ulrika']), 'din klocka');
  assert.equal(batteryLabel('Apple Watch för Ulrika', 'Fredrik', ['Ulrika']), 'Ulrikas klocka');
  assert.equal(batteryLabel('Apple Watch', 'Fredrik', ['Ulrika']), 'en klocka');
  assert.equal(batteryLabel(' Dörrsensor hall ', 'Fredrik'), 'Dörrsensor hall');
  // I rapporten: hemmet kommer före kvällen och bara om delen är på.
  const on = sectionsOn(undefined, { vader: false, tag: false, pendlar: false, bil: false, hemma: true });
  assert.deepEqual([...on], ['hemma', 'kvall', 'avslut']);
  const parts = briefingParts({ home: base, evening: [{ title: 'Golf', start: at(17, 30) }] }, on);
  assert.equal(parts[0], 'Hemma lyser tretton lampor och det är tjugotre grader i snitt.');
  assert.equal(parts.at(-2), 'Ikväll har Golf klockan sjutton trettio.');
  assert.equal(briefingParts({ home: base }, sectionsOn('kvall', { vader: false, tag: false, pendlar: false, bil: false, hemma: true })).length, 0);
});

test('rapport: status (internet, fukt, larm) med problemen först', () => {
  const ok = { internet: 'ok' as const, humidity: { measured: true, damp: [] as string[] }, batteries: [] as string[] | null };
  assert.deepEqual(statusSentences(ok), ['Allt fungerar som det ska: internet, fuktnivåerna och inga larm.']);
  assert.deepEqual(statusSentences({ ...ok, batteries: ['din klocka'] }), ['Det är dåligt batteri i din klocka.', 'Internet och fuktnivåerna är ok.']);
  assert.deepEqual(statusSentences({ ...ok, internet: 'down', humidity: { measured: true, damp: ['Badrum'] }, batteries: ['din klocka'] }),
    ['Internet är nere, fuktnivåerna är höga i Badrum och det är dåligt batteri i din klocka.']);
  assert.deepEqual(statusSentences({ ...ok, internet: 'slow' }), ['Internet är långsamt.', 'Fuktnivåerna är ok och inga larm.']);
  // Delar utan data nämns inte.
  assert.deepEqual(statusSentences({ ...ok, humidity: { measured: false, damp: [] } }), ['Internet fungerar och inga larm.']);
  assert.deepEqual(statusSentences({ internet: 'ok', humidity: { measured: false, damp: [] }, batteries: null }), ['Internet fungerar.']);
  assert.deepEqual(statusSentences({ internet: 'unknown', humidity: { measured: true, damp: [] }, batteries: null }), ['Fuktnivåerna är ok.']);
  assert.deepEqual(statusSentences({ internet: null, humidity: { measured: false, damp: [] }, batteries: [] }), ['Inga larm.']);
  assert.deepEqual(statusSentences({ internet: null, humidity: { measured: false, damp: [] }, batteries: null }), []);
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
