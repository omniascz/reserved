import { describe, expect, it } from 'vitest';
import {
  AdjustCreditsSchema,
  AllocateCreditPackSchema,
  CreateCreditPackSchema,
} from '../dto/credit-pack.dto.js';

describe('CreateCreditPackSchema', () => {
  it('accepts valid minimal input', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: '10× EMS',
      totalCredits: 10,
      priceHellers: 300000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mode).toBe('per_visit'); // default
      expect(result.data.currency).toBe('CZK'); // default
      expect(result.data.isActive).toBe(true); // default
      expect(result.data.allowedServiceIds).toEqual([]);
    }
  });

  it('rejects empty name', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: '',
      totalCredits: 10,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive totalCredits', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Test',
      totalCredits: 0,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Test',
      totalCredits: 10,
      priceHellers: -100,
    });
    expect(result.success).toBe(false);
  });

  it('accepts per_credit mode with creditCostsByService', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Mix',
      mode: 'per_credit',
      totalCredits: 50,
      priceHellers: 500000,
      creditCostsByService: {
        '123e4567-e89b-12d3-a456-426614174000': 1,
        '223e4567-e89b-12d3-a456-426614174001': 2,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid mode', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Test',
      mode: 'invalid_mode',
      totalCredits: 10,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID allowedServiceIds', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Test',
      totalCredits: 10,
      priceHellers: 100,
      allowedServiceIds: ['not-a-uuid'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts validityDays null = bez expirace', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Test',
      totalCredits: 10,
      priceHellers: 100,
      validityDays: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.validityDays).toBeNull();
    }
  });

  it('rejects validityDays > 10 let (3650 dni)', () => {
    const result = CreateCreditPackSchema.safeParse({
      name: 'Test',
      totalCredits: 10,
      priceHellers: 100,
      validityDays: 4000,
    });
    expect(result.success).toBe(false);
  });
});

describe('AllocateCreditPackSchema', () => {
  it('requires creditPackId', () => {
    const result = AllocateCreditPackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts minimal input with UUID', () => {
    const result = AllocateCreditPackSchema.safeParse({
      creditPackId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(result.success).toBe(true);
  });

  it('accepts price override', () => {
    const result = AllocateCreditPackSchema.safeParse({
      creditPackId: '123e4567-e89b-12d3-a456-426614174000',
      pricePaidHellers: 250000,
      note: 'dárek za 5. návštěvu',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative price override', () => {
    const result = AllocateCreditPackSchema.safeParse({
      creditPackId: '123e4567-e89b-12d3-a456-426614174000',
      pricePaidHellers: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe('AdjustCreditsSchema', () => {
  it('accepts positive delta + note', () => {
    const result = AdjustCreditsSchema.safeParse({
      creditsDelta: 5,
      note: 'Bonus',
    });
    expect(result.success).toBe(true);
  });

  it('accepts negative delta', () => {
    const result = AdjustCreditsSchema.safeParse({
      creditsDelta: -3,
      note: 'Sranka',
    });
    expect(result.success).toBe(true);
  });

  it('requires note', () => {
    const result = AdjustCreditsSchema.safeParse({
      creditsDelta: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer delta', () => {
    const result = AdjustCreditsSchema.safeParse({
      creditsDelta: 1.5,
      note: 'pul kreditu',
    });
    expect(result.success).toBe(false);
  });
});
