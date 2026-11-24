// Tidsgräns och stoppur för servern. Ren logik (testas i timing.test.ts).

/**
 * Svarar med `fallback` om `p` inte hunnit klart inom `ms` eller felar, så en seg källa aldrig håller upp mer än `ms`.
 * `onLate` anropas högst en gång när fallback används. Det som är långsamt fortsätter i bakgrunden (och hamnar i cachen).
 */
export function withDeadline<T, F>(p: Promise<T>, ms: number, fallback: F, onLate?: () => void): Promise<T | F> {
  return new Promise((resolve) => {
    let done = false;
    const end = (v: T | F, late: boolean) => { if (done) return; done = true; clearTimeout(timer); if (late) onLate?.(); resolve(v); };
    const timer = setTimeout(() => end(fallback, true), ms);
    p.then((v) => end(v, false), () => end(fallback, true));
  });
}

/** Stoppur för loggrader: `lap(namn, löfte)` noterar när varje del blev klar (ms sedan start), `line()` ger "hem=120 vader=300 totalt=900". */
export function stopwatch(now: () => number = Date.now) {
  const t0 = now();
  const laps: string[] = [];
  return {
    lap<T>(name: string, p: Promise<T>): Promise<T> {
      const done = () => { laps.push(`${name}=${now() - t0}`); };
      p.then(done, done);
      return p;
    },
    /** Noterar att ett steg i en kedja är klart (ms sedan start). */
    mark(name: string) { laps.push(`${name}=${now() - t0}`); },
    line: () => [...laps, `totalt=${now() - t0}`].join(' '),
  };
}

/**
 * Minne som visar utgånget direkt och uppdaterar efter svaret: ett färskt värde (yngre än `ttl`) ges direkt; ett utgånget (yngre än
 * `maxStale`) också, och uppdateras då via `later` (t.ex. Next `after`, alltså efter att sidan svarat); annars (inget eller för gammalt)
 * får anroparen vänta. Samtidiga anrop för samma nyckel delar en enda körning av `build`, och bara värden (inte null) sparas.
 */
export function staleWhileRevalidate<K, T>(
  build: (key: K) => Promise<T | null>,
  o: { ttl: number; maxStale: number; later: (job: () => Promise<unknown>) => void; keyOf?: (k: K) => string; now?: () => number },
): (key: K) => Promise<T | null> {
  const memo = new Map<string, { at: number; v: T }>();
  const inflight = new Map<string, Promise<T | null>>();
  const now = o.now ?? Date.now;
  const keyOf = o.keyOf ?? String;
  const run = (k: K, id: string) => {
    let p = inflight.get(id);
    if (!p) {
      p = build(k).then((v) => { if (v != null) memo.set(id, { at: now(), v }); return v; }).finally(() => { inflight.delete(id); });
      inflight.set(id, p);
    }
    return p;
  };
  return async (k) => {
    const id = keyOf(k), hit = memo.get(id), age = hit ? now() - hit.at : Infinity;
    if (hit && age < o.ttl) return hit.v;
    if (hit && age < o.maxStale) { o.later(() => run(k, id).catch(() => null)); return hit.v; }
    return run(k, id);
  };
}
