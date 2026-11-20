'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTrip, setClaim } from '@/app/actions/trips';
import { CLAIMS, CLAIM_LABEL, type Claim } from '@/lib/trips';

/** Ersättningsstatus för en resa: fyra val, det aktiva markerat. */
export function ClaimChips({ ident, dep, claim }: { ident: string; dep: number; claim: Claim }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [fail, setFail] = useState(false);
  return (
    <div role="group" aria-label="Ersättningsstatus" className={`flex flex-wrap gap-1.5 ${busy ? 'animate-pulse' : ''}`}>
      {CLAIMS.map((c) => (
        <button key={c} type="button" disabled={busy} aria-pressed={c === claim}
          onClick={() => start(async () => { const r = await setClaim(ident, dep, c); setFail(!r.ok); if (r.ok) router.refresh(); })}
          className={`pill h-9 px-3 text-[0.875rem] ${c === claim ? 'on' : ''}`}>
          {CLAIM_LABEL[c]}
        </button>
      ))}
      {fail && <span className="self-center text-[0.875rem] text-danger">Försök igen</span>}
    </div>
  );
}

/** Kopierar underlaget till urklipp, så att det kan klistras in i ersättningsformuläret. */
export function CopyClaim({ text }: { text: string }) {
  const [done, setDone] = useState<'ok' | 'fail' | null>(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone('ok'); } catch { setDone('fail'); }
    setTimeout(() => setDone(null), 2500);
  };
  return <button type="button" onClick={copy} className="pill h-9 w-fit px-3 text-[0.875rem]">{done === 'ok' ? 'Kopierat ✓' : done === 'fail' ? 'Kunde inte kopiera' : 'Kopiera underlag'}</button>;
}

/** Tar bort en sparad resa (efter bekräftelse). */
export function DeleteTrip({ ident, dep }: { ident: string; dep: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button type="button" disabled={busy} aria-label={`Ta bort resan, tåg ${ident}`}
      onClick={() => { if (confirm('Ta bort resan?')) start(async () => { const r = await deleteTrip(ident, dep); if (r.ok) router.refresh(); }); }}
      className={`pill size-9 justify-center !px-0 text-[0.875rem] ${busy ? 'animate-pulse' : ''}`}>✕</button>
  );
}
