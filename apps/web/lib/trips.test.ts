import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimAt, claimable, claimText, compensation, delayOf, fromRow, outcome, stats, type Ann, type Trip } from './trips.ts';

const iso = (h: number, m: number) => `2026-11-20T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+01:00`;
const t = (o: Partial<Trip> = {}): Trip => ({ ident: '8421', dep: Date.parse(iso(7, 12)), arr: Date.parse(iso(8, 5)), from: 'Et', to: 'Cst', product: 'Mälartåg', km: 109,
  actualArr: null, delayMin: 0, canceled: false, settled: true, claim: 'none', ...o });

test('delayOf: hela minuter, aldrig negativt', () => {
  assert.equal(delayOf(Date.parse(iso(8, 5)), Date.parse(iso(8, 31))), 26);
  assert.equal(delayOf(Date.parse(iso(8, 5)), Date.parse(iso(8, 4))), 0);
});

test('outcome: faktisk ankomst vid slutstationen, närmast planerad tid', () => {
  const anns: Ann[] = [
    { LocationSignature: 'Et', ActivityType: 'Avgang', AdvertisedTimeAtLocation: iso(7, 12), TimeAtLocation: iso(7, 13) },
    { LocationSignature: 'Cst', ActivityType: 'Ankomst', AdvertisedTimeAtLocation: iso(8, 5), TimeAtLocation: iso(8, 31) },
  ];
  assert.deepEqual(outcome(anns, 'Cst', Date.parse(iso(8, 5))), { actualArr: Date.parse(iso(8, 31)), canceled: false });
});

test('outcome: inställt, ej ankommet än och annan körning ger rätt svar', () => {
  assert.deepEqual(outcome([{ LocationSignature: 'Cst', ActivityType: 'Ankomst', AdvertisedTimeAtLocation: iso(8, 5), Canceled: true }], 'Cst', Date.parse(iso(8, 5))), { actualArr: null, canceled: true });
  assert.equal(outcome([{ LocationSignature: 'Cst', ActivityType: 'Ankomst', AdvertisedTimeAtLocation: iso(8, 5) }], 'Cst', Date.parse(iso(8, 5))), null);
  assert.equal(outcome([{ LocationSignature: 'Cst', ActivityType: 'Ankomst', AdvertisedTimeAtLocation: iso(9, 5), TimeAtLocation: iso(9, 6) }], 'Cst', Date.parse(iso(8, 5))), null);
});

test('stats: resor, mil, förseningar i tre nivåer och inställda', () => {
  const s = stats([t({ delayMin: 0 }), t({ delayMin: 8 }), t({ delayMin: 20 }), t({ delayMin: 44 }), t({ delayMin: null, settled: false }), t({ canceled: true, delayMin: null })]);
  assert.equal(s.trips, 6);
  assert.equal(s.canceled, 1);
  assert.equal(s.km, 545);
  assert.equal(s.mil, 54.5);
  assert.equal(s.known, 4);
  assert.equal(s.total, 72);
  assert.equal(s.avg, 18);
  assert.deepEqual([s.onTime, s.late, s.claimable], [1, 1, 2]);
});

test('stats: tom lista ger nollor', () => {
  const s = stats([]);
  assert.deepEqual([s.trips, s.mil, s.avg, s.total], [0, 0, 0, 0]);
});

test('claimable: från 20 min, inte inställda eller okända', () => {
  assert.equal(claimable(t({ delayMin: 19 })), false);
  assert.equal(claimable(t({ delayMin: 20 })), true);
  assert.equal(claimable(t({ delayMin: null })), false);
  assert.equal(claimable(t({ delayMin: 40, canceled: true })), false);
});

test('claimText: tåg, sträcka, datum och tider', () => {
  const x = claimText(t({ delayMin: 26, actualArr: Date.parse(iso(8, 31)) }));
  assert.match(x, /Mälartåg 8421, Eskilstuna C – Stockholm C/);
  assert.match(x, /Datum: 2026-11-20/);
  assert.match(x, /Planerad avgång: 07:12, planerad ankomst: 08:05/);
  assert.match(x, /Faktisk ankomst: 08:31 \(26 min försenad\)/);
});

test('fromRow: tolkar rad och okänd ersättningsstatus', () => {
  const r = fromRow({ ident: '1', dep: iso(7, 12), arr: iso(8, 5), from_sig: 'Et', to_sig: 'Cst', product: null, km: '109', actual_arr: null, delay_min: null, canceled: false, settled: false, claim: 'x' });
  assert.equal(r.claim, 'none');
  assert.equal(r.km, 109);
  assert.equal(r.actualArr, null);
});

test('ersättning Movingo: 50/75/100 % av snittpriset, SJ ansöks hos SJ', () => {
  const t = (delayMin: number, product = 'Mälartåg') => ({ ident: '10914', dep: 0, arr: 0, from: 'Et', to: 'Cst', product, km: 109, actualArr: null, delayMin, canceled: false, settled: true, claim: 'none' as const });
  const ticket = { type: '30' as const, price: 3000 };
  assert.deepEqual(compensation(t(19), ticket), { pct: 0, kr: null });
  assert.deepEqual(compensation(t(25), ticket), { pct: 50, kr: 50 });
  assert.deepEqual(compensation(t(45), ticket), { pct: 75, kr: 75 });
  assert.deepEqual(compensation(t(60), ticket), { pct: 100, kr: 100 });
  assert.deepEqual(compensation(t(60), { type: '30', price: null }), { pct: 100, kr: null });
  assert.equal(claimAt(t(30, 'SJ Regional')), 'sj');
  assert.equal(claimAt(t(30)), 'mt');
  assert.equal(claimAt(t(62, 'Snabbtåg tåg')), 'sj'); // SJ Snabbtåg (ResRobot), t.ex. tåg 523
  assert.equal(claimAt(t(30, 'Mälartåg')), 'mt');
  assert.equal(claimAt(t(30, 'Tåg i Bergslagen')), 'tib');
});

test('outcome: station med namn (Dagens resa) slås upp bland tågets stationer', () => {
  const t = (h: number, m: number) => `2026-11-25T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000+01:00`;
  const anns: Ann[] = [
    { LocationSignature: 'Hm', ActivityType: 'Ankomst', AdvertisedTimeAtLocation: t(11, 50), TimeAtLocation: t(11, 52) },
    { LocationSignature: 'Kc', ActivityType: 'Ankomst', AdvertisedTimeAtLocation: t(11, 56), TimeAtLocation: t(12, 3) },
  ];
  assert.deepEqual(outcome(anns, 'Kristianstad C', Date.parse(t(11, 56)), { Hm: 'Hässleholm C', Kc: 'Kristianstad' }), { actualArr: Date.parse(t(12, 3)), canceled: false });
  // Okänt namn: ankomsten med exakt planerad tid.
  assert.deepEqual(outcome(anns, 'Okänd', Date.parse(t(11, 50))), { actualArr: Date.parse(t(11, 52)), canceled: false });
  assert.equal(outcome(anns, 'Okänd', Date.parse(t(11, 45))), null);
});
