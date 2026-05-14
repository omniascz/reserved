import { z } from 'zod';

export const CreateTimePackSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  /** Pocet dni od aktivace; 1-3650. */
  durationDays: z.number().int().positive().max(3650),
  /** NULL = neomezeno. */
  maxBookingsPerPeriod: z.number().int().positive().max(10000).optional().nullable(),
  /** NULL = bez denniho limitu. */
  maxBookingsPerDay: z.number().int().positive().max(100).optional().nullable(),
  allowedServiceIds: z.array(z.string().uuid()).default([]),
  allowedBranchIds: z.array(z.string().uuid()).default([]),
  priceHellers: z.number().int().nonnegative(),
  currency: z.string().length(3).default('CZK'),
  isActive: z.boolean().default(true),
});
export type CreateTimePackDto = z.infer<typeof CreateTimePackSchema>;

export const UpdateTimePackSchema = CreateTimePackSchema.partial();
export type UpdateTimePackDto = z.infer<typeof UpdateTimePackSchema>;

// Alokace zakaznikovi (prodej / pridelovani)
export const AllocateTimePackSchema = z.object({
  timePackId: z.string().uuid(),
  pricePaidHellers: z.number().int().nonnegative().optional(),
  validFromIso: z.string().datetime().optional(),
  note: z.string().max(500).optional().nullable(),
});
export type AllocateTimePackDto = z.infer<typeof AllocateTimePackSchema>;

// Manualni uprava counter (admin "-1 jako oprava" / "+5 dni navic")
export const AdjustTimePackSchema = z.object({
  /** Delta vuci bookings_used (kladne = vice pouziti odhlasit, zaporne = odecist pouziti). */
  bookingsUsedDelta: z.number().int().optional(),
  /** Posunout expiraci o N dni (kladne = prodlouzit). */
  extendDays: z.number().int().optional(),
  note: z.string().max(500),
});
export type AdjustTimePackDto = z.infer<typeof AdjustTimePackSchema>;
