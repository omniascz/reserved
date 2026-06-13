import { z } from 'zod';

export const CreateJobSchema = z.object({
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  branchId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(200).optional().nullable(),
  customerPhone: z.string().max(32).optional().nullable(),
  pickupAddress: z.string().min(1).max(500),
  dropoffAddress: z.string().min(1).max(500),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(1440),
  weightGrams: z.number().int().min(0).max(50_000_000).optional().nullable(),
  priceHellers: z.number().int().nonnegative().default(0),
  note: z.string().max(1000).optional().nullable(),
});
export type CreateJobDto = z.infer<typeof CreateJobSchema>;
