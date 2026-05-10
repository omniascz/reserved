import { z } from 'zod';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const CreateServiceCategorySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  color: z.string().regex(HEX_COLOR, 'Color musí být ve formátu #RRGGBB').optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateServiceCategoryDto = z.infer<typeof CreateServiceCategorySchema>;

export const UpdateServiceCategorySchema = CreateServiceCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateServiceCategoryDto = z.infer<typeof UpdateServiceCategorySchema>;

// ─── Service ────────────────────────────────────────────────────────────

export const CreateServiceSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  /** V minutách. */
  durationMinutes: z.number().int().min(5).max(1440),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  /** V haléřích (1 Kč = 100 haléřů). */
  priceHellers: z.number().int().nonnegative(),
  currency: z.enum(['CZK', 'EUR', 'USD']).default('CZK'),
  color: z.string().regex(HEX_COLOR).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  isPublic: z.boolean().default(true),
  /** 0–100, NULL = bez zálohy. */
  depositPercent: z.number().int().min(0).max(100).optional().nullable(),
  capacity: z.number().int().min(1).max(500).default(1),
  sortOrder: z.number().int().nonnegative().default(0),
});
export type CreateServiceDto = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = CreateServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;
