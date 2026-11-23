// Födelsedagar: BIRTHDAYS="Ulrika=11-23,Fredrik=03-14" (förnamn=MM-DD, kommaseparerade). Upprepas varje år.
export type Birthday = { name: string; month: number; day: number };

const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Tolkar BIRTHDAYS. Ogiltiga poster hoppas över. */
export function parseBirthdays(raw: string | undefined): Birthday[] {
  return (raw ?? '').split(',').flatMap((e): Birthday[] => {
    const m = e.match(/^\s*([^=]+?)\s*=\s*(\d{1,2})-(\d{1,2})\s*$/);
    if (!m) return [];
    const month = Number(m[2]), day = Number(m[3]);
    return month >= 1 && month <= 12 && day >= 1 && day <= DAYS[month - 1] ? [{ name: m[1], month, day }] : [];
  });
}

/** Dagens födelsedagsbarn i tidszonen (standard Stockholm). 29 februari firas 28 februari under icke-skottår. */
export function birthdayToday(list: Birthday[], now: Date = new Date(), tz = 'Europe/Stockholm'): Birthday | null {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map((x) => [x.type, Number(x.value)]));
  return list.find((b) => (b.month === p.month && b.day === p.day)
    || (b.month === 2 && b.day === 29 && !leap(p.year) && p.month === 2 && p.day === 28)) ?? null;
}
