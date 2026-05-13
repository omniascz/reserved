import { z } from 'zod';

export const CreateCreditPackSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  mode: z.enum(['per_visit', 'per_credit']).default('per_visit'),
  totalCredits: z.number().int().positive().max(10000),
  validityDays: z.number().int().positive().max(3650).optional().nullable(),
  priceHellers: z.number().int().nonnegative(),
  currency: z.string().length(3).default('CZK'),
  /** Pole UUID sluzeb. Prazdny = vsechny. */
  allowedServiceIds: z.array(z.string().uuid()).default([]),
  /** Pole UUID pobocek. Prazdny = vsechny. */
  allowedBranchIds: z.array(z.string().uuid()).default([]),
  /** Jen pro per_credit: {serviceId: creditCost}. */
  creditCostsByService: z.record(z.number().int().positive().max(100)).default({}),
  isActive: z.boolean().default(true),
});
export type CreateCreditPackDto = z.infer<typeof CreateCreditPackSchema>;

export const UpdateCreditPackSchema = CreateCreditPackSchema.partial();
export type UpdateCreditPackDto = z.infer<typeof UpdateCreditPackSchema>;

// Alokace zakaznikovi (prodej / pridelovani)
export const AllocateCreditPackSchema = z.object({
  creditPackId: z.string().uuid(),
  /** Pripadny override ceny. Default = sablona priceHellers. */
  pricePaidHellers: z.number().int().nonnegative().optional(),
  /** Pripadny override platnosti od. Default = nyni. */
  validFromIso: z.string().datetime().optional(),
  note: z.string().max(500).optional().nullable(),
});
export type AllocateCreditPackDto = z.infer<typeof AllocateCreditPackSchema>;

// Manualni uprava kreditu (admin "+5" za bonus apod)
export const AdjustCreditsSchema = z.object({
  creditsDelta: z.number().int(),
  note: z.string().max(500),
});
export type AdjustCreditsDto = z.infer<typeof AdjustCreditsSchema>;
