import { z } from 'zod';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const CreateStaySchema = z.object({
  /** Jednotka — pokoj / auto (resource). */
  resourceId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().max(255).optional().nullable(),
  customerPhone: z.string().max(32).optional().nullable(),
  checkIn: z.string().regex(YMD, 'checkIn musí být YYYY-MM-DD'),
  checkOut: z.string().regex(YMD, 'checkOut musí být YYYY-MM-DD'),
  guests: z.number().int().min(1).max(50).default(1),
  pricePerNightHellers: z.number().int().nonnegative().default(0),
  note: z.string().max(1000).optional().nullable(),
});
export type CreateStayDto = z.infer<typeof CreateStaySchema>;
