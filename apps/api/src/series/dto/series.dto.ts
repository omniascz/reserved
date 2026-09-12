import { z } from 'zod';

export const CreateSeriesSchema = z.object({
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid(),
  branchId: z.string().uuid().optional(),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email(),
  customerPhone: z.string().max(32).optional().nullable(),
  /** Čas prvního výskytu (ISO). Další se generují podle frequency. */
  startsAt: z.string().datetime(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  /** Kolik termínů v sérii (vč. prvního). */
  occurrences: z.number().int().min(2).max(52),
  customerNote: z.string().max(2000).optional().nullable(),
});
export type CreateSeriesDto = z.infer<typeof CreateSeriesSchema>;
