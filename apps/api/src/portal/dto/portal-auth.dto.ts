import { z } from 'zod';

export const RequestMagicLinkSchema = z.object({
  email: z.string().email('Neplatný e-mail').max(255),
  /** Volitelně: pokud zákazník při registraci přes widget zadal jméno,
   *  můžeme ho uložit do customers při verify. */
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export type RequestMagicLinkDto = z.infer<typeof RequestMagicLinkSchema>;

export const VerifyMagicLinkSchema = z.object({
  token: z.string().min(32).max(256),
});

export type VerifyMagicLinkDto = z.infer<typeof VerifyMagicLinkSchema>;

export const PortalLoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
});

export type PortalLoginDto = z.infer<typeof PortalLoginSchema>;

export const SetPasswordSchema = z.object({
  password: z.string().min(8, 'Heslo musí mít aspoň 8 znaků').max(200),
});

export type SetPasswordDto = z.infer<typeof SetPasswordSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(20).max(2000),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
