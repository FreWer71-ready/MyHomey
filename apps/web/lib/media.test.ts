import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowPlaying, type MediaCap } from './media.ts';

const c = (device_id: string, capability_id: string, v: string | boolean): MediaCap => ({
  device_id, capability_id, value_bool: typeof v === 'boolean' ? v : null, value_text: typeof v === 'string' ? v : null,
});

test('spelas nu: TV och musik, pausade sist, tomma döljs', () => {
  const devices = [{ id: 'tv', name: 'Google TV ' }, { id: 'hub', name: 'Nest hub' }, { id: 'x', name: 'Tom' }];
  const caps = [
    c('tv', 'speaker_playing', true), c('tv', 'speaker_track', 'Låt'), c('tv', 'speaker_artist', 'Artist'), c('tv', 'speaker_album', ''),
    c('hub', 'speaker_playing', false), c('hub', 'speaker_track', 'Spotify'),
    c('x', 'speaker_playing', true), c('x', 'speaker_track', ' '),
  ];
  assert.deepEqual(nowPlaying(devices, caps), [
    { id: 'tv', device: 'Google TV', kind: 'tv', playing: true, title: 'Låt', subtitle: 'Artist' },
    { id: 'hub', device: 'Nest hub', kind: 'music', playing: false, title: 'Spotify', subtitle: null },
  ]);
  assert.equal(nowPlaying(devices, [c('tv', 'speaker_playing', true), c('tv', 'speaker_track', 'A'), c('tv', 'speaker_artist', 'A')])[0].subtitle, null);
});
