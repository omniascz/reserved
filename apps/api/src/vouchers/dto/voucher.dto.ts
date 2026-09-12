import { z } from 'zod';

// Sprint 10.9 — dárkové poukazy.

export const IssueVoucherSchema = z.object({
  valueHellers: z.number().int().min(1).max(100000000),
  currency: z.enum(['CZK', 'EUR', 'USD']).default('CZK'),
  validUntilIso: z.string().datetime().optional().nullable(),
  recipientName: z.string().max(200).optional().nullable(),
  recipientEmail: z.string().email().max(255).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});
export type IssueVoucherDto = z.infer<typeof IssueVoucherSchema>;

export const RedeemVoucherSchema = z.object({
  code: z.string().min(1).max(32),
  amountHellers: z.number().int().min(1).max(100000000),
  bookingId: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});
export type RedeemVoucherDto = z.infer<typeof RedeemVoucherSchema>;
