/**
 * Ljusnivå (lux) från sensorer: format och ord. Inomhus är det cirka 100–300 lux en kväll med lampor, 500 på ett kontor
 * och över 1 000 vid ett fönster en dag.
 */
export const fmtLux = (lux: number): string => Math.round(lux).toLocaleString('sv-SE');

export function luxLabel(lux: number): string {
  return lux < 5 ? 'Mörkt' : lux < 50 ? 'Dunkelt' : lux < 200 ? 'Svagt ljus' : lux < 500 ? 'Normalt' : lux < 2000 ? 'Ljust' : 'Dagsljus';
}
