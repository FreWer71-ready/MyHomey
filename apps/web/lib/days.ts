// Svenska dagar (sholiday.faboul.se): namnsdagar. Ren logik.

type DaysJson = { dagar?: { datum: string; namnsdag?: string[] }[] };

/** Namn som har namnsdag ett visst datum (YYYY-MM-DD). */
export function nameDays(json: DaysJson, date: string): string[] {
  return json.dagar?.find((d) => d.datum === date)?.namnsdag ?? [];
}

/** "Mårten", "Anna och Hanna", "Ada, Bea och Cia". */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} och ${names.at(-1)}`;
}
