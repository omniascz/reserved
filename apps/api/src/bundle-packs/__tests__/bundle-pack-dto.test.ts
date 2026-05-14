import { describe, expect, it } from 'vitest';
import {
  AdjustBundleItemSchema,
  AllocateBundlePackSchema,
  CreateBundlePackSchema,
} from '../dto/bundle-pack.dto.js';

const UUID_A = '123e4567-e89b-12d3-a456-426614174000';
const UUID_B = '223e4567-e89b-12d3-a456-426614174001';

describe('CreateBundlePackSchema', () => {
  it('accepts valid minimal input', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Relaxační balíček',
      items: [{ serviceId: UUID_A, quantity: 1 }],
      priceHellers: 220000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('CZK');
      expect(result.data.isActive).toBe(true);
      expect(result.data.sameVisitRequired).toBe(false);
      expect(result.data.allowedBranchIds).toEqual([]);
    }
  });

  it('accepts multiple items', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Bundle XL',
      items: [
        { serviceId: UUID_A, quantity: 1 },
        { serviceId: UUID_B, quantity: 2 },
      ],
      priceHellers: 300000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty items array', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Prázdný',
      items: [],
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive quantity', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Test',
      items: [{ serviceId: UUID_A, quantity: 0 }],
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID serviceId', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Test',
      items: [{ serviceId: 'not-uuid', quantity: 1 }],
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: '',
      items: [{ serviceId: UUID_A, quantity: 1 }],
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Test',
      items: [{ serviceId: UUID_A, quantity: 1 }],
      priceHellers: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts validityDays null = bez expirace', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Bez expirace',
      items: [{ serviceId: UUID_A, quantity: 1 }],
      priceHellers: 100,
      validityDays: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.validityDays).toBeNull();
  });

  it('rejects validityDays > 10 let', () => {
    const result = CreateBundlePackSchema.safeParse({
      name: 'Test',
      items: [{ serviceId: UUID_A, quantity: 1 }],
      priceHellers: 100,
      validityDays: 4000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 items', () => {
    const items = Array.from({ length: 21 }, () => ({ serviceId: UUID_A, quantity: 1 }));
    const result = CreateBundlePackSchema.safeParse({
      name: 'Too many',
      items,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe('AllocateBundlePackSchema', () => {
  it('requires bundlePackId', () => {
    const result = AllocateBundlePackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts minimal input with UUID', () => {
    const result = AllocateBundlePackSchema.safeParse({ bundlePackId: UUID_A });
    expect(result.success).toBe(true);
  });

  it('accepts price override + note', () => {
    const result = AllocateBundlePackSchema.safeParse({
      bundlePackId: UUID_A,
      pricePaidHellers: 200000,
      note: 'sleva pro VIP',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative price override', () => {
    const result = AllocateBundlePackSchema.safeParse({
      bundlePackId: UUID_A,
      pricePaidHellers: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('AdjustBundleItemSchema', () => {
  it('accepts positive delta + note', () => {
    const result = AdjustBundleItemSchema.safeParse({
      serviceId: UUID_A,
      quantityDelta: 1,
      note: 'Bonus za stížnost',
    });
    expect(result.success).toBe(true);
  });

  it('accepts negative delta', () => {
    const result = AdjustBundleItemSchema.safeParse({
      serviceId: UUID_A,
      quantityDelta: -1,
      note: 'Oprava',
    });
    expect(result.success).toBe(true);
  });

  it('requires note', () => {
    const result = AdjustBundleItemSchema.safeParse({
      serviceId: UUID_A,
      quantityDelta: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer delta', () => {
    const result = AdjustBundleItemSchema.safeParse({
      serviceId: UUID_A,
      quantityDelta: 0.5,
      note: 'pul',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID serviceId', () => {
    const result = AdjustBundleItemSchema.safeParse({
      serviceId: 'not-uuid',
      quantityDelta: 1,
      note: 'x',
    });
    expect(result.success).toBe(false);
  });
});
