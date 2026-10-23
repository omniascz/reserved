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
import { toUtc } from '../common/local-time.js';

interface Interval {
  start: number; // ms timestamp
  end: number;
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

/**
 * Otevírací okna dne: pracovní doba minus polední pauzy (UTC intervaly).
 */
function openIntervals(req: AvailabilityRequest): Interval[] {
  // 1. Postav workplace okna (každý working_hours item → interval)
  const workingIntervals: Interval[] = [];
  for (const wh of req.workingHours) {
    const start = toUtc(req.date, wh.startTime, req.timezone);
    const end = toUtc(req.date, wh.endTime, req.timezone);
    if (end.getTime() <= start.getTime()) continue; // sanity
    workingIntervals.push({ start: start.getTime(), end: end.getTime() });
  }

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
  return subtractIntervals(workingIntervals, breakIntervals);
}

export function calculateAvailableSlots(req: AvailabilityRequest): AvailableSlot[] {
  if (req.isHoliday) return [];

  const slotInterval = req.slotIntervalMinutes ?? 15;
  const totalMinutes =
    req.bufferBeforeMinutes + req.serviceDurationMinutes + req.bufferAfterMinutes;
  const totalMs = totalMinutes * 60_000;

  const open = openIntervals(req);
  if (open.length === 0) return [];

  // 3-5. Odečti bookings + holds + blocks
  const occupied: Interval[] = [
    ...req.existingBookings.map(timeRangeToInterval),
    ...req.activeHolds.map(timeRangeToInterval),
    ...req.blocks.map(timeRangeToInterval),
  ];

  const freeIntervals = subtractIntervals(open, occupied);

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

export type SlotUnavailableReason = 'HOLIDAY' | 'OUTSIDE_WORKING_HOURS' | 'BLOCKED' | 'SLOT_TAKEN';

/**
 * Proč konkrétní začátek NEJDE zarezervovat (nebo `null`, když jde).
 *
 * Inspirováno cal.com `ensureAvailableUsers` (calcom/cal.diy@0f19cc4
 * packages/features/bookings/lib/handleNewBooking/ensureAvailableUsers.ts,
 * MIT): těsně před zápisem znovu ověřit pracovní dobu a konflikty, ne jen
 * spoléhat na to, že klient poslal čas z nabídky. Na zarovnání na krok slotů
 * nezáleží — rozhoduje, jestli se termín i s buffery vejde do volného okna.
 */
export function slotUnavailableReason(
  req: AvailabilityRequest,
  startsAt: Date,
): SlotUnavailableReason | null {
  if (req.isHoliday) return 'HOLIDAY';

  const range: Interval = {
    start: startsAt.getTime() - req.bufferBeforeMinutes * 60_000,
    end: startsAt.getTime() + (req.serviceDurationMinutes + req.bufferAfterMinutes) * 60_000,
  };
  const inside = openIntervals(req).some((o) => o.start <= range.start && range.end <= o.end);
  if (!inside) return 'OUTSIDE_WORKING_HOURS';

  const overlaps = (list: TimeRange[]) =>
    list.some((t) => range.start < t.endsAt.getTime() && t.startsAt.getTime() < range.end);
  if (overlaps(req.blocks)) return 'BLOCKED';
  if (overlaps(req.existingBookings) || overlaps(req.activeHolds)) return 'SLOT_TAKEN';
  return null;
}
