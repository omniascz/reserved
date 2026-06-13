import { z } from 'zod';

export const SetCommissionSchema = z.object({
  /** NULL/vynecháno = výchozí provize zaměstnance; jinak override pro službu. */
  serviceId: z.string().uuid().optional().nullable(),
  commissionPercent: z.number().int().min(0).max(100),
});
export type SetCommissionDto = z.infer<typeof SetCommissionSchema>;
