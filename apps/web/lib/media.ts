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
