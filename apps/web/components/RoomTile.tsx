import Link from 'next/link';
import type { Room } from '@/lib/home';
import { fmtPercent, fmtTemp, heatTint } from '@/lib/scale';
import { Icon } from './Icon';
import { SceneButtons } from './SceneButtons';

export function RoomTile({ room }: { room: Room }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] p-3" style={{ background: heatTint(room.temp) }}>
      <Link href={`/rum/${room.id}`} className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-glass-hi">
            <Icon name={room.icon} size={20} />
          </span>
          <span className="min-w-0 grow truncate text-lg font-extrabold">{room.name}</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span className={`leading-none font-extrabold tracking-tight ${room.tempStale ? 'text-lg text-dim' : 'text-[28px]'}`}>{fmtTemp(room.temp, room.tempStale)}</span>
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
