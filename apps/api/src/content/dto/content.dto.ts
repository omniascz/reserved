import { z } from 'zod';
import { contentAccessLevels } from '@reserved/db';

export const CreateContentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  videoUrl: z.string().url().max(2000),
  thumbnailUrl: z.string().url().max(2000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  accessLevel: z.enum(contentAccessLevels).default('members'),
  durationSeconds: z.number().int().min(0).max(86400).optional().nullable(),
  isPublished: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
export type CreateContentDto = z.infer<typeof CreateContentSchema>;

export const UpdateContentSchema = CreateContentSchema.partial();
export type UpdateContentDto = z.infer<typeof UpdateContentSchema>;
