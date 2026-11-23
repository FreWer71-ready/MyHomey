// Fotbollsmatcher från Forza (https://api.forzafootball.net/v1/teams/<id>/matches) som kalenderhändelser.
// API:t svarar i MessagePack (inget JSON-läge). Matcherna görs om till iCal-text, så att de går genom samma
// kalenderkedja som övriga kalendrar. Lag anges i FORZA_TEAMS="11413" (kommaseparerade id, bara siffror).
import { decodeMsgpack } from './msgpack.ts';

export const FORZA_API = 'https://api.forzafootball.net/v1/teams';

/** FORZA_TEAMS → lag-id. Bara siffror släpps igenom (id:t går in i adressen). */
export const forzaTeams = (raw: string | undefined): string[] => (raw ?? '').split(/[\s,]+/).filter((x) => /^\d{1,9}$/.test(x));

type Team = { name?: string };
type Match = {
  id?: number; status?: string; kickoff_at?: Date | string | null; kickoff_time_tbd?: boolean;
  home_team?: Team; away_team?: Team; score?: { current?: number[] | null } | null;
  match_time?: { length?: number | null } | null; stadium?: { name?: string } | null; tournament?: { name?: string } | null;
};

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const OFF = new Set(['cancelled', 'canceled', 'postponed', 'abandoned', 'suspended']);

/**
 * Matchlistan (avkodad) → iCal. Titel "Hemmalag – Bortalag", spelade matcher med resultat ("Hemmalag 1–2 Bortalag").
 * Längd: speltid + 25 min (paus och tillägg). Okänd avsparkstid ger en heldagshändelse. Inställda matcher markeras.
 */
export function forzaToIcs(data: unknown): string {
  const matches = (data as { matches?: Match[] } | null)?.matches ?? [];
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//myhomey//forza//'];
  for (const m of matches) {
    const start = m.kickoff_at ? new Date(m.kickoff_at) : null;
    if (m.id == null || !start || Number.isNaN(start.getTime())) continue;
    const home = m.home_team?.name ?? '?', away = m.away_team?.name ?? '?';
    const score = m.status === 'after' && Array.isArray(m.score?.current) && m.score!.current!.length === 2 ? m.score!.current! : null;
    const title = score ? `${home} ${score[0]}–${score[1]} ${away}` : `${home} – ${away}`;
    out.push('BEGIN:VEVENT', `UID:forza-${m.id}@forza`, `DTSTAMP:${stamp(start)}`);
    if (m.kickoff_time_tbd) out.push(`DTSTART;VALUE=DATE:${dateOnly(start)}`, `DTEND;VALUE=DATE:${dateOnly(new Date(start.getTime() + 86400_000))}`);
    else out.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + ((m.match_time?.length ?? 90) + 25) * 60_000))}`);
    out.push(`SUMMARY:${esc(title)}`);
    if (m.stadium?.name) out.push(`LOCATION:${esc(m.stadium.name)}`);
    if (m.tournament?.name) out.push(`DESCRIPTION:${esc(m.tournament.name)}`);
    if (OFF.has((m.status ?? '').toLowerCase())) out.push('STATUS:CANCELLED');
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

/** Hämtar och gör om ett lags matcher (ingen Accept-rubrik: då får vi MessagePack). */
export async function forzaIcsFromResponse(res: Response): Promise<string> {
  return forzaToIcs(decodeMsgpack(new Uint8Array(await res.arrayBuffer())));
}
