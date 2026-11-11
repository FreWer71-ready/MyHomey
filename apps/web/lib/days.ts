// Namnsdagar: formattering. Ren logik.

/** "Mårten", "Anna och Hanna", "Ada, Bea och Cia". */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} och ${names.at(-1)}`;
}
