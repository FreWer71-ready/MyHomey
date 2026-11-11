import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, fmtDuration } from './timeline.ts';

const since = Date.parse('2026-11-11T00:00:00Z');
const now = since + 10 * 3600_000; // 10 h
const at = (h: number) => new Date(since + h * 3600_000).toISOString();

test('segment, tänd tid och läget just nu', () => {
  const rooms = buildTimeline(
    [
      { device_id: 'a', ts: at(0), value: 1 }, // tänd från start (läget före perioden)
      { device_id: 'a', ts: at(2), value: 0 },
      { device_id: 'a', ts: at(8), value: 1 }, // tänd till nu
      { device_id: 'b', ts: at(1), value: 0 },
    ],
    [
      { id: 'a', name: 'Tak', zone_id: 'v', class: 'light', available: true },
      { id: 'b', name: 'Golv', zone_id: 'v', class: 'light', available: true },
      { id: 's', name: 'Uttag', zone_id: 'v', class: 'socket', available: true },
    ],
    [{ id: 'v', name: 'Vardagsrum', parent_id: 'r' }],
    since, now,
  );
  assert.equal(rooms.length, 1);
  const tak = rooms[0].lamps.find((l) => l.name === 'Tak')!;
  assert.deepEqual(tak.segments, [{ left: 0, width: 20 }, { left: 80, width: 20 }]);
  assert.equal(tak.onMinutes, 240);
  assert.equal(tak.onNow, true);
  assert.equal(rooms[0].lamps.find((l) => l.name === 'Golv')!.onMinutes, 0);
});

test('varaktighet', () => {
  assert.equal(fmtDuration(45), '45 min');
  assert.equal(fmtDuration(120), '2 h');
  assert.equal(fmtDuration(135), '2 h 15 min');
});
