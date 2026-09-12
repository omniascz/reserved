import { z } from 'zod';
import { resourceTypes } from '@reserved/db';

// Sprint 10.2 — zdroje (přístroje) pro EMS.
// Sprint 10.23 — metadata pro restaurační stoly: počet míst + pozice na půdorysu.

export const ResourceMetadataSchema = z
  .object({
    /** Počet míst (stůl). */
    seats: z.number().int().positive().max(100),
    /** Pozice na půdorysu (px v editoru). */
    x: z.number(),
    y: z.number(),
    shape: z.enum(['round', 'square', 'rect']),
    combinable: z.boolean(),
  })
  .partial();
export type ResourceMetadata = z.infer<typeof ResourceMetadataSchema>;

export const CreateResourceSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(200),
  type: z.enum(resourceTypes).default('ems_machine'),
  metadata: ResourceMetadataSchema.optional(),
});
export type CreateResourceDto = z.infer<typeof CreateResourceSchema>;

export const UpdateResourceSchema = z
  .object({
    branchId: z.string().uuid(),
    name: z.string().min(1).max(200),
    type: z.enum(resourceTypes),
    isActive: z.boolean(),
    /** Merge do existující metadata (nepřepisuje nezmíněné klíče). */
    metadata: ResourceMetadataSchema,
  })
  .partial();
export type UpdateResourceDto = z.infer<typeof UpdateResourceSchema>;
