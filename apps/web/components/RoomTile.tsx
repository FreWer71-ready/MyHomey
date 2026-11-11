import Link from 'next/link';
import type { Room } from '@/lib/home';
import { fmtPercent, fmtTemp, heatColor } from '@/lib/scale';
import { Icon } from './Icon';
import { SceneButtons } from './SceneButtons';

export function RoomTile({ room }: { room: Room }) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] p-3" style={{ background: heatColor(room.temp) }}>
      <Link href={`/rum/${room.id}`} className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/65">
            <Icon name={room.icon} size={20} />
          </span>
          <span className="min-w-0 grow truncate text-lg font-extrabold">{room.name}</span>
        </span>
        <span className="flex items-center gap-2.5">
          <span className="text-[28px] leading-none font-extrabold tracking-tight">{fmtTemp(room.temp)}</span>
          {room.humidity != null && (
            <span className="flex items-center gap-0.5 font-extrabold text-[#0B4F8A]">
              <Icon name="drop" size={16} />
              {fmtPercent(room.humidity)}
            </span>
          )}
          {room.lightsOn > 0 && (
            <span className="ml-auto flex items-center gap-0.5 rounded-full bg-ink px-2 py-1 text-sm font-extrabold text-sun">
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
