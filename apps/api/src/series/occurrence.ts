// Výpočet výskytů série v místním čase provozovny.
// Adapted from calcom/cal.diy@0f19cc4 packages/lib/parse-dates.ts (DST korekce
// opakování) — MIT, (c) 2020-present Cal.com, Inc. Přepsáno bez dayjs/rrule.

import { addDaysToDate, addMonthsToDate, toLocalParts, toUtc } from '../common/local-time.js';

export type SeriesFrequency = 'weekly' | 'biweekly' | 'monthly';

/**
 * Začátek `index`-tého výskytu (0 = první termín). Hodina zůstává stejná
 * v MÍSTNÍM čase i přes změnu letního času; měsíční výskyt z 31. připadne
 * na poslední den kratšího měsíce.
 */
export function seriesOccurrence(
  firstStart: Date,
  frequency: SeriesFrequency,
  index: number,
  timezone: string,
): Date {
  const local = toLocalParts(firstStart, timezone);
  let date: string;
  if (frequency === 'weekly') date = addDaysToDate(local.date, 7 * index);
  else if (frequency === 'biweekly') date = addDaysToDate(local.date, 14 * index);
  else date = addMonthsToDate(local.date, index);
  return toUtc(date, local.time, timezone);
}
