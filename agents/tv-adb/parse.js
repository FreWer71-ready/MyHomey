// Tolkning av ADB-utdata (dumpsys). Rena funktioner, inga sidoeffekter – testas i parse.test.js.

/** Skärmen/enheten vaken? `dumpsys power`: mWakefulness=Awake|Asleep|Dreaming|Dozing. Faller tillbaka på Display Power. */
export function parsePower(out) {
  const wake = out.match(/mWakefulness=(\w+)/)?.[1];
  if (wake) return wake === 'Awake';
  const display = out.match(/Display Power: state=(\w+)/)?.[1];
  return display ? display === 'ON' : false;
}

/** Appen i förgrunden (package) ur `dumpsys activity activities` och/eller `dumpsys window` (flera Android-versioner). */
export function parseForegroundApp(out) {
  // Ordning: aktiv aktivitet först (stabilast på Android 12–14), sedan fönsterfokus.
  const patterns = [
    /(?:mResumedActivity|topResumedActivity|ResumedActivity)[:=][^\n]*?\s([a-zA-Z][\w.]+)\/[\w.$]+/,
    /mCurrentFocus=Window\{[^}]*?\s([a-zA-Z][\w.]+)\/[\w.$]+\}/,
    /mFocusedApp=[^\n]*?\s([a-zA-Z][\w.]+)\/[\w.$]+/,
    /mFocusedWindow=Window\{[^}]*?\s([a-zA-Z][\w.]+)\/[\w.$]+/,
    /mTopFullscreenOpaqueWindowState=Window\{[^}]*?\s([a-zA-Z][\w.]+)\/[\w.$]+/,
  ];
  for (const re of patterns) {
    const m = out.match(re);
    if (m) return m[1];
  }
  return null;
}

const STATES = { 0: 'none', 1: 'stopped', 2: 'paused', 3: 'playing', 6: 'buffering', 8: 'buffering' };
const clean = (s) => {
  const v = (s ?? '').trim();
  return v && v !== 'null' ? v : null;
};

/**
 * Mediasessioner ur `dumpsys media_session`. Varje session börjar med en rad "<namn> <package>/<tag> (userId=0)"
 * och innehåller bl.a. "package=", "active=", "state=PlaybackState {state=3, ...}" och "metadata: size=N, description=Titel, Undertitel, Beskrivning".
 */
export function parseMediaSessions(out) {
  const sessions = [];
  const blocks = out.split(/\n(?=\s{2,6}\S[^\n]*\(userId=\d+\)\s*$)/m);
  for (const b of blocks) {
    const pkg = b.match(/\bpackage=([\w.]+)/)?.[1];
    if (!pkg) continue;
    // Äldre Android: state=3. Android 13+: state=PLAYING(3).
    const state = Number(b.match(/state=PlaybackState \{state=(?:[A-Z_]+\()?(\d+)/)?.[1] ?? NaN);
    const desc = b.match(/metadata:[^\n]*description=([^\n]*)/)?.[1] ?? '';
    // description = "Titel, Undertitel, Beskrivning". Undertiteln kan innehålla kommatecken (flera artister),
    // så första delen är titeln, sista beskrivningen och allt däremellan undertiteln.
    const parts = desc.split(', ');
    const title = parts[0];
    const subtitle = parts.length > 2 ? parts.slice(1, -1).join(', ') : parts[1];
    sessions.push({
      package: pkg,
      active: /\bactive=true\b/.test(b),
      status: STATES[state] ?? 'none',
      title: clean(title),
      artist: clean(subtitle?.split(', ').filter((x) => x !== 'null').join(', ')),
    });
  }
  return sessions;
}

/**
 * Bästa sessionen: det som spelar (vilken app som helst), annars appen i förgrunden om den är pausad.
 * En pausad session i bakgrunden (t.ex. Spotify från i morse) visas inte.
 */
export function pickSession(sessions, foreground) {
  const rank = { playing: 0, buffering: 1, paused: 2 };
  return sessions
    .filter((s) => s.status === 'playing' || s.status === 'buffering' || (s.status === 'paused' && s.package === foreground))
    .sort((a, b) => rank[a.status] - rank[b.status] || Number(b.package === foreground) - Number(a.package === foreground) || Number(!!b.title) - Number(!!a.title))[0] ?? null;
}

/** Läsbara appnamn för vanliga TV-appar; annars sista delen av package-namnet. */
const APPS = {
  'com.netflix.ninja': 'Netflix',
  'com.google.android.youtube.tv': 'YouTube',
  'com.google.android.youtube.tvmusic': 'YouTube Music',
  'se.svt.svtplay.android': 'SVT Play',
  'se.svt.android.svtplay': 'SVT Play',
  'com.svt.play': 'SVT Play',
  'se.tv4.tv4playtab': 'TV4 Play',
  'se.tv4.tv4play': 'TV4 Play',
  'com.disney.disneyplus': 'Disney+',
  'com.hbo.hbonow': 'Max',
  'com.wbd.stream': 'Max',
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.spotify.tv.android': 'Spotify',
  'com.apple.atve.androidtv.appletv': 'Apple TV',
  'com.viaplay.android': 'Viaplay',
  'com.plexapp.android': 'Plex',
  'com.teliasonera.telia.playplus': 'Telia Play',
  'se.telia.play': 'Telia Play',
  'com.cmore.android': 'TV4 Play',
  'com.google.android.youtube.tvkids': 'YouTube Kids',
  'com.google.android.apps.tv.launcherx': 'Startsida',
  'com.google.android.tvlauncher': 'Startsida',
};
export function appName(pkg) {
  if (!pkg) return null;
  if (APPS[pkg]) return APPS[pkg];
  const last = pkg.split('.').filter((p) => !['android', 'tv', 'app', 'com', 'se'].includes(p)).at(-1) ?? pkg;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** Samlat tillstånd som skickas till dashboarden. */
export function buildState({ power, window, media }) {
  const isOn = parsePower(power);
  const app = isOn ? parseForegroundApp(window) : null;
  const s = isOn ? pickSession(parseMediaSessions(media), app) : null;
  return {
    is_on: isOn,
    current_app: s?.package ?? app,
    app_name: appName(s?.package ?? app),
    media_title: s?.title ?? null,
    media_artist: s?.artist ?? null,
    media_status: s?.status ?? 'none',
  };
}
