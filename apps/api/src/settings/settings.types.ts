// Booking rules — uloženo v tenants.settings JSONB pod klíčem `bookingRules`.
//
// Defaults pokrývají rozumný startovní scénář (60 dní dopředu, 2h před lekcí,
// 24h storno limit, 2h přesun limit).

import { z } from 'zod';

export const PerDayRescheduleRuleSchema = z.object({
  /** ISO weekday 1-7 jako string (pro JSON klíče). */
  fromDay: z.string().regex(/^[1-7]$/),
  /** Do kterého dne lze přesunout (1-7) nebo null = bez limitu. */
  toDay: z.union([z.string().regex(/^[1-7]$/), z.null()]),
});

export const BookingRulesSchema = z.object({
  /** Jak daleko dopředu se dá rezervovat. Default 60 dní. */
  maxDaysAhead: z.number().int().min(1).max(365).default(60),
  /** Nejpozději kolik hodin před lekcí. Default 2h. */
  minHoursBefore: z.number().min(0).max(168).default(2),
  /** Storno bez poplatku — kolik hodin před lekcí. Default 24h. */
  stornoLimitHours: z.number().min(0).max(168).default(24),
  /** Přesun lekce — kolik hodin předem. Default 2h. */
  presunLimitHours: z.number().min(0).max(168).default(2),
  /** Per-day omezení přesunu (např. z pondělí jen do pátku). */
  perDayRescheduleRules: z.array(PerDayRescheduleRuleSchema).default([]),
  /** Slot interval v minutách (krok mezi nabízenými časy). Default 15. */
  slotIntervalMinutes: z.number().int().min(5).max(60).default(15),
});

export type BookingRules = z.infer<typeof BookingRulesSchema>;

export const DEFAULT_BOOKING_RULES: BookingRules = BookingRulesSchema.parse({});

/**
 * Z `tenants.settings` JSONB vytáhne validovaná pravidla; defaults pokud chybí.
 */
export function extractBookingRules(settings: unknown): BookingRules {
  if (!settings || typeof settings !== 'object') return DEFAULT_BOOKING_RULES;
  const obj = settings as Record<string, unknown>;
  const raw = obj.bookingRules;
  if (!raw) return DEFAULT_BOOKING_RULES;
  const result = BookingRulesSchema.safeParse(raw);
  if (!result.success) return DEFAULT_BOOKING_RULES;
  return result.data;
}
