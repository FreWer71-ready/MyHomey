'use client';
import { useEffect, useRef, useState } from 'react';

/** span: rutnätsklasser för kortets storlek (t.ex. 'col-span-2 lg:row-span-2'). Kort byter bara plats med kort av samma storlek. */
export type SortItem = { id: string; node: React.ReactNode; span?: string };

/** Sparad ordning först, nya kort sist, borttagna ignoreras. */
export function mergeOrder(saved: string[], ids: string[]): string[] {
  return [...saved.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.includes(id))];
}

const read = (key: string): string[] | null => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};
const write = (key: string, order: string[] | null) => {
  try {
    if (order) localStorage.setItem(key, JSON.stringify(order));
    else localStorage.removeItem(key);
  } catch {
    /* privat läge m.m.: ordningen gäller bara tills sidan laddas om */
  }
};

/**
 * Kortrad som går att sortera: håll inne ett kort ~0,5 s för att börja, dra till ny plats, tryck Klar.
 * Fungerar med finger och mus (pointer events). Ordningen sparas per enhet (localStorage).
 */
export function SortableCards({ items, storageKey, className, style }: { items: SortItem[]; storageKey: string; className: string; style?: React.CSSProperties }) {
  const ids = items.map((i) => i.id);
  const [order, setOrder] = useState(ids);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const press = useRef<{ t: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const saved = read(storageKey);
    setOrder(saved ? mergeOrder(saved, ids) : ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, ids.join('|')]);

  const sorted = mergeOrder(order, ids).map((id) => items.find((i) => i.id === id)!);

  // Långt tryck startar redigering (kortets länk/knapp gör sitt vid vanligt tryck).
  const startPress = (e: React.PointerEvent) => {
    if (edit) return;
    press.current = { x: e.clientX, y: e.clientY, t: setTimeout(() => { suppressClick.current = true; setEdit(true); navigator.vibrate?.(30); }, 550) };
  };
  const cancelPress = (e?: React.PointerEvent) => {
    if (!press.current) return;
    if (e && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) < 10 && e.type === 'pointermove') return;
    clearTimeout(press.current.t);
    press.current = null;
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-sort-id]');
    const target = over?.dataset.sortId;
    if (!target || target === drag) return;
    // Bara kort av samma storlek byter plats, så rutnätet behåller sin form.
    if ((items.find((i) => i.id === target)?.span ?? '') !== (items.find((i) => i.id === drag)?.span ?? '')) return;
    setOrder((o) => {
      const cur = mergeOrder(o, ids);
      const to = cur.indexOf(target);
      cur.splice(cur.indexOf(drag), 1);
      cur.splice(to, 0, drag);
      return cur;
    });
  };
  const done = () => { setEdit(false); setDrag(null); write(storageKey, order); };
  const reset = () => { setOrder(ids); write(storageKey, null); setEdit(false); };

  return (
    <>
      <section className={className} style={style} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {sorted.map((it) => (
          <div
            key={it.id}
            data-sort-id={it.id}
            onPointerDown={startPress}
            onPointerUp={() => cancelPress()}
            onPointerLeave={() => cancelPress()}
            onPointerMove={(e) => cancelPress(e)}
            onContextMenu={(e) => e.preventDefault()}
            onClickCapture={(e) => {
              // Klicket som följer på ett långt tryck ska inte öppna kortets länk eller popup.
              if (suppressClick.current || edit) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; }
            }}
            className={`relative flex min-w-0 ${it.span ?? ''} ${edit ? 'sort-wiggle' : ''} ${drag === it.id ? 'z-10 scale-[1.03] opacity-80' : ''} transition-transform`}
          >
            {it.node}
            {edit && (
              // Skydd över kortet i redigeringsläget: fångar dragningen i stället för kortets länk/knapp.
              <div
                className="absolute inset-0 cursor-grab touch-none rounded-[22px] ring-2 ring-sun"
                onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); setDrag(it.id); }}
              />
            )}
          </div>
        ))}
      </section>
      {edit && (
        <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center md:bottom-6">
          <div className="flex items-center gap-2 rounded-full border border-line bg-card py-1.5 pr-1.5 pl-4 shadow-2xl">
            <span className="font-bold text-dim">Dra korten till ny plats</span>
            <button type="button" onClick={reset} className="min-h-10 rounded-full bg-glass-hi px-4 font-extrabold">Återställ</button>
            <button type="button" onClick={done} className="min-h-10 rounded-full bg-sun px-5 font-extrabold text-ink">Klar</button>
          </div>
        </div>
      )}
    </>
  );
}
