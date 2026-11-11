// Färgskalor och formattering som delas av vyerna.

export const HEAT = [
  { max: 5, color: '#8EC0FF', label: 'under 5°' },
  { max: 18, color: '#C7E2FF', label: '5–18°' },
  { max: 20, color: '#C4F0F0', label: '18–20°' },
  { max: 22, color: '#BFF0D4', label: '20–22°' },
  { max: 25, color: '#FFE58F', label: '22–25°' },
  { max: Infinity, color: '#FFB8A6', label: 'över 25°' },
] as const;

export const NO_TEMP = '#9AA1B5';

/** Färgton ovanpå glaskortets mörka grund (bra kontrast, ingen ljus yta som kan bränna in). */
export function tint(hex: string, alpha = 0.3): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  return `linear-gradient(rgb(${rgb} / ${alpha}), rgb(${rgb} / ${alpha})), var(--color-glass)`;
}

export function heatColor(t: number | null): string {
  if (t == null) return NO_TEMP;
  return HEAT.find((s) => t < s.max)!.color;
}

/** Temperaturfärg som ton för kort. */
export const heatTint = (t: number | null) => tint(heatColor(t), t == null ? 0.12 : 0.3);

const num = (n: number, decimals: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export const fmtTemp = (t: number | null, stale = false) => (t == null ? (stale ? 'Ej nåbar' : '–') : `${num(t, 1)}°`);
export const fmtPercent = (p: number | null) => (p == null ? '–' : `${num(p, 0)} %`);
export const fmtWatt = (w: number) => `${num(w, w < 100 ? 1 : 0)} W`;
