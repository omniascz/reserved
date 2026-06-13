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
  /** Max. počet přesunů jedné rezervace zákazníkem. 0 = bez limitu (default). */
  maxReschedules: z.number().int().min(0).max(20).default(0),
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

// ─── Notification settings ─────────────────────────────────────────────

export const NotificationSettingsSchema = z.object({
  /** Hodiny před začátkem rezervace, kdy poslat připomínku. 0 = vypnuto. Default 24. */
  reminderHoursBefore: z.number().min(0).max(168).default(24),
  /** Primární kanál pro připomínky. */
  primaryChannel: z.enum(['email', 'sms']).default('email'),
  /** Zda připomínat i přes SMS (pokud klient má telefon). */
  smsEnabled: z.boolean().default(false),
});

export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>;
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = NotificationSettingsSchema.parse(
  {},
);

export function extractNotificationSettings(settings: unknown): NotificationSettings {
  if (!settings || typeof settings !== 'object') return DEFAULT_NOTIFICATION_SETTINGS;
  const obj = settings as Record<string, unknown>;
  const raw = obj.notifications;
  if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
  const result = NotificationSettingsSchema.safeParse(raw);
  if (!result.success) return DEFAULT_NOTIFICATION_SETTINGS;
  return result.data;
}

// ─── Loyalty settings (sprint 10.8) ────────────────────────────────────

export const LoyaltySettingsSchema = z.object({
  /** Zapnutý věrnostní program. Default vypnuto. */
  enabled: z.boolean().default(false),
  /** Kolik bodů klient získá za dokončenou rezervaci. 0 = nic. */
  pointsPerCompletedBooking: z.number().int().min(0).max(100000).default(0),
});
export type LoyaltySettings = z.infer<typeof LoyaltySettingsSchema>;
export const DEFAULT_LOYALTY_SETTINGS: LoyaltySettings = LoyaltySettingsSchema.parse({});

export function extractLoyaltySettings(settings: unknown): LoyaltySettings {
  if (!settings || typeof settings !== 'object') return DEFAULT_LOYALTY_SETTINGS;
  const obj = settings as Record<string, unknown>;
  const raw = obj.loyalty;
  if (!raw) return DEFAULT_LOYALTY_SETTINGS;
  const result = LoyaltySettingsSchema.safeParse(raw);
  if (!result.success) return DEFAULT_LOYALTY_SETTINGS;
  return result.data;
}

// ─── Meeting / video odkaz (sprint 10.14) ──────────────────────────────
// 'manual' = použij statické defaultOnlineMeetingUrl ze služby (beze změny).
// 'jitsi'  = automaticky vygeneruj odkaz na meet.jit.si (bez API klíče).
// 'zoom' / 'teams' = vyžadují propojení účtu (externí OAuth) — zatím placeholder.
export const meetingProviders = ['manual', 'jitsi', 'zoom', 'teams'] as const;
export const MeetingSettingsSchema = z.object({
  provider: z.enum(meetingProviders).default('manual'),
});
export type MeetingSettings = z.infer<typeof MeetingSettingsSchema>;
export const DEFAULT_MEETING_SETTINGS: MeetingSettings = MeetingSettingsSchema.parse({});

export function extractMeetingSettings(settings: unknown): MeetingSettings {
  if (!settings || typeof settings !== 'object') return DEFAULT_MEETING_SETTINGS;
  const obj = settings as Record<string, unknown>;
  const raw = obj.meeting;
  if (!raw) return DEFAULT_MEETING_SETTINGS;
  const result = MeetingSettingsSchema.safeParse(raw);
  if (!result.success) return DEFAULT_MEETING_SETTINGS;
  return result.data;
}
