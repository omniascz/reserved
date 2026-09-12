import { z } from 'zod';

export const PlatformLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
});
export type PlatformLoginDto = z.infer<typeof PlatformLoginSchema>;

export const PlatformRefreshSchema = z.object({
  refreshToken: z.string().min(20).max(2000),
});
export type PlatformRefreshDto = z.infer<typeof PlatformRefreshSchema>;

export const PlatformChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Heslo musi mit alespon 8 znaku').max(200),
});
export type PlatformChangePasswordDto = z.infer<typeof PlatformChangePasswordSchema>;
