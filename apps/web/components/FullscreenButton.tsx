'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

/**
 * Helskärm (döljer Chromes adressfält) och håller skärmen tänd medan sidan visas.
 * Webbläsare tillåter bara helskärm efter ett tryck, därför en knapp.
 */
export function FullscreenButton() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);

    let lock: WakeLockSentinel | null = null;
    const keepAwake = async () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // T.ex. batterisparläge: skärmen släcks som vanligt.
      }
    };
    keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('visibilitychange', keepAwake);
      lock?.release().catch(() => {});
    };
  }, []);

  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={full ? 'Avsluta helskärm' : 'Helskärm'}
      className="flex w-full flex-col items-center gap-1 rounded-[18px] py-2.5 text-[12px] font-bold text-dim"
    >
      <Icon name={full ? 'shrink' : 'expand'} size={24} />
      {full ? 'Avsluta' : 'Helskärm'}
    </button>
  );
}
