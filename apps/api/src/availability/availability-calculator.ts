// Pure logika výpočtu volných slotů. Bez DB, bez NestJS — jen čistá funkce.
// Reference: reserved-docs/06_sloty_a_pravidla.md
//
// Algoritmus:
//   1. Pokud isHoliday → []
//   2. Pro každou working_hours položku zvol její denní okno (start-end)
//   3. Z okna odečti polední pauzu (pokud je)
//   4. Z okna odečti existing_bookings (s buffery)
//   5. Z okna odečti active_holds
//   6. Z okna odečti blocks
//   7. Pokud zbylé volné intervaly jsou ≥ (duration + buffers), generuj
//      sloty s krokem slot_interval
//   8. Vrať sloty ve UTC

import type {
  AvailabilityRequest,
  AvailableSlot,
  TimeRange,
  WorkingHoursDay,
} from './availability.types.js';

interface Interval {
  start: number; // ms timestamp
  end: number;
}

function toUtc(localDate: string, localTime: string, timezone: string): Date {
  // localDate: YYYY-MM-DD, localTime: HH:MM, timezone: e.g. 'Europe/Prague'
  // Note: This implementation assumes Node 20+ Intl support. For accurate DST
  // handling in production, consider using Temporal API or date-fns-tz.
  // Pro tenant default 'Europe/Prague' to funguje korektně přes Intl.
  const [hh, mm] = localTime.split(':').map(Number);
  const [yyyy, MM, dd] = localDate.split('-').map(Number);

  // Construct date as if it were UTC, then offset by timezone
  // This is approximate — see comment above. Stačí pro CZ pro MVP.
  if (
    yyyy === undefined ||
    MM === undefined ||
    dd === undefined ||
    hh === undefined ||
    mm === undefined
  ) {
    throw new Error(`Invalid local datetime: ${localDate} ${localTime}`);
  }

  // Build a candidate UTC moment, then read back its representation in the
  // tenant timezone and adjust until they match.
  const candidate = new Date(Date.UTC(yyyy, MM - 1, dd, hh, mm, 0));
  const offsetMinutes = offsetForUtcInTimezone(candidate, timezone);
  return new Date(candidate.getTime() - offsetMinutes * 60_000);
}

function offsetForUtcInTimezone(utcMoment: Date, timezone: string): number {
  // Vrátí offset timezone vůči UTC v minutách (např. +120 pro CEST).
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

function subtractIntervals(base: Interval[], toSubtract: Interval[]): Interval[] {
  let result: Interval[] = [...base];
  for (const sub of toSubtract) {
    const next: Interval[] = [];
    for (const r of result) {
      if (sub.end <= r.start || sub.start >= r.end) {
        // No overlap
        next.push(r);
      } else {
        // Overlap — split into 0, 1, or 2 intervals
        if (sub.start > r.start) next.push({ start: r.start, end: sub.start });
        if (sub.end < r.end) next.push({ start: sub.end, end: r.end });
      }
    }
    result = next;
  }
  return result;
}

function timeRangeToInterval(t: TimeRange): Interval {
  return { start: t.startsAt.getTime(), end: t.endsAt.getTime() };
}

export function calculateAvailableSlots(req: AvailabilityRequest): AvailableSlot[] {
  if (req.isHoliday) return [];

  const slotInterval = req.slotIntervalMinutes ?? 15;
  const totalMinutes =
    req.bufferBeforeMinutes + req.serviceDurationMinutes + req.bufferAfterMinutes;
  const totalMs = totalMinutes * 60_000;

  // 1. Postav workplace okna (každý working_hours item → interval)
  const workingIntervals: Interval[] = [];
  for (const wh of req.workingHours) {
    const start = toUtc(req.date, wh.startTime, req.timezone);
    const end = toUtc(req.date, wh.endTime, req.timezone);
    if (end.getTime() <= start.getTime()) continue; // sanity
    workingIntervals.push({ start: start.getTime(), end: end.getTime() });
  }

  if (workingIntervals.length === 0) return [];

  // 2. Odečti polední pauzy
  const breakIntervals: Interval[] = [];
  for (const wh of req.workingHours) {
    if (wh.breakStartTime && wh.breakEndTime) {
      const bs = toUtc(req.date, wh.breakStartTime, req.timezone);
      const be = toUtc(req.date, wh.breakEndTime, req.timezone);
      if (be.getTime() > bs.getTime()) {
        breakIntervals.push({ start: bs.getTime(), end: be.getTime() });
      }
    }
  }

  // 3-5. Odečti bookings + holds + blocks
  const occupied: Interval[] = [
    ...breakIntervals,
    ...req.existingBookings.map(timeRangeToInterval),
    ...req.activeHolds.map(timeRangeToInterval),
    ...req.blocks.map(timeRangeToInterval),
  ];

  const freeIntervals = subtractIntervals(workingIntervals, occupied);

  // 6. Generuj sloty s krokem slotInterval
  const slots: AvailableSlot[] = [];
  for (const interval of freeIntervals) {
    if (interval.end - interval.start < totalMs) continue;

    // První slot začíná na nejbližší slotInterval-zarovnaný čas v intervalu
    const intervalStartDate = new Date(interval.start);
    const minutes = intervalStartDate.getUTCMinutes();
    const remainder = minutes % slotInterval;
    const alignmentMs = remainder === 0 ? 0 : (slotInterval - remainder) * 60_000;
    let cursor = interval.start + alignmentMs;

    while (cursor + totalMs <= interval.end) {
      const serviceStart = cursor + req.bufferBeforeMinutes * 60_000;
      const serviceEnd = serviceStart + req.serviceDurationMinutes * 60_000;
      slots.push({
        startsAt: new Date(serviceStart),
        endsAt: new Date(serviceEnd),
      });
      cursor += slotInterval * 60_000;
    }
  }

  return slots;
}

/**
 * Sanity helper — vrátí, zda zadaný slot překrývá nějaký existing/block/hold.
 * Použito v hold creation a booking confirmation.
 */
export function isSlotFree(slotStart: Date, slotEnd: Date, occupied: TimeRange[]): boolean {
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  for (const o of occupied) {
    const oStart = o.startsAt.getTime();
    const oEnd = o.endsAt.getTime();
    if (slotStartMs < oEnd && oStart < slotEndMs) {
      return false;
    }
  }
  return true;
}
