import { z } from 'zod';

export const CreateBlockSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  blockType: z.enum(['cleaning', 'training', 'meeting', 'maintenance', 'other']).default('other'),
  title: z.string().max(200).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});
export type CreateBlockDto = z.infer<typeof CreateBlockSchema>;

export const UpdateBlockSchema = CreateBlockSchema.partial();
export type UpdateBlockDto = z.infer<typeof UpdateBlockSchema>;
