import { z } from 'zod';

const CZ_PHONE = /^\+?[\d\s\-()]{7,20}$/;

export const ConfirmBookingSchema = z.object({
  /** Token z předchozího POST /holds. */
  sessionToken: z.string().min(32).max(64),
  /** Jméno zákazníka — pro audit zůstává i kdyby smazal účet. */
  customerName: z.string().min(2).max(200),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().regex(CZ_PHONE).optional().nullable(),
  /** Volitelná poznámka klienta. */
  customerNote: z.string().max(2000).optional().nullable(),
  /** Volitelně přihlášený customer (z customer JWT). Zatím vždy null. */
  customerUserId: z.string().uuid().optional().nullable(),
});
export type ConfirmBookingDto = z.infer<typeof ConfirmBookingSchema>;

// ─── Admin DTOs ────────────────────────────────────────────────────────

export const AdminCreateBookingSchema = z.object({
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  customerName: z.string().min(2).max(200),
  customerEmail: z.string().email().max(255),
  customerPhone: z.string().regex(CZ_PHONE).optional().nullable(),
  startsAt: z.string().datetime(),
  customerNote: z.string().max(2000).optional().nullable(),
  internalNote: z.string().max(2000).optional().nullable(),
  /** Skipnout email confirmation (admin např. volá telefonicky). */
  skipEmail: z.boolean().default(false),
});
export type AdminCreateBookingDto = z.infer<typeof AdminCreateBookingSchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
  /** Odeslat notifikaci klientovi? */
  notifyCustomer: z.boolean().default(true),
});
export type CancelBookingDto = z.infer<typeof CancelBookingSchema>;

export const RescheduleBookingSchema = z.object({
  /** Nový čas začátku. */
  newStartsAt: z.string().datetime(),
  /** Volitelně i nový zaměstnanec (přiřazení jiné kapacitě). */
  newEmployeeId: z.string().uuid().optional(),
  reason: z.string().max(500).optional().nullable(),
  notifyCustomer: z.boolean().default(true),
});
export type RescheduleBookingDto = z.infer<typeof RescheduleBookingSchema>;
