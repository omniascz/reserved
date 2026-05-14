import { z } from 'zod';

export const SubscriptionBenefitsSchema = z.object({
  discountPercent: z.number().int().min(0).max(100).optional(),
  priorityAccess: z.boolean().optional(),
  freeCreditsPerPeriod: z.number().int().nonnegative().max(1000).optional(),
  exclusiveServiceIds: z.array(z.string().uuid()).optional(),
});
export type SubscriptionBenefitsDto = z.infer<typeof SubscriptionBenefitsSchema>;

export const CreateSubscriptionPlanSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  billingInterval: z.enum(['monthly', 'quarterly', 'yearly']),
  priceHellers: z.number().int().positive(),
  currency: z.string().length(3).default('CZK'),
  trialDays: z.number().int().min(0).max(365).default(0),
  benefits: SubscriptionBenefitsSchema.default({}),
  isActive: z.boolean().default(true),
});
export type CreateSubscriptionPlanDto = z.infer<typeof CreateSubscriptionPlanSchema>;

export const UpdateSubscriptionPlanSchema = CreateSubscriptionPlanSchema.partial();
export type UpdateSubscriptionPlanDto = z.infer<typeof UpdateSubscriptionPlanSchema>;

// Subscribe (admin alokace nebo customer self-subscribe)
export const SubscribeCustomerSchema = z.object({
  planId: z.string().uuid(),
  /** Volitelne pro success URL (vraceni po dokonceni). */
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  note: z.string().max(500).optional().nullable(),
});
export type SubscribeCustomerDto = z.infer<typeof SubscribeCustomerSchema>;

// Cancel
export const CancelSubscriptionSchema = z.object({
  /** True (default) = zustane aktivni do konce period, pak zrusi.
      False = okamzite zrusi (Stripe refund proporcionalne podle settings). */
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().max(500).optional().nullable(),
});
export type CancelSubscriptionDto = z.infer<typeof CancelSubscriptionSchema>;
