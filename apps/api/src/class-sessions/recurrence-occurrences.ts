// Termíny opakovaného rozvrhu lekcí. Čas z formuláře ('18:00') je MÍSTNÍ čas
// provozovny — dřív se ukládal jako UTC, takže lekce vyšla v létě v 20:00
// a v zimě v 19:00.

import { addDaysToDate, isoWeekday, toUtc } from '../common/local-time.js';

/** Max. délka rozvrhu ve dnech (stejná pojistka jako dřív). */
const MAX_DAYS = 366;

/** Začátky lekcí jako ISO UTC řetězce, seřazené od nejbližší. */
export function recurrenceOccurrences(
  input: { daysOfWeek: number[]; time: string; startDate: string; endDate: string },
  timezone: string,
): string[] {
  const days = new Set(input.daysOfWeek);
  const out: string[] = [];
  let date = input.startDate;
  for (let guard = 0; date <= input.endDate && guard < MAX_DAYS; guard++) {
    if (days.has(isoWeekday(date))) {
      out.push(toUtc(date, input.time, timezone).toISOString());
    }
    date = addDaysToDate(date, 1);
  }
  return out;
}
