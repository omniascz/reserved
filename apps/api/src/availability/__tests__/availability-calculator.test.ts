import { describe, expect, it } from 'vitest';
import { calculateAvailableSlots, isSlotFree } from '../availability-calculator.js';
import type { AvailabilityRequest } from '../availability.types.js';

const TZ = 'UTC'; // tests in UTC pro deterministické chování

const baseReq = (overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest => ({
  date: '2026-06-15', // pondělí
  serviceDurationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  workingHours: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }],
  existingBookings: [],
  activeHolds: [],
  blocks: [],
  isHoliday: false,
  slotIntervalMinutes: 30,
  timezone: TZ,
  ...overrides,
});

describe('calculateAvailableSlots', () => {
  it('returns empty array on holiday', () => {
    const slots = calculateAvailableSlots(baseReq({ isHoliday: true }));
    expect(slots).toEqual([]);
  });

  it('returns no slots when working hours are empty', () => {
    const slots = calculateAvailableSlots(baseReq({ workingHours: [] }));
    expect(slots).toEqual([]);
  });

  it('returns 16 half-hour slots for 9-17 working day, 60min service', () => {
    const slots = calculateAvailableSlots(baseReq());
    // 9:00, 9:30, ..., 16:00 (poslední co se vejde — končí 17:00)
    expect(slots.length).toBe(15);
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-06-15T09:00:00.000Z');
    expect(slots[slots.length - 1]?.startsAt.toISOString()).toBe('2026-06-15T16:00:00.000Z');
  });

  it('subtracts polední pauza correctly', () => {
    const slots = calculateAvailableSlots(
      baseReq({
        workingHours: [
          {
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '17:00',
            breakStartTime: '12:00',
            breakEndTime: '13:00',
          },
        ],
      }),
    );
    // Sloty od 9:00 do 11:00 (poslední start 11:00, končí 12:00) +
    // sloty od 13:00 do 16:00 (poslední start 16:00, končí 17:00)
    const startsIso = slots.map((s) => s.startsAt.toISOString());
    expect(startsIso).toContain('2026-06-15T11:00:00.000Z');
    expect(startsIso).not.toContain('2026-06-15T11:30:00.000Z'); // konflikt s pauzou
    expect(startsIso).not.toContain('2026-06-15T12:00:00.000Z'); // pauza
    expect(startsIso).toContain('2026-06-15T13:00:00.000Z');
  });

  it('subtracts existing bookings (no buffer)', () => {
    const slots = calculateAvailableSlots(
      baseReq({
        existingBookings: [
          {
            startsAt: new Date('2026-06-15T10:00:00Z'),
            endsAt: new Date('2026-06-15T11:00:00Z'),
          },
        ],
      }),
    );
    const startsIso = slots.map((s) => s.startsAt.toISOString());
    expect(startsIso).toContain('2026-06-15T09:00:00.000Z');
    expect(startsIso).not.toContain('2026-06-15T10:00:00.000Z');
    expect(startsIso).not.toContain('2026-06-15T10:30:00.000Z');
    expect(startsIso).toContain('2026-06-15T11:00:00.000Z');
  });

  it('respects buffer before and after service', () => {
    // 9-17 working, 60min service, 15 buffer před, 15 po → potřebuju 90 min souvislých
    const slots = calculateAvailableSlots(
      baseReq({
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        slotIntervalMinutes: 30,
      }),
    );
    // První slot: cursor 9:00, buffer 9:00-9:15, service 9:15-10:15, buffer 10:15-10:30
    expect(slots[0]?.startsAt.toISOString()).toBe('2026-06-15T09:15:00.000Z');
    expect(slots[0]?.endsAt.toISOString()).toBe('2026-06-15T10:15:00.000Z');
    // Poslední slot musí umožnit ještě 15 min buffer na konci → service končí 16:45
    const last = slots[slots.length - 1];
    expect(last).toBeDefined();
    expect(last!.endsAt.toISOString() <= '2026-06-15T16:45:00.000Z').toBe(true);
  });

  it('handles fully booked day (returns no slots)', () => {
    const slots = calculateAvailableSlots(
      baseReq({
        existingBookings: [
          {
            startsAt: new Date('2026-06-15T09:00:00Z'),
            endsAt: new Date('2026-06-15T17:00:00Z'),
          },
        ],
      }),
    );
    expect(slots).toEqual([]);
  });

  it('combines holds and bookings correctly', () => {
    const slots = calculateAvailableSlots(
      baseReq({
        existingBookings: [
          {
            startsAt: new Date('2026-06-15T09:00:00Z'),
            endsAt: new Date('2026-06-15T11:00:00Z'),
          },
        ],
        activeHolds: [
          {
            startsAt: new Date('2026-06-15T15:00:00Z'),
            endsAt: new Date('2026-06-15T16:00:00Z'),
          },
        ],
      }),
    );
    const startsIso = slots.map((s) => s.startsAt.toISOString());
    // 11:00-15:00 a 16:00-17:00 jsou volné
    expect(startsIso).toContain('2026-06-15T11:00:00.000Z');
    expect(startsIso).toContain('2026-06-15T14:00:00.000Z');
    expect(startsIso).not.toContain('2026-06-15T15:00:00.000Z');
    expect(startsIso).toContain('2026-06-15T16:00:00.000Z');
  });

  it('respects manual blocks (e.g. cleaning)', () => {
    const slots = calculateAvailableSlots(
      baseReq({
        blocks: [
          {
            startsAt: new Date('2026-06-15T13:00:00Z'),
            endsAt: new Date('2026-06-15T14:00:00Z'),
          },
        ],
      }),
    );
    const startsIso = slots.map((s) => s.startsAt.toISOString());
    expect(startsIso).not.toContain('2026-06-15T13:00:00.000Z');
    expect(startsIso).toContain('2026-06-15T14:00:00.000Z');
  });

  it('handles split shift with multiple working hours items', () => {
    const slots = calculateAvailableSlots(
      baseReq({
        workingHours: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
          { dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
        ],
        serviceDurationMinutes: 60,
      }),
    );
    const startsIso = slots.map((s) => s.startsAt.toISOString());
    expect(startsIso).toContain('2026-06-15T08:00:00.000Z');
    expect(startsIso).toContain('2026-06-15T11:00:00.000Z');
    expect(startsIso).not.toContain('2026-06-15T11:30:00.000Z'); // končí 12:30, mimo
    expect(startsIso).not.toContain('2026-06-15T13:00:00.000Z'); // pauza
    expect(startsIso).toContain('2026-06-15T14:00:00.000Z');
    expect(startsIso).toContain('2026-06-15T17:00:00.000Z');
  });
});

describe('isSlotFree', () => {
  it('returns true when no occupied intervals', () => {
    expect(isSlotFree(new Date('2026-06-15T10:00:00Z'), new Date('2026-06-15T11:00:00Z'), [])).toBe(
      true,
    );
  });

  it('returns false on overlap with existing booking', () => {
    expect(
      isSlotFree(new Date('2026-06-15T10:00:00Z'), new Date('2026-06-15T11:00:00Z'), [
        {
          startsAt: new Date('2026-06-15T10:30:00Z'),
          endsAt: new Date('2026-06-15T11:30:00Z'),
        },
      ]),
    ).toBe(false);
  });

  it('returns true when slot ends exactly when other starts (boundary)', () => {
    expect(
      isSlotFree(new Date('2026-06-15T10:00:00Z'), new Date('2026-06-15T11:00:00Z'), [
        {
          startsAt: new Date('2026-06-15T11:00:00Z'),
          endsAt: new Date('2026-06-15T12:00:00Z'),
        },
      ]),
    ).toBe(true);
  });
});
