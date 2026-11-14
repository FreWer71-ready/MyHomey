'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { allLightsOff } from '@/app/actions/scene';
import { Icon } from './Icon';

/** Stor "Släck alla"-knapp. Skickar av till alla tända lampor och laddar om vyn. */
export function AllOffButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  const none = ids.length === 0;
  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        type="button"
        disabled={none || busy}
        onClick={() => start(async () => {
          const r = await allLightsOff(ids);
          setMsg(r.ok ? undefined : r.error);
          setTimeout(() => router.refresh(), 1500);
        })}
        className="flex h-14 items-center justify-center gap-2.5 rounded-[16px] bg-fg px-6 text-[18px] font-semibold text-ground disabled:bg-white/10 disabled:text-dim"
      >
        <Icon name="powerLine" size={22} />
        {busy ? 'Släcker …' : none ? 'Allt är släckt' : `Släck alla (${ids.length})`}
      </button>
      {msg && <p role="alert" className="text-[15px] text-danger">{msg}</p>}
    </div>
  );
}
