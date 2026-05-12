import { z } from 'zod';

const SlugRegex = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const CreateBranchSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(SlugRegex, 'Slug může obsahovat jen malá písmena, čísla a pomlčky.'),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  country: z.string().length(2).default('CZ'),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  timezone: z.string().max(64).optional().nullable(),
});

export type CreateBranchDto = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = CreateBranchSchema.partial();
export type UpdateBranchDto = z.infer<typeof UpdateBranchSchema>;
