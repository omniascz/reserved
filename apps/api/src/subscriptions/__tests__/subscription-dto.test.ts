import { describe, expect, it } from 'vitest';
import {
  CancelSubscriptionSchema,
  CreateSubscriptionPlanSchema,
  SubscribeCustomerSchema,
  SubscriptionBenefitsSchema,
} from '../dto/subscription.dto.js';

const UUID_A = '123e4567-e89b-12d3-a456-426614174000';
const UUID_B = '223e4567-e89b-12d3-a456-426614174001';

describe('CreateSubscriptionPlanSchema', () => {
  it('accepts valid minimal input', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'VIP Membership',
      billingInterval: 'monthly',
      priceHellers: 49900,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('CZK');
      expect(result.data.trialDays).toBe(0);
      expect(result.data.isActive).toBe(true);
      expect(result.data.benefits).toEqual({});
    }
  });

  it('accepts trial + benefits', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'Premium',
      billingInterval: 'yearly',
      priceHellers: 500000,
      trialDays: 14,
      benefits: {
        discountPercent: 20,
        priorityAccess: true,
        freeCreditsPerPeriod: 2,
        exclusiveServiceIds: [UUID_A, UUID_B],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts quarterly billing', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'Q',
      billingInterval: 'quarterly',
      priceHellers: 150000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid billing interval', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'Bad',
      billingInterval: 'weekly',
      priceHellers: 10000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: '',
      billingInterval: 'monthly',
      priceHellers: 10000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive price', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'X',
      billingInterval: 'monthly',
      priceHellers: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects trial > 1 rok', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'X',
      billingInterval: 'monthly',
      priceHellers: 1000,
      trialDays: 400,
    });
    expect(result.success).toBe(false);
  });

  it('rejects discount > 100%', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'X',
      billingInterval: 'monthly',
      priceHellers: 1000,
      benefits: { discountPercent: 150 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative discount', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'X',
      billingInterval: 'monthly',
      priceHellers: 1000,
      benefits: { discountPercent: -5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID exclusiveServiceIds', () => {
    const result = CreateSubscriptionPlanSchema.safeParse({
      name: 'X',
      billingInterval: 'monthly',
      priceHellers: 1000,
      benefits: { exclusiveServiceIds: ['not-uuid'] },
    });
    expect(result.success).toBe(false);
  });
});

describe('SubscribeCustomerSchema', () => {
  it('requires planId + URLs', () => {
    const result = SubscribeCustomerSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts valid input', () => {
    const result = SubscribeCustomerSchema.safeParse({
      planId: UUID_A,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-URL successUrl', () => {
    const result = SubscribeCustomerSchema.safeParse({
      planId: UUID_A,
      successUrl: 'not-a-url',
      cancelUrl: 'https://example.com/cancel',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID planId', () => {
    const result = SubscribeCustomerSchema.safeParse({
      planId: 'not-uuid',
      successUrl: 'https://example.com',
      cancelUrl: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('CancelSubscriptionSchema', () => {
  it('accepts default atPeriodEnd=true', () => {
    const result = CancelSubscriptionSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.atPeriodEnd).toBe(true);
  });

  it('accepts atPeriodEnd=false + reason', () => {
    const result = CancelSubscriptionSchema.safeParse({
      atPeriodEnd: false,
      reason: 'Bad service',
    });
    expect(result.success).toBe(true);
  });
});

describe('SubscriptionBenefitsSchema', () => {
  it('accepts empty object', () => {
    const result = SubscriptionBenefitsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts all fields', () => {
    const result = SubscriptionBenefitsSchema.safeParse({
      discountPercent: 15,
      priorityAccess: true,
      freeCreditsPerPeriod: 5,
      exclusiveServiceIds: [UUID_A],
    });
    expect(result.success).toBe(true);
  });

  it('rejects freeCreditsPerPeriod > 1000', () => {
    const result = SubscriptionBenefitsSchema.safeParse({
      freeCreditsPerPeriod: 5000,
    });
    expect(result.success).toBe(false);
  });
});
