import { z } from 'zod';

// POST /api/v1/auth/refresh — obnova access tokenu pomocí refresh tokenu.

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof RefreshSchema>;
