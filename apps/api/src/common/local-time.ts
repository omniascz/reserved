// Převody mezi místním časem provozovny a UTC — implementace je sdílená
// v @reserved/utils (mistni-cas.ts), tady jen re-export pro moduly API.
export {
  offsetForUtcInTimezone,
  toUtc,
  toLocalParts,
  addDaysToDate,
  addMonthsToDate,
  isoWeekday,
} from '@reserved/utils';
