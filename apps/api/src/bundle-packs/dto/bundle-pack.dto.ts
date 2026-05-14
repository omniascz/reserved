import { z } from 'zod';

export const BundleItemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
});
export type BundleItemDto = z.infer<typeof BundleItemSchema>;

export const CreateBundlePackSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  /** Polozky balicku — alespon jedna. */
  items: z.array(BundleItemSchema).min(1).max(20),
  validityDays: z.number().int().positive().max(3650).optional().nullable(),
  priceHellers: z.number().int().nonnegative(),
  currency: z.string().length(3).default('CZK'),
  /** Pole UUID pobocek. Prazdny = vsechny. */
  allowedBranchIds: z.array(z.string().uuid()).default([]),
  /** Pokud true, vsechny polozky musi byt vycerpany v jedne rezervaci. */
  sameVisitRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateBundlePackDto = z.infer<typeof CreateBundlePackSchema>;

export const UpdateBundlePackSchema = CreateBundlePackSchema.partial();
export type UpdateBundlePackDto = z.infer<typeof UpdateBundlePackSchema>;

// Alokace zakaznikovi (prodej / pridelovani)
export const AllocateBundlePackSchema = z.object({
  bundlePackId: z.string().uuid(),
  pricePaidHellers: z.number().int().nonnegative().optional(),
  validFromIso: z.string().datetime().optional(),
  note: z.string().max(500).optional().nullable(),
});
export type AllocateBundlePackDto = z.infer<typeof AllocateBundlePackSchema>;

// Manualni uprava polozky (admin "+1 za bonus" / "-1 za opravu")
export const AdjustBundleItemSchema = z.object({
  serviceId: z.string().uuid(),
  /** Kladne = pridat, zaporne = odebrat. */
  quantityDelta: z.number().int(),
  note: z.string().max(500),
});
export type AdjustBundleItemDto = z.infer<typeof AdjustBundleItemSchema>;

// Alokace firme (sprint 3.3 fáze B2-extended)
export const AllocateBundlePackToCorporateSchema = z.object({
  bundlePackId: z.string().uuid(),
  pricePaidHellers: z.number().int().nonnegative().optional(),
  validFromIso: z.string().datetime().optional(),
  note: z.string().max(500).optional().nullable(),
});
export type AllocateBundlePackToCorporateDto = z.infer<typeof AllocateBundlePackToCorporateSchema>;
