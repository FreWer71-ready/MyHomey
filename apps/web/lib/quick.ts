// Snabbval på Hem: fasta val (QUICK_ACTIONS, kommaseparerade namn på flows/moods i den ordningen)
// plus de tre mest använda från dashboarden som inte redan är med. Ren logik, testas i quick.test.ts.

export type QuickItem = { id: string; name: string; kind: 'mood' | 'flow'; advanced?: boolean };

/** Namn jämförs utan emoji, extra mellanslag och skiftläge ("Kväll 🌙" = "kväll"). */
export const norm = (s: string) => s.normalize('NFKC').replace(/[^\p{L}\p{N}&/ -]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function quickActions(all: QuickItem[], pinnedNames: string[], usage: Map<string, number>, top = 3) {
  const pinned: QuickItem[] = [];
  for (const name of pinnedNames.map(norm).filter(Boolean)) {
    // Flows före moods vid samma namn; exakt namn före "börjar med".
    const hit = all.find((a) => a.kind === 'flow' && norm(a.name) === name) ?? all.find((a) => norm(a.name) === name)
      ?? all.find((a) => norm(a.name).startsWith(name));
    if (hit && !pinned.includes(hit)) pinned.push(hit);
  }
  const most = all
    .filter((a) => !pinned.includes(a) && (usage.get(`${a.kind}:${a.id}`) ?? 0) > 0)
    .sort((a, b) => (usage.get(`${b.kind}:${b.id}`) ?? 0) - (usage.get(`${a.kind}:${a.id}`) ?? 0))
    .slice(0, top);
  return { pinned, most };
}
