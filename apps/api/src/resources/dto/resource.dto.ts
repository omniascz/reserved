import { z } from 'zod';
import { resourceTypes } from '@reserved/db';

// Sprint 10.2 — zdroje (přístroje) pro EMS.

export const CreateResourceSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(resourceTypes).default('ems_machine'),
});
export type CreateResourceDto = z.infer<typeof CreateResourceSchema>;

export const UpdateResourceSchema = z
  .object({
    branchId: z.string().uuid(),
    name: z.string().min(1).max(200),
    type: z.enum(resourceTypes),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateResourceDto = z.infer<typeof UpdateResourceSchema>;
