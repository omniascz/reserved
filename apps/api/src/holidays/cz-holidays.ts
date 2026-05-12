// České státní svátky a významné dny. Pevné dny + Velikonoce (Gauss algorithm).
//
// Reference: zákon č. 245/2000 Sb. o státních svátcích a významných dnech.

interface FixedHoliday {
  month: number; // 1-12
  day: number;
  name: string;
}

const FIXED_CZ_HOLIDAYS: FixedHoliday[] = [
  { month: 1, day: 1, name: 'Nový rok / Den obnovy samostatného českého státu' },
  { month: 5, day: 1, name: 'Svátek práce' },
  { month: 5, day: 8, name: 'Den vítězství' },
  { month: 7, day: 5, name: 'Den slovanských věrozvěstů Cyrila a Metoděje' },
  { month: 7, day: 6, name: 'Den upálení mistra Jana Husa' },
  { month: 9, day: 28, name: 'Den české státnosti' },
  { month: 10, day: 28, name: 'Den vzniku samostatného československého státu' },
  { month: 11, day: 17, name: 'Den boje za svobodu a demokracii' },
  { month: 12, day: 24, name: 'Štědrý den' },
  { month: 12, day: 25, name: '1. svátek vánoční' },
  { month: 12, day: 26, name: '2. svátek vánoční' },
];

/** Gauss Easter algorithm pro západní Velikonoce. Vrací Date Velikonoční neděle. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export interface HolidayEntry {
  date: string; // YYYY-MM-DD
  name: string;
}

export function getCzHolidays(year: number): HolidayEntry[] {
  const entries: HolidayEntry[] = FIXED_CZ_HOLIDAYS.map((h) => ({
    date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
    name: h.name,
  }));

  // Easter Sunday + Friday before + Monday after
  const easter = easterSunday(year);
  const goodFriday = new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000);
  const easterMonday = new Date(easter.getTime() + 24 * 60 * 60 * 1000);

  entries.push({
    date: goodFriday.toISOString().slice(0, 10),
    name: 'Velký pátek',
  });
  entries.push({
    date: easterMonday.toISOString().slice(0, 10),
    name: 'Velikonoční pondělí',
  });

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}
