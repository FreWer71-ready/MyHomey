// Tidshjälp för svensk tid. Ren logik.

/** Midnatt i dag, svensk tid (sommar/vinter), som ms. */
export function startOfDayStockholm(now = Date.now()): number {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  const local = new Date(utcMidnight).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace(' ', 'T');
  return utcMidnight - (Date.parse(`${local}Z`) - utcMidnight);
}

/** Kort "senast sedd": klockslag i dag, "i går HH:MM", annars dag och månad (Stockholm). */
export function seenAgo(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso);
  const day = (t: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short' }).format(t);
  const time = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' }).format(ms);
  if (day(ms) === day(now)) return time;
  if (day(ms) === day(now - 86400_000)) return `i går ${time}`;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short' }).format(ms).replace('.', '');
}
