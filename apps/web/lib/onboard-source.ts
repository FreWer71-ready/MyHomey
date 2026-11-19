import 'server-only';
import { createClient } from './supabase/server';
import { matchTrain, pairReadings, parsePoint, type OnTrain, type Pos, type TrainPos } from './onboard.ts';

/** Tåg (GPS) nära positionen via edge-funktionen trafik, matchat mot positionen (bara `allowed`). Null om inget passar eller vid fel. */
export async function detectTrain(pos: Pos | null, now = Date.now(), allowed?: Set<string>): Promise<OnTrain | null> {
  if (!pos) return null;
  if (pos.src === 'life360' && pos.speed != null && pos.speed < 20) return null;
  try {
    const sb = await createClient();
    const { data, error } = await sb.functions.invoke('trafik', { body: { near: [Number(pos.at.lon.toFixed(4)), Number(pos.at.lat.toFixed(4))] } });
    if (error || !data?.trains) return null;
    const trains: TrainPos[] = (data.trains as { Train?: { AdvertisedTrainNumber?: string }; Position?: { WGS84?: string }; TimeStamp?: string; Speed?: number }[])
      .flatMap((t) => {
        const at = parsePoint(t.Position?.WGS84 ?? '');
        return at && t.Train?.AdvertisedTrainNumber && t.TimeStamp
          ? [{ train: t.Train.AdvertisedTrainNumber, at, ts: Date.parse(t.TimeStamp), speed: t.Speed ?? null }] : [];
      });
    return matchTrain(pos, trains, now, allowed);
  } catch {
    return null;
  }
}

/** Positionshistorik sedan `since` (tabellen readings): visar att man var vid stationen även när man har lämnat den. */
export async function positionHistory(devices: { id: string; src: Pos['src'] }[], since: number): Promise<Pos[]> {
  if (!devices.length) return [];
  try {
    const sb = await createClient();
    const { data } = await sb.from('readings').select('device_id,capability_id,ts,value')
      .in('device_id', devices.map((d) => d.id))
      .in('capability_id', ['life360_latitude', 'life360_longitude', 'measure_latitude', 'measure_longitude'])
      .gte('ts', new Date(since).toISOString()).order('ts', { ascending: true }).limit(1000);
    return pairReadings((data ?? []) as never, devices);
  } catch {
    return [];
  }
}
