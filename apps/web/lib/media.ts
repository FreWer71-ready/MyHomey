// Spelas nu: mediaspelare (Google TV, högtalare) ur speaker_*-capabilities. Ren logik.

export type MediaCap = { device_id: string; capability_id: string; value_bool: boolean | null; value_text: string | null; last_updated?: string };
export type MediaDevice = { id: string; name: string };
export type NowPlaying = { id: string; device: string; kind: 'tv' | 'music'; playing: boolean; title: string; subtitle: string | null };

export const MEDIA_CAPS = ['speaker_playing', 'speaker_track', 'speaker_artist', 'speaker_album'];

/** Spelare som rapporterar status i stället för en titel. */
const IDLE = /^(idle|ready to cast|ready|backdrop|standby|inaktiv)$/i;
/** "Spelar" som inte ändrats på så här länge räknas som fastnat (t.ex. Homey som missat stoppet). */
const STUCK_HOURS = 6;

/** Bara det som spelas just nu (pausat, tomt och inaktivt döljs). TV i namnet = TV. Artist = spår visas bara en gång. */
export function nowPlaying(devices: MediaDevice[], caps: MediaCap[], now = Date.now()): NowPlaying[] {
  const text = (id: string, cap: string) => caps.find((c) => c.device_id === id && c.capability_id === cap)?.value_text?.trim() || null;
  return devices.flatMap((d) => {
    const playing = caps.find((c) => c.device_id === d.id && c.capability_id === 'speaker_playing')?.value_bool === true;
    const track = text(d.id, 'speaker_track');
    const play = caps.find((c) => c.device_id === d.id && c.capability_id === 'speaker_playing');
    const changed = [play?.last_updated, caps.find((c) => c.device_id === d.id && c.capability_id === 'speaker_track')?.last_updated]
      .filter((x): x is string => !!x).sort().at(-1);
    const stuck = !!changed && now - Date.parse(changed) > STUCK_HOURS * 3600_000;
    if (!playing || !track || IDLE.test(track) || stuck) return [];
    const extra = [text(d.id, 'speaker_artist'), text(d.id, 'speaker_album')].filter((x): x is string => !!x && x !== track);
    const kind = /\btv\b/i.test(d.name) ? ('tv' as const) : ('music' as const);
    return [{ id: d.id, device: d.name.trim(), kind, playing, title: track, subtitle: extra.length ? [...new Set(extra)].join(' · ') : null }];
  }).sort((a, b) => Number(b.playing) - Number(a.playing));
}

// ---- TV-fjärr: TV (SmartThings i Homey), Google TV (Chromecast) och soundbar (Chromecast) ----

export type TvDevice = { id: string; name: string; class: string | null; zone_id: string | null; driver_id?: string | null };
export type TvCap = { device_id: string; capability_id: string; value_bool: boolean | null; value_num: number | null };
export type TvRemote = {
  zone: string | null;
  tv: { id: string; name: string; on: boolean } | null;
  /** Google TV-boxen: play/paus och ljud av. */
  cast: { id: string; playing: boolean; muted: boolean } | null;
  /** Soundbaren (t.ex. Harman Kardon Citation via Chromecast): exakt volym. */
  bar: { id: string; volume: number | null; muted: boolean } | null;
};

export const TV_CAPS = ['onoff', 'volume_set', 'volume_mute', 'speaker_playing'];
const BAR = /citation|soundbar|harman|sonos|beam|arc/i;

/** Plockar ihop TV, Google TV och soundbar i samma rum. Null om ingen TV finns. */
export function tvRemote(devices: TvDevice[], caps: TvCap[]): TvRemote | null {
  const val = (id: string, cap: string) => caps.find((c) => c.device_id === id && c.capability_id === cap);
  const tv = devices.find((d) => d.class === 'tv');
  if (!tv) return null;
  const same = (d: TvDevice) => d.zone_id === tv.zone_id || !tv.zone_id;
  const speakers = devices.filter((d) => d.class === 'speaker' && same(d) && /chromecast/i.test(d.driver_id ?? 'chromecast'));
  const bar = speakers.find((d) => BAR.test(d.name));
  const cast = speakers.find((d) => d !== bar && /\btv\b/i.test(d.name));
  return {
    zone: tv.zone_id,
    tv: { id: tv.id, name: tv.name.trim(), on: val(tv.id, 'onoff')?.value_bool === true },
    cast: cast ? { id: cast.id, playing: val(cast.id, 'speaker_playing')?.value_bool === true, muted: val(cast.id, 'volume_mute')?.value_bool === true } : null,
    bar: bar ? { id: bar.id, volume: val(bar.id, 'volume_set')?.value_num ?? null, muted: val(bar.id, 'volume_mute')?.value_bool === true } : null,
  };
}

/** Appnamn som TV-agenten kan skicka i rå form (package-namnets sista del) → namnet folk känner igen. */
const TV_APP_NAMES: Record<string, string> = {
  playplus: 'Telia Play',
  'com.teliasonera.telia.playplus': 'Telia Play',
  ninja: 'Netflix',
  tv4play: 'TV4 Play',
  svtplay: 'SVT Play',
  disneyplus: 'Disney+',
  livingroom: 'Prime Video',
};
export const tvAppLabel = (name: string | null | undefined) => (name ? TV_APP_NAMES[name.trim().toLowerCase()] ?? name : name ?? null);
