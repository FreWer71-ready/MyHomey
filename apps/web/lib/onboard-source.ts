import 'server-only';
import { createClient } from './supabase/server';
import { matchTrain, parsePoint, type OnTrain, type Pos, type TrainPos } from './onboard.ts';

/** Tåg (GPS) nära positionen via edge-funktionen trafik, matchat mot positionen. Null om inget tåg passar eller vid fel. */
export async function detectTrain(pos: Pos | null, now = Date.now()): Promise<OnTrain | null> {
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
    return matchTrain(pos, trains, now);
  } catch {
    return null;
  }
}
