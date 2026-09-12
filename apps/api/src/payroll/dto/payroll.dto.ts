import { z } from 'zod';

export const SetCommissionSchema = z.object({
  /** NULL/vynecháno = výchozí provize zaměstnance; jinak override pro službu. */
  serviceId: z.string().uuid().optional().nullable(),
  commissionPercent: z.number().int().min(0).max(100),
});
export type SetCommissionDto = z.infer<typeof SetCommissionSchema>;

/** Datum buď jako YYYY-MM-DD, nebo plné ISO 8601 — obojí musí jít naparsovat. */
const DateLike = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Musí být platné datum (YYYY-MM-DD nebo ISO 8601).',
  });

/** POST admin/payroll/payouts/generate — období, za které se vygenerují výplaty. */
export const GeneratePayoutSchema = z.object({
  from: DateLike,
  to: DateLike,
  /** Vynecháno = všichni zaměstnanci. */
  employeeId: z.string().uuid().optional(),
});
export type GeneratePayoutDto = z.infer<typeof GeneratePayoutSchema>;
