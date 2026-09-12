import { z } from 'zod';

const CZ_PHONE = /^\+?[\d\s\-()]{7,20}$/;

// Sprint 10.0 — skupinové lekce. DTO pro vypsání lekce a přihlášení účastníka.

export const CreateClassSessionSchema = z.object({
  serviceId: z.string().uuid(),
  /** Trenér vedoucí lekci. Volitelný (EMS lekce bývá bez trenéra, jen na přístroji). */
  employeeId: z.string().uuid().optional().nullable(),
  /** Zdroj/přístroj (EMS). Pro EMS povinný, jinak se kapacita musí ≥ 2. */
  resourceId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  /** Kapacita lekce. Default = services.capacity. Skupinová ≥ 2; EMS = 1 (s přístrojem). */
  capacity: z.number().int().min(1).max(1000).optional(),
  /** Spot booking (10.33): počet pojmenovaných míst v sále. 0 = bez výběru místa. */
  spotCount: z.number().int().min(0).max(1000).optional(),
  /** Tvrdé podmínky (10.33): věkové omezení účastníka (k datu lekce). */
  minAge: z.number().int().min(0).max(120).optional().nullable(),
  maxAge: z.number().int().min(0).max(120).optional().nullable(),
  /** Prerekvizita: účastník musí mít dokončenou rezervaci této služby. */
  prerequisiteServiceId: z.string().uuid().optional().nullable(),
});
export type CreateClassSessionDto = z.infer<typeof CreateClassSessionSchema>;

/** Datum buď YYYY-MM-DD, nebo plné ISO 8601 — zachovává dosavadní toleranci filtrů. */
const DateLike = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Musí být platné datum (YYYY-MM-DD nebo ISO 8601).',
  });

/**
 * Filtr stavu ve výpisu lekcí.
 *   open      = otevřená a ještě nezaplněná (výchozí = dosavadní chování)
 *   full      = otevřená, ale obsazená do posledního místa (tady žije pořadník)
 *   cancelled | completed = dle stavu lekce
 *   all       = bez filtru stavu i obsazenosti
 */
export const classSessionListStatuses = ['open', 'full', 'cancelled', 'completed', 'all'] as const;
export type ClassSessionListStatus = (typeof classSessionListStatuses)[number];

export const ListClassSessionsQuerySchema = z.object({
  serviceId: z.string().uuid().optional(),
  /** Jen lekce z konkrétního opakovaného rozvrhu. */
  recurrenceId: z.string().uuid().optional(),
  from: DateLike.optional(),
  to: DateLike.optional(),
  status: z.enum(classSessionListStatuses).default('open'),
});
export type ListClassSessionsQueryDto = z.infer<typeof ListClassSessionsQuerySchema>;

/**
 * Editace vypsané lekce. Všechna pole nepovinná — mění se jen to, co přijde.
 * `null` u trenéra/přístroje/věku/prerekvizity znamená „odebrat".
 */
export const UpdateClassSessionSchema = z
  .object({
    startsAt: z.string().datetime(),
    employeeId: z.string().uuid().nullable(),
    resourceId: z.string().uuid().nullable(),
    capacity: z.number().int().min(1).max(1000),
    minAge: z.number().int().min(0).max(120).nullable(),
    maxAge: z.number().int().min(0).max(120).nullable(),
    prerequisiteServiceId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'Zadej alespoň jedno pole ke změně.',
  });
export type UpdateClassSessionDto = z.infer<typeof UpdateClassSessionSchema>;

/** Výpis opakovaných rozvrhů. */
export const recurrenceListStatuses = ['active', 'cancelled', 'all'] as const;
export const ListRecurrencesQuerySchema = z.object({
  status: z.enum(recurrenceListStatuses).default('all'),
});
export type ListRecurrencesQueryDto = z.infer<typeof ListRecurrencesQuerySchema>;

export const JoinClassSessionSchema = z.object({
  customerName: z.string().min(2).max(200),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().regex(CZ_PHONE).optional().nullable(),
  customerNote: z.string().max(2000).optional().nullable(),
  /** Spot booking (10.33): zvolené místo v sále (1..spotCount). */
  spotLabel: z.string().min(1).max(16).optional().nullable(),
  /** Náhrada (10.40): použít dostupný make-up credit → lekce zdarma. */
  useMakeupCredit: z.boolean().optional(),
});
export type JoinClassSessionDto = z.infer<typeof JoinClassSessionSchema>;

// Opakovaný rozvrh (sprint 10.25) — generátor lekcí.
export const CreateRecurrenceSchema = z.object({
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid().optional().nullable(),
  resourceId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  capacity: z.number().int().min(1).max(1000).optional(),
  /** Dny v týdnu ISO (1=Po..7=Ne). */
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1),
  /** Čas začátku 'HH:MM'. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateRecurrenceDto = z.infer<typeof CreateRecurrenceSchema>;

// Docházka (sprint 10.27).
export const MarkAttendanceSchema = z.object({
  attended: z.boolean(),
});
export type MarkAttendanceDto = z.infer<typeof MarkAttendanceSchema>;
