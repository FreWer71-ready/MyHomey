import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMet, summarizeWeather, symbolInfo } from './weather.ts';

const t0 = Date.parse('2026-11-11T18:00:00Z');
const ts = (h: number, symbol: string, precip: number) => ({
  time: new Date(t0 + h * 3600_000).toISOString(),
  data: { instant: { details: { air_temperature: 2 + h } }, next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: precip } } },
});

test('tolkar MET och hittar nederbörd', () => {
  const hours = parseMet({ properties: { timeseries: [ts(0, 'cloudy', 0), ts(1, 'cloudy', 0), ts(2, 'lightrain', 0.4), ts(5, 'rain', 1)] } });
  const s = summarizeWeather(hours, t0 + 10 * 60_000)!;
  assert.equal(s.current.symbol, 'cloudy');
  assert.equal(s.nextPrecip!.time, t0 + 2 * 3600_000);
  assert.equal(s.rainSoon, true);
  assert.equal(summarizeWeather(hours, t0 + 4 * 3600_000)!.rainSoon, true);
  assert.equal(summarizeWeather(parseMet({ properties: { timeseries: [ts(0, 'clearsky_night', 0)] } }), t0)!.rainSoon, false);
});

test('symboler', () => {
  assert.deepEqual(symbolInfo('lightrainshowers_day'), { icon: 'rain', label: 'Regnskurar', wet: true });
  assert.equal(symbolInfo('clearsky_night').icon, 'moon');
  assert.equal(symbolInfo('partlycloudy_day').label, 'Halvklart');
  assert.equal(symbolInfo('heavysleet').icon, 'snow');
});
