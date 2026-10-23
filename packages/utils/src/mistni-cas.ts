// Převody mezi místním časem provozovny a UTC (sdílí API i balíčky).
// (CLAUDE.md: v core doméně jen `Date`, žádný dayjs/luxon).
//
// Proč to existuje: opakované termíny se MUSÍ počítat v místním čase. Přičíst
// 7 dní k UTC okamžiku je po změně letního času o hodinu vedle (série od 19. 3.
// v 10:00 by 2. 4. vyšla v 11:00). Postup převzatý z cal.com (calcom/cal.diy
// packages/lib/parse-dates.ts, MIT): výskyt spočítat v místním kalendáři
// a teprve ten převést na UTC.

/** Offset časové zóny vůči UTC v minutách v daném okamžiku (např. +120 pro CEST). */
export function offsetForUtcInTimezone(utcMoment: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(utcMoment);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = tz.match(/GMT([+-]?)(\d{1,2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  return sign * (hours * 60 + mins);
}

/** Místní datum 'YYYY-MM-DD' a čas 'HH:MM' v zóně → okamžik v UTC. */
export function toUtc(localDate: string, localTime: string, timezone: string): Date {
  const [hh, mm] = localTime.split(':').map(Number);
  const [yyyy, MM, dd] = localDate.split('-').map(Number);
  if (
    yyyy === undefined ||
    MM === undefined ||
    dd === undefined ||
    hh === undefined ||
    mm === undefined
  ) {
    throw new Error(`Invalid local datetime: ${localDate} ${localTime}`);
  }

  // Kandidát „jako by to byl UTC", pak posun o offset zóny v tom okamžiku.
  const candidate = new Date(Date.UTC(yyyy, MM - 1, dd, hh, mm, 0));
  const offsetMinutes = offsetForUtcInTimezone(candidate, timezone);
  return new Date(candidate.getTime() - offsetMinutes * 60_000);
}

/** Okamžik v UTC → místní datum a čas v zóně. */
export function toLocalParts(utcMoment: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(utcMoment);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function parseDate(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) {
    throw new Error(`Invalid local date: ${date}`);
  }
  return [y, m, d];
}

function formatDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Kalendářní datum + N dní (bez času, takže změna času nehraje roli). */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return formatDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * Kalendářní datum + N měsíců. Den se ořízne na konec měsíce: 31. 1. + 1 měsíc
 * = 28. (29.) 2., ne 3. 3. — jinak by měsíční série z 31. vynechala únor.
 */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = parseDate(date);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = first.getUTCFullYear();
  const tm = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return formatDate(ty, tm, Math.min(d, lastDay));
}

/** ISO den v týdnu kalendářního data (1 = Po … 7 = Ne). */
export function isoWeekday(date: string): number {
  const [y, m, d] = parseDate(date);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}
