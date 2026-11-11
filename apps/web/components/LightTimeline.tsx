import type { RoomLines } from '@/lib/timeline';
import { fmtDuration } from '@/lib/timeline';

const TZ = 'Europe/Stockholm';

/** Tidsmarkeringar: var 3:e timme på ett dygn, annars per dag/vecka. */
function ticks(since: number, now: number) {
  const hours = (now - since) / 3600_000;
  const step = hours <= 4 ? 1800_000 : hours <= 12 ? 2 * 3600_000 : hours <= 24 ? 3 * 3600_000 : hours <= 24 * 7 ? 24 * 3600_000 : 5 * 24 * 3600_000;
  const out: { left: number; label: string }[] = [];
  for (let t = Math.ceil(since / step) * step; t < now; t += step) {
    const d = new Date(t);
    out.push({
      left: ((t - since) / (now - since)) * 100,
      label: hours <= 24
        ? d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
        : d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', timeZone: TZ }),
    });
  }
  return out;
}

export function LightTimeline({ rooms, since, now }: { rooms: RoomLines[]; since: number; now: number }) {
  const marks = ticks(since, now);
  if (!rooms.length) {
    return <p className="rounded-[28px] glass p-10 text-center text-lg font-bold text-dim">Inga lampor med historik än.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {rooms.map((room) => (
        <section key={room.name} className="rounded-[28px] glass p-5">
          <h2 className="mb-3 text-xl font-extrabold">{room.name}</h2>
          <div className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-x-4 gap-y-2.5">
            <span />
            <div className="relative h-5 text-xs font-bold text-dim" aria-hidden="true">
              {marks.map((m) => (
                <span key={m.left} className="absolute -translate-x-1/2" style={{ left: `${m.left}%` }}>{m.label}</span>
              ))}
            </div>
            <span />
            {room.lamps.map((l) => (
              <div key={l.id} className="contents">
                <span className="flex items-center gap-2 truncate font-bold">
                  <span className={`size-3 shrink-0 rounded-full ${l.onNow ? 'bg-sun' : 'bg-line'}`} />
                  <span className="truncate">{l.name}</span>
                </span>
                <div
                  className="relative h-8 overflow-hidden rounded-xl bg-glass-2"
                  role="img"
                  aria-label={`${l.name}: tänd ${fmtDuration(l.onMinutes)}`}
                >
                  {marks.map((m) => (
                    <span key={m.left} className="absolute inset-y-0 w-px bg-line" style={{ left: `${m.left}%` }} />
                  ))}
                  {l.segments.map((s, i) => (
                    <span
                      key={i}
                      className="absolute inset-y-1 rounded-md bg-sun"
                      style={{ left: `${s.left}%`, width: `max(${s.width}%, 3px)` }}
                    />
                  ))}
                </div>
                <span className="w-24 text-right text-sm font-extrabold">{fmtDuration(l.onMinutes)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
