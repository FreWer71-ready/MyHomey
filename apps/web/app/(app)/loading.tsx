/** Visas direkt vid sidhopp medan sidan hämtar sitt data (prefetchas, så hoppet känns omedelbart). */
export default function Loading() {
  return (
    <div role="status" aria-label="Laddar" className="flex animate-pulse flex-col gap-3">
      <div className="h-9 w-40 rounded-xl bg-glass-hi" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-[1.25rem] glass" />)}
      </div>
      <div className="h-56 rounded-[1.5rem] glass" />
      <div className="h-32 rounded-[1.5rem] glass" />
    </div>
  );
}
