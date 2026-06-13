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
});
export type CreateClassSessionDto = z.infer<typeof CreateClassSessionSchema>;

export const JoinClassSessionSchema = z.object({
  customerName: z.string().min(2).max(200),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().regex(CZ_PHONE).optional().nullable(),
  customerNote: z.string().max(2000).optional().nullable(),
});
export type JoinClassSessionDto = z.infer<typeof JoinClassSessionSchema>;
