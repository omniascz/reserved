import { z } from 'zod';

export const IssueBookingCodeSchema = z.object({
  bookingId: z.string().uuid(),
  bufferMinutes: z.number().int().min(0).max(720).optional(),
  maxUses: z.number().int().min(1).max(100).optional(),
});
export type IssueBookingCodeDto = z.infer<typeof IssueBookingCodeSchema>;

export const IssueGeneralCodeSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().min(1).max(200).optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  /** 0 = neomezeně vstupů v rámci platnosti (open gym). */
  maxUses: z.number().int().min(0).max(100000).optional(),
  kind: z.enum(['membership', 'open_gym']).optional(),
});
export type IssueGeneralCodeDto = z.infer<typeof IssueGeneralCodeSchema>;

export const ValidateCodeSchema = z.object({
  code: z.string().min(4).max(32),
  branchId: z.string().uuid().optional().nullable(),
});
export type ValidateCodeDto = z.infer<typeof ValidateCodeSchema>;
