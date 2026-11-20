import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLatLon, pickStart } from './startpoint.ts';

const home = { lat: 59.376, lon: 16.5097 };
const station = { lat: 59.369482, lon: 16.505193 };
const job = { lat: 59.3326, lon: 18.0649 };
const nearStation = { lat: 59.372, lon: 16.515 };

test('parseLatLon: giltiga tal, intervall och noggrannhet', () => {
  assert.deepEqual(parseLatLon('59.37', '16.5'), { lat: 59.37, lon: 16.5 });
  assert.equal(parseLatLon(null, '16.5'), null);
  assert.equal(parseLatLon('', ''), null);
  assert.equal(parseLatLon('abc', '16.5'), null);
  assert.equal(parseLatLon('91', '16.5'), null);
  assert.equal(parseLatLon('59', '181'), null);
  assert.equal(parseLatLon('59.37', '16.5', '1500'), null);
  assert.deepEqual(parseLatLon('59.37', '16.5', '40'), { lat: 59.37, lon: 16.5 });
});

test('pickStart: mobilen går före Life360', () => {
  const s = pickStart([{ at: nearStation, src: 'phone' }, { at: { lat: 59.38, lon: 16.52 }, src: 'life360' }], home, station, true);
  assert.deepEqual(s, { at: nearStation, src: 'phone' });
});

test('pickStart: Life360 när mobilen saknas', () => {
  const s = pickStart([{ at: null, src: 'phone' }, { at: nearStation, src: 'life360' }], home, station, true);
  assert.deepEqual(s, { at: nearStation, src: 'life360' });
});

test('pickStart: hemma (inom 150 m) ger hemmet', () => {
  const s = pickStart([{ at: { lat: 59.3762, lon: 16.5099 }, src: 'phone' }], home, station, true);
  assert.deepEqual(s, { at: home, src: 'home' });
});

test('pickStart: för långt bort hoppar till nästa kandidat, annars null', () => {
  const far = { lat: 59.9, lon: 17.6 };
  assert.deepEqual(pickStart([{ at: far, src: 'phone' }, { at: nearStation, src: 'life360' }], home, station, true), { at: nearStation, src: 'life360' });
  assert.equal(pickStart([{ at: far, src: 'phone' }], home, station, true), null);
  assert.equal(pickStart([], home, station, true), null);
});

test('pickStart: hemvägen räknas från jobbet, inte stationen', () => {
  const s = pickStart([{ at: { lat: 59.34, lon: 18.07 }, src: 'phone' }], home, job, false);
  assert.equal(s?.src, 'phone');
  assert.equal(pickStart([{ at: { lat: 59.34, lon: 18.07 }, src: 'phone' }], home, station, true), null);
});
