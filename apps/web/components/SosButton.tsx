'use client';
import { useRef, useState } from 'react';

import { runSos } from '@/app/actions/scene';

const HOLD_MS = 2000;

/**
 * SOS i menyn: håll inne i 2 sekunder (ringen fylls) så körs Homey-flowet SOS. Ett vanligt tryck gör inget,
 * så att den inte löses ut av misstag.
 */
export function SosButton() {
  const [phase, setPhase] = useState<'idle' | 'hold' | 'busy' | 'ok' | 'error'>('idle');
  const [msg, setMsg] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = () => {
    if (phase === 'busy') return;
    setMsg(undefined);
    setPhase('hold');
    timer.current = setTimeout(async () => {
      setPhase('busy');
      navigator.vibrate?.(200);
      const r = await runSos().catch(() => ({ ok: false, error: 'Kunde inte nå servern' }));
      setPhase(r.ok ? 'ok' : 'error');
      setMsg(r.ok ? 'SOS skickat' : r.error);
      setTimeout(() => { setPhase('idle'); setMsg(undefined); }, 8000);
    }, HOLD_MS);
  };
  const stop = () => { if (phase === 'hold') { clearTimeout(timer.current); setPhase('idle'); } };
  return (
    <div className="relative flex flex-1 justify-center md:flex-none">
      <button
        type="button"
        aria-label="SOS – håll inne i 2 sekunder"
        title="SOS – håll inne i 2 sekunder"
        onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative my-1 flex size-11 touch-none items-center justify-center rounded-full text-[13px] font-black tracking-wide text-white select-none ${
          phase === 'ok' ? 'bg-ok' : phase === 'busy' ? 'animate-pulse bg-danger' : 'bg-danger/85'}`}
      >
        {phase === 'hold' && (
          <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="22" cy="22" r="20" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="125.7" className="sos-ring" />
          </svg>
        )}
        SOS
      </button>
      {msg && (
        <p role="alert" className={`fixed bottom-24 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-[14px] px-4 py-3 text-[16px] font-semibold text-white shadow-2xl md:bottom-6 ${phase === 'ok' ? 'bg-ok' : 'bg-danger'}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
