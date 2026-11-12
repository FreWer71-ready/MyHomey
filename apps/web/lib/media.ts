// Spelas nu: mediaspelare (Google TV, högtalare) ur speaker_*-capabilities. Ren logik.

export type MediaCap = { device_id: string; capability_id: string; value_bool: boolean | null; value_text: string | null };
export type MediaDevice = { id: string; name: string };
export type NowPlaying = { id: string; device: string; kind: 'tv' | 'music'; playing: boolean; title: string; subtitle: string | null };

export const MEDIA_CAPS = ['speaker_playing', 'speaker_track', 'speaker_artist', 'speaker_album'];

/** Det som spelas eller är pausat (tomma spår döljs). TV i namnet = TV. Artist = spår visas bara en gång. */
export function nowPlaying(devices: MediaDevice[], caps: MediaCap[]): NowPlaying[] {
  const text = (id: string, cap: string) => caps.find((c) => c.device_id === id && c.capability_id === cap)?.value_text?.trim() || null;
  return devices.flatMap((d) => {
    const playing = caps.find((c) => c.device_id === d.id && c.capability_id === 'speaker_playing')?.value_bool === true;
    const track = text(d.id, 'speaker_track');
    if (!track) return [];
    const extra = [text(d.id, 'speaker_artist'), text(d.id, 'speaker_album')].filter((x): x is string => !!x && x !== track);
    const kind = /\btv\b/i.test(d.name) ? ('tv' as const) : ('music' as const);
    return [{ id: d.id, device: d.name.trim(), kind, playing, title: track, subtitle: extra.length ? [...new Set(extra)].join(' · ') : null }];
  }).sort((a, b) => Number(b.playing) - Number(a.playing));
}
