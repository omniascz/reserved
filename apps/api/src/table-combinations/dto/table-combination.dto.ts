import { z } from 'zod';

export const CreateTableCombinationSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(100),
  /** Stoly (resource ids), které sestavu tvoří — aspoň dva. */
  resourceIds: z.array(z.string().uuid()).min(2),
  combinedCapacity: z.number().int().positive(),
  minPartySize: z.number().int().positive().default(1),
});
export type CreateTableCombinationDto = z.infer<typeof CreateTableCombinationSchema>;

export const UpdateTableCombinationSchema = CreateTableCombinationSchema.partial().omit({
  branchId: true,
});
export type UpdateTableCombinationDto = z.infer<typeof UpdateTableCombinationSchema>;
