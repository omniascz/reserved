import { z } from 'zod';
import { posPaymentMethods, posSaleItemTypes } from '@reserved/db';

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(64).optional().nullable(),
  priceHellers: z.number().int().nonnegative(),
  vatRate: z.number().int().min(0).max(100).default(21),
  tracksStock: z.boolean().default(true),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  isActive: z.boolean().default(true),
});
export type CreateProductDto = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export const SaleItemSchema = z.object({
  itemType: z.enum(posSaleItemTypes),
  /** product → pos_products.id; pack → credit_packs.id; manual → nepoužito. */
  refId: z.string().uuid().optional().nullable(),
  /** Povinné pro 'manual'; jinak se přebere z produktu/permanentky. */
  name: z.string().max(200).optional().nullable(),
  quantity: z.number().int().min(1).max(1000).default(1),
  /** Povinné pro 'manual'. */
  unitPriceHellers: z.number().int().nonnegative().optional(),
  vatRate: z.number().int().min(0).max(100).optional(),
});
export type SaleItemDto = z.infer<typeof SaleItemSchema>;

export const CreateSaleSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  paymentMethod: z.enum(posPaymentMethods),
  note: z.string().max(1000).optional().nullable(),
  items: z.array(SaleItemSchema).min(1).max(100),
});
export type CreateSaleDto = z.infer<typeof CreateSaleSchema>;
