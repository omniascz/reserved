import { z } from 'zod';

/**
 * Token z ověřovacího odkazu. 32 náhodných bajtů v hexu = 64 znaků; horní mez
 * je schválně volnější, ať formát tokenu jde v budoucnu změnit bez rozbití API.
 */
export const VerifyEmailQuerySchema = z.object({
  token: z
    .string()
    .min(32, 'Token je příliš krátký.')
    .max(128)
    .regex(/^[a-f0-9]+$/i, 'Token má neplatný formát.'),
});
export type VerifyEmailQueryDto = z.infer<typeof VerifyEmailQuerySchema>;
