import { z } from 'zod';

export const SuspendTenantSchema = z.object({
  reason: z.string().min(3, 'Duvod musi mit aspon 3 znaky').max(500),
});
export type SuspendTenantDto = z.infer<typeof SuspendTenantSchema>;

export const ExtendTrialSchema = z.object({
  days: z.number().int().min(1, 'Min 1 den').max(365, 'Max 365 dni'),
});
export type ExtendTrialDto = z.infer<typeof ExtendTrialSchema>;

export const ChangePlanSchema = z.object({
  plan: z.enum(['starter', 'professional', 'business', 'enterprise']),
});
export type ChangePlanDto = z.infer<typeof ChangePlanSchema>;
