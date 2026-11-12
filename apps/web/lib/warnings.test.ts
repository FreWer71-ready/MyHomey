import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smhiWarnings, storms, vmas } from './warnings.ts';

const AREA = /Södermanland|Eskilstuna/i;

test('SMHI: gul och uppåt i området, meddelanden och andra län bort, allvarligast först', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const w = (id: number, code: string, area: string, end = '2026-11-13T00:00:00Z') => ({
    id, warningAreas: [{ id, approximateStart: '2026-11-12T15:00:00Z', approximateEnd: end, areaName: { sv: area }, warningLevel: { code }, eventDescription: { sv: `Händelse ${id}` }, affectedAreas: [{ sv: area }] }],
  });
  const r = smhiWarnings([w(1, 'YELLOW', 'Södermanlands län'), w(2, 'MESSAGE', 'Södermanlands län'), w(3, 'RED', 'Skåne län'), w(4, 'ORANGE', 'Eskilstuna kommun'), w(5, 'RED', 'Södermanlands län', '2026-11-12T10:00:00Z')], AREA, now);
  assert.deepEqual(r.map((x) => [x.event, x.level]), [['Händelse 4', 'orange'], ['Händelse 1', 'yellow']]);
});

test('VMA: området eller hela landet', () => {
  const r = vmas([
    { Identifier: 'a', Headline: 'Brand', Area: [{ Type: 'County', Description: 'Södermanlands län' }] },
    { Identifier: 'b', Headline: 'Gas', Area: [{ Type: 'County', Description: 'Skåne län' }] },
    { Identifier: 'c', Headline: 'Signal', Area: [{ Type: 'Country', Description: 'Sverige' }] },
  ], AREA);
  assert.deepEqual(r.map((x) => x.id), ['a', 'c']);
});

test('oväder ur prognosen inom 24 h', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const h = (dt: number, o: object) => ({ time: now + dt * 3600_000, symbol: 'cloudy', precip: 0, temp: 2, ...o });
  const r = storms([h(1, { gust: 9 }), h(3, { gust: 18 }), h(5, { symbol: 'rainandthunder', precip: 5 }), h(30, { gust: 25 })], now);
  assert.deepEqual(r.map((x) => x.kind), ['gust', 'thunder', 'rain']);
  assert.equal(r[0].label, 'Hårda vindbyar 18 m/s');
});
