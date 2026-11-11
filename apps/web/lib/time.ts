// Tidshjälp för svensk tid. Ren logik.

/** Midnatt i dag, svensk tid (sommar/vinter), som ms. */
export function startOfDayStockholm(now = Date.now()): number {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  const local = new Date(utcMidnight).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' }).replace(' ', 'T');
  return utcMidnight - (Date.parse(`${local}Z`) - utcMidnight);
}
