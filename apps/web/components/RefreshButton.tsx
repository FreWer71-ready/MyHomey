'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';

/** Hämtar om sidans data utan att lämna helskärm (fungerar även i installerad app). */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    if (!pending) {
      const t = setTimeout(() => setSpin(false), 400);
      return () => clearTimeout(t);
    }
  }, [pending]);

  const refresh = () => {
    setSpin(true);
    start(() => router.refresh());
  };

  return (
    <button
      type="button"
      onClick={refresh}
      aria-label="Uppdatera"
      aria-busy={pending}
      className={`flex flex-1 flex-col items-center gap-1 rounded-[18px] py-2.5 text-[12px] font-bold text-dim md:w-full md:flex-none`}
    >
      <Icon name="refresh" size={24} className={spin ? 'animate-spin' : ''} />
      Uppdatera
    </button>
  );
}
