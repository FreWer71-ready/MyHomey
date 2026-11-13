import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appName, buildState, parseForegroundApp, parseMediaSessions, parsePower, pickSession } from './parse.js';

const MEDIA = `MEDIA SESSION SERVICE (dumpsys media_session)

Sessions Stack - have 2 sessions:
    NetflixMediaSession com.netflix.ninja/NetflixMediaSession (userId=0)
      ownerPid=4567, ownerUid=10087, userId=0
      package=com.netflix.ninja
      launchIntent=null
      mediaButtonReceiver=null
      active=true
      flags=3
      rating type=0
      controllers: 1
      state=PlaybackState {state=3, position=1234567, buffered position=0, speed=1.0, updated=98765, actions=3669, custom actions=[], active item id=-1, error=null}
      audioAttrs=AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_MOVIE flags=0x800 tags= bundle=null
      volumeType=1, controlType=2, max=100, current=24
      metadata: size=7, description=Stranger Things, S4:E1 "Chapter One: The Hellfire Club", null
      queueTitle=null, size=0
    MusicSession com.spotify.tv.android/spotify-media-session (userId=0)
      package=com.spotify.tv.android
      active=false
      state=PlaybackState {state=2, position=0, buffered position=0, speed=0.0, updated=1, actions=0, custom actions=[], active item id=-1, error=null}
      metadata: size=5, description=Yellow, Coldplay, Parachutes
`;

test('ström: vaken, sover och reserv', () => {
  assert.equal(parsePower('  mWakefulness=Awake\n'), true);
  assert.equal(parsePower('  mWakefulness=Asleep\n'), false);
  assert.equal(parsePower('Display Power: state=ON'), true);
  assert.equal(parsePower(''), false);
});

test('app i förgrunden: window och activity', () => {
  assert.equal(parseForegroundApp('  mCurrentFocus=Window{1a2b3c u0 com.netflix.ninja/com.netflix.ninja.MainActivity}'), 'com.netflix.ninja');
  assert.equal(parseForegroundApp('  mFocusedApp=ActivityRecord{77 u0 se.svt.svtplay.android/.MainActivity t12}'), 'se.svt.svtplay.android');
  assert.equal(parseForegroundApp('    mResumedActivity: ActivityRecord{88 u0 com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity t3}'), 'com.google.android.youtube.tv');
  assert.equal(parseForegroundApp('  ResumedActivity: ActivityRecord{4f u0 com.google.android.apps.tv.launcherx/com.google.android.apps.tv.launcherx.home.HomeActivity t2}'), 'com.google.android.apps.tv.launcherx');
  assert.equal(parseForegroundApp('  mFocusedWindow=Window{9 u0 com.netflix.ninja/com.netflix.ninja.MainActivity}'), 'com.netflix.ninja');
  assert.equal(parseForegroundApp('ingen'), null);
});

test('mediasessioner: titel, undertitel och status', () => {
  const s = parseMediaSessions(MEDIA);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { package: 'com.netflix.ninja', active: true, status: 'playing', title: 'Stranger Things', artist: 'S4:E1 "Chapter One: The Hellfire Club"' });
  assert.deepEqual(s[1], { package: 'com.spotify.tv.android', active: false, status: 'paused', title: 'Yellow', artist: 'Coldplay' });
  assert.equal(pickSession(s, 'com.spotify.tv.android').package, 'com.netflix.ninja'); // spelar slår pausad
  assert.equal(pickSession([s[1]], 'com.netflix.ninja'), null); // pausad i bakgrunden visas inte
});

test('samlat tillstånd och appnamn', () => {
  const state = buildState({ power: 'mWakefulness=Awake', window: 'mCurrentFocus=Window{1 u0 com.netflix.ninja/x.Main}', media: MEDIA });
  assert.deepEqual(state, { is_on: true, current_app: 'com.netflix.ninja', app_name: 'Netflix', media_title: 'Stranger Things', media_artist: 'S4:E1 "Chapter One: The Hellfire Club"', media_status: 'playing' });
  assert.deepEqual(buildState({ power: 'mWakefulness=Asleep', window: '', media: MEDIA }), { is_on: false, current_app: null, app_name: null, media_title: null, media_artist: null, media_status: 'none' });
  assert.equal(appName('com.example.tv.coolplayer'), 'Coolplayer');
});

test('Android 13+: state=PLAYING(3) och titel', () => {
  const out = `    session com.netflix.ninja/NetflixMediaSession (userId=0)
      package=com.netflix.ninja
      active=true
      state=PlaybackState {state=PLAYING(3), position=1000, buffered position=0, speed=1.0, updated=5, actions=0, custom actions=[], active item id=-1, error=null}
      metadata: size=4, description=Wednesday, Avsnitt 1, null`;
  const [s] = parseMediaSessions(out);
  assert.deepEqual([s.status, s.title, s.artist], ['playing', 'Wednesday', 'Avsnitt 1']);
});

test('riktig utskrift från Google TV (Android 14)', () => {
  const out = `    a com.netflix.ninja/x (userId=0)
      package=com.netflix.ninja
      state=PlaybackState {state=STOPPED(1), position=0, buffered position=0, speed=1.0, updated=1, actions=1049468, custom actions=[], active item id=-1, error=null}
    b com.spotify.tv.android/y (userId=0)
      package=com.spotify.tv.android
      state=PlaybackState {state=PAUSED(2), position=22756, buffered position=0, speed=0.0, updated=2, actions=3125244, custom actions=[], active item id=0, error=null}
      metadata: size=22, description=feelslikeimfallinginlove - Zerb x Coldplay, Coldplay, Zerb, null
    c com.teliasonera.telia.playplus/z (userId=0)
      package=com.teliasonera.telia.playplus
      state=PlaybackState {state=PAUSED(2), position=-1, buffered position=-1, speed=0.0, updated=3, actions=17029, custom actions=[], active item id=-1, error=null}`;
  const all = parseMediaSessions(out);
  assert.deepEqual(all[1], { package: 'com.spotify.tv.android', active: false, status: 'paused', title: 'feelslikeimfallinginlove - Zerb x Coldplay', artist: 'Coldplay, Zerb' });
  assert.equal(pickSession(all, 'com.netflix.ninja'), null); // Netflix stoppad, Spotify pausad i bakgrunden
  assert.equal(pickSession(all, 'com.teliasonera.telia.playplus').package, 'com.teliasonera.telia.playplus');
  assert.equal(appName('com.teliasonera.telia.playplus'), 'Telia Play');
});
