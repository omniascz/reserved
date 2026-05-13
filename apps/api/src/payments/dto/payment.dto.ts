import { z } from 'zod';

export const PAYMENT_METHOD_TYPES = [
  'cash',
  'card_terminal',
  'qr_bank',
  'stripe',
  'gopay',
] as const;
export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'cancelled',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// ─── Payment methods config ────────────────────────────────────────

export const UpsertPaymentMethodSchema = z.object({
  methodType: z.enum(PAYMENT_METHOD_TYPES),
  displayName: z.string().min(1).max(100).optional().nullable(),
  config: z.record(z.unknown()).default({}),
  isEnabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100).default(0),
});
export type UpsertPaymentMethodDto = z.infer<typeof UpsertPaymentMethodSchema>;

// ─── Record manual payment ────────────────────────────────────────

export const RecordPaymentSchema = z.object({
  /** Pro koho — volitelne. */
  customerId: z.string().uuid().optional().nullable(),
  bookingId: z.string().uuid().optional().nullable(),
  creditPackAllocationId: z.string().uuid().optional().nullable(),
  amountHellers: z.number().int().positive(),
  currency: z.string().length(3).default('CZK'),
  methodType: z.enum(PAYMENT_METHOD_TYPES),
  description: z.string().max(500).optional().nullable(),
  referenceCode: z.string().max(100).optional().nullable(),
  /** Pro QR/manual — kdy plata fyzicky probehla. Default = now. */
  paidAtIso: z.string().datetime().optional(),
});
export type RecordPaymentDto = z.infer<typeof RecordPaymentSchema>;

// ─── Refund ──────────────────────────────────────────────────────

export const RefundPaymentSchema = z.object({
  amountHellers: z.number().int().positive().optional(),
  reason: z.string().max(500).optional(),
});
export type RefundPaymentDto = z.infer<typeof RefundPaymentSchema>;

// ─── List filter ─────────────────────────────────────────────────

export const ListPaymentsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  methodType: z.enum(PAYMENT_METHOD_TYPES).optional(),
  customerId: z.string().uuid().optional(),
});
export type ListPaymentsQueryDto = z.infer<typeof ListPaymentsQuerySchema>;
