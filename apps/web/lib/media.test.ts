import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowPlaying, type MediaCap } from './media.ts';

const c = (device_id: string, capability_id: string, v: string | boolean): MediaCap => ({
  device_id, capability_id, value_bool: typeof v === 'boolean' ? v : null, value_text: typeof v === 'string' ? v : null,
});

test('spelas nu: bara det som spelar, pausat och tomt döljs', () => {
  const devices = [{ id: 'tv', name: 'Google TV ' }, { id: 'hub', name: 'Nest hub' }, { id: 'x', name: 'Tom' }];
  const caps = [
    c('tv', 'speaker_playing', true), c('tv', 'speaker_track', 'Låt'), c('tv', 'speaker_artist', 'Artist'), c('tv', 'speaker_album', ''),
    c('hub', 'speaker_playing', false), c('hub', 'speaker_track', 'Spotify'),
    c('x', 'speaker_playing', true), c('x', 'speaker_track', ' '),
  ];
  assert.deepEqual(nowPlaying(devices, caps), [
    { id: 'tv', device: 'Google TV', kind: 'tv', playing: true, title: 'Låt', subtitle: 'Artist' },
  ]);
  assert.equal(nowPlaying(devices, [c('tv', 'speaker_playing', true), c('tv', 'speaker_track', 'A'), c('tv', 'speaker_artist', 'A')])[0].subtitle, null);
});

test('spelas nu: inaktiv status och gamla värden döljs', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const devices = [{ id: 'a', name: 'Nest hub' }, { id: 'b', name: 'Google TV' }];
  const t = (id: string, cap: string, v: string | boolean, at: string) => ({ ...c(id, cap, v), last_updated: at });
  const caps = [
    t('a', 'speaker_playing', true, '2026-11-12T11:00:00Z'), t('a', 'speaker_track', 'Idle', '2026-11-12T11:00:00Z'),
    t('b', 'speaker_playing', true, '2026-11-10T20:54:00Z'), t('b', 'speaker_track', 'Gammal låt', '2026-11-10T20:54:00Z'),
  ];
  assert.deepEqual(nowPlaying(devices, caps, now), []);
});

import { tvRemote } from './media.ts';

test('tv-fjärr: TV, Google TV och soundbar i samma rum', () => {
  const devices = [
    { id: 'tv', name: 'Samsung The Frame 75', class: 'tv', zone_id: 'v', driver_id: 'homey:app:com.smartthings:tv' },
    { id: 'gtv', name: 'Google TV vardagsrum ', class: 'speaker', zone_id: 'v', driver_id: 'homey:app:com.google.chromecast:cast' },
    { id: 'bar', name: 'Citation Bar', class: 'speaker', zone_id: 'v', driver_id: 'homey:app:com.google.chromecast:cast' },
    { id: 'hub', name: 'Nest hub', class: 'speaker', zone_id: 'k', driver_id: 'homey:app:com.google.chromecast:cast' },
  ];
  const c = (device_id: string, capability_id: string, value_bool: boolean | null, value_num: number | null = null) => ({ device_id, capability_id, value_bool, value_num });
  const r = tvRemote(devices, [c('tv', 'onoff', true), c('gtv', 'speaker_playing', true), c('bar', 'volume_set', null, 0.3)]);
  assert.deepEqual(r, {
    zone: 'v', tv: { id: 'tv', name: 'Samsung The Frame 75', on: true },
    cast: { id: 'gtv', playing: true, muted: false }, bar: { id: 'bar', volume: 0.3, muted: false },
  });
  assert.equal(tvRemote(devices.slice(1), []), null);
});

import { tvAppLabel } from './media.ts';
test('tv-appnamn: Playplus blir Telia Play', () => {
  assert.equal(tvAppLabel('Playplus'), 'Telia Play');
  assert.equal(tvAppLabel('Netflix'), 'Netflix');
  assert.equal(tvAppLabel(null), null);
});
