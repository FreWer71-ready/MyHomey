import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildLocate, shortName, whereText, type LocCap } from './locate.ts';

const c = (device_id: string, capability_id: string, v: number | boolean | string): LocCap => ({
  device_id, capability_id, last_updated: '2026-11-15T18:00:00Z',
  value_num: typeof v === 'number' ? v : null, value_bool: typeof v === 'boolean' ? v : null, value_text: typeof v === 'string' ? v : null,
});

test('namn på Hitta-prylar', () => {
  assert.equal(shortName('Apple Watch Series 11 - Apple Watch för Fredrik'), 'Apple Watch för Fredrik');
  assert.equal(shortName('AirPods Pro (3rd generation) - Fredrik’s AirPods'), "Fredrik's AirPods");
});

test('Life360 och Hitta tolkas', () => {
  const { members, items } = buildLocate(
    [
      { id: 'u', name: 'Ulrika Svensson', driver_id: 'homey:app:com.lrvdlinden.life360:member' },
      { id: 'f', name: 'Fredrik W', driver_id: 'homey:app:com.lrvdlinden.life360:member' },
      { id: 'w', name: 'X - Klocka', driver_id: 'homey:app:com.apple.findmy:apple-device' },
      { id: 'a', name: 'X - Lurar', driver_id: 'homey:app:com.apple.findmy:apple-device' },
    ],
    [
      c('u', 'life360_place', 'Hem'), c('u', 'measure_battery', 73),
      c('f', 'life360_place', ''), c('f', 'life360_address', 'Kungsgatan 1, Stockholm'), c('f', 'life360_driving', true), c('f', 'life360_speed', 82.4),
      c('w', 'alarm_is_home', true), c('w', 'measure_battery', 3), c('w', 'alarm_battery', true), c('w', 'send_sound', false),
      c('a', 'alarm_is_home', false), c('a', 'measure_distance', 16.05),
    ],
  );
  assert.deepEqual(members.map((m) => [m.first, m.home]), [['Fredrik', false], ['Ulrika', true]]);
  assert.equal(whereText(members[0]), 'kör 82 km/h');
  assert.equal(whereText(members[1]), null);
  assert.deepEqual(items.map((i) => [i.name, i.lowBattery, i.canSound]), [['Klocka', true, true], ['Lurar', false, false]]);
  assert.equal(items[1].km, 16.05);
});
