import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractHits, svDate, toItems } from './municipal.ts';

const html = `<script>AppRegistry.registerInitialState('12.4606',{"filterOptions":{},"hits":[
 {"id":"a","url":"/d/a","startDate":"10 november 2026","endDate":"24 november 2026","title":"Avstängning av Storgatan","tags":[{"name":"vägar","title":"vägar"},{"name":"torshälla","title":"Torshälla"}]},
 {"id":"b","url":"/d/b","startDate":"14 oktober 2026","endDate":"31 december 2026","title":"Avstängning av Klostergatan","tags":[{"name":"trafik","title":"trafik"},{"name":"munktellstaden-norr","title":"Munktellstaden / Norr"}]},
 {"id":"c","url":"/d/c","startDate":"1 september 2026","endDate":"1 oktober 2026","title":"Gammalt ärende vid Slagsta","tags":[]}
],"total":3});</script>`;

test('svenskt datum', () => {
  assert.equal(new Date(svDate('10 november 2026')! + 3600_000).toISOString().slice(0, 10), '2026-11-10');
  assert.equal(svDate('okänt'), null);
});

test('egna först, avslutade bort, område och länk', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const items = toItems([...extractHits(html), ...extractHits(html)], 'munktellstaden-norr', [], now);
  assert.deepEqual(items.map((i) => [i.id, i.mine]), [['b', true], ['a', false]]);
  assert.equal(items[0].area, 'Munktellstaden / Norr');
  assert.equal(items[1].url, 'https://www.eskilstuna.se/d/a');
  // Ordmatchning i titeln (Ulrika: Slagsta), men c är avslutat.
  assert.equal(toItems(extractHits(html), null, ['Slagsta'], now).some((i) => i.mine), false);
});
