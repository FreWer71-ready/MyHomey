import Link from 'next/link';
import { TrendArrow } from './TrendArrow';
import type { Room } from '@/lib/home';
import { fmtPercent, fmtTemp, heatTint } from '@/lib/scale';
import { Icon } from './Icon';
import { SceneButtons } from './SceneButtons';

export function RoomTile({ room }: { room: Room }) {
  return (
    // Lika höga rutor: namn överst, värden i mitten, lampknappar alltid längst ner.
    <div className="flex h-full min-h-[118px] flex-col justify-between gap-1.5 overflow-hidden rounded-[20px] p-2.5" style={{ background: heatTint(room.temp) }}>
      <Link href={`/rum/${room.id}`} className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-glass-hi">
            <Icon name={room.icon} size={18} />
          </span>
          <span className="min-w-0 grow truncate text-[17px] font-extrabold">{room.name}</span>
        </span>
        <span className="flex items-center gap-2.5">
          {room.temp != null && (
            <span className="text-[26px] leading-none font-extrabold tracking-tight">{fmtTemp(room.temp)}<TrendArrow trend={room.tempTrend} /></span>
          )}
          {room.humidity != null && (
            <span className="flex items-center gap-0.5 font-extrabold text-fg">
              <Icon name="drop" size={16} />
              {fmtPercent(room.humidity)}
            </span>
          )}
          {room.lightsOn > 0 && (
            <span className="ml-auto flex items-center gap-0.5 rounded-full bg-deep px-2 py-1 text-sm font-extrabold text-sun">
              <Icon name="bulb" size={14} />
              {room.lightsOn}
            </span>
          )}
        </span>
      </Link>
      {room.lights.length > 0 && <SceneButtons zoneId={room.id} room={room.name} size="icon" />}
    </div>
  );
}
