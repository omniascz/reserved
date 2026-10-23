import { describe, expect, it } from 'vitest';
import { slotUnavailableReason } from '../availability-calculator.js';
import type { AvailabilityRequest } from '../availability.types.js';

// Středa 2027-06-16, Praha (SELČ = UTC+2). Pracovní doba 9–17, pauza 12–13.
const base: AvailabilityRequest = {
  date: '2027-06-16',
  serviceDurationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 15,
  workingHours: [
    {
      dayOfWeek: 3,
      startTime: '09:00',
      endTime: '17:00',
      breakStartTime: '12:00',
      breakEndTime: '13:00',
    },
  ],
  existingBookings: [],
  activeHolds: [],
  blocks: [],
  isHoliday: false,
  slotIntervalMinutes: 30,
  timezone: 'Europe/Prague',
};
const at = (hhmm: string) => new Date(`2027-06-16T${hhmm}:00+02:00`);
const range = (from: string, to: string) => ({ startsAt: at(from), endsAt: at(to) });

describe('slotUnavailableReason', () => {
  it('volný termín v pracovní době → null (i nezarovnaný na krok slotů)', () => {
    expect(slotUnavailableReason(base, at('09:00'))).toBe(null);
    expect(slotUnavailableReason(base, at('10:10'))).toBe(null);
    // 15:45 + 60 min + 15 min buffer = 17:00 → přesně se vejde
    expect(slotUnavailableReason(base, at('15:45'))).toBe(null);
  });

  it('mimo pracovní dobu, přes pauzu nebo přes konec → OUTSIDE_WORKING_HOURS', () => {
    expect(slotUnavailableReason(base, at('03:00'))).toBe('OUTSIDE_WORKING_HOURS');
    expect(slotUnavailableReason(base, at('08:30'))).toBe('OUTSIDE_WORKING_HOURS');
    expect(slotUnavailableReason(base, at('11:30'))).toBe('OUTSIDE_WORKING_HOURS'); // do pauzy
    expect(slotUnavailableReason(base, at('16:00'))).toBe('OUTSIDE_WORKING_HOURS'); // buffer přes 17:00
  });

  it('den bez pracovní doby → OUTSIDE_WORKING_HOURS', () => {
    expect(slotUnavailableReason({ ...base, workingHours: [] }, at('10:00'))).toBe(
      'OUTSIDE_WORKING_HOURS',
    );
  });

  it('svátek → HOLIDAY', () => {
    expect(slotUnavailableReason({ ...base, isHoliday: true }, at('10:00'))).toBe('HOLIDAY');
  });

  it('ruční blok nebo událost z kalendáře → BLOCKED', () => {
    const req = { ...base, blocks: [range('14:00', '15:00')] };
    expect(slotUnavailableReason(req, at('14:30'))).toBe('BLOCKED');
    expect(slotUnavailableReason(req, at('13:00'))).toBe('BLOCKED'); // buffer 14:00–14:15 zasahuje
    expect(slotUnavailableReason(req, at('15:00'))).toBe(null); // hned po bloku
  });

  it('jiná rezervace nebo hold → SLOT_TAKEN', () => {
    expect(
      slotUnavailableReason({ ...base, existingBookings: [range('14:00', '15:15')] }, at('14:30')),
    ).toBe('SLOT_TAKEN');
    expect(
      slotUnavailableReason({ ...base, activeHolds: [range('14:00', '15:15')] }, at('13:30')),
    ).toBe('SLOT_TAKEN');
  });
});
