import { describe, expect, it } from 'vitest';
import {
  AdjustTimePackSchema,
  AllocateTimePackSchema,
  CreateTimePackSchema,
} from '../dto/time-pack.dto.js';

const UUID_A = '123e4567-e89b-12d3-a456-426614174000';

describe('CreateTimePackSchema', () => {
  it('accepts valid minimal input', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Fitness 30 dní',
      durationDays: 30,
      priceHellers: 120000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('CZK');
      expect(result.data.isActive).toBe(true);
      expect(result.data.maxBookingsPerPeriod).toBeUndefined();
      expect(result.data.maxBookingsPerDay).toBeUndefined();
      expect(result.data.allowedServiceIds).toEqual([]);
    }
  });

  it('accepts limity rezervaci', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Limited',
      durationDays: 30,
      maxBookingsPerPeriod: 10,
      maxBookingsPerDay: 1,
      priceHellers: 100000,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CreateTimePackSchema.safeParse({
      name: '',
      durationDays: 30,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive durationDays', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Test',
      durationDays: 0,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects durationDays > 10 let', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Test',
      durationDays: 4000,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Test',
      durationDays: 30,
      priceHellers: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts maxBookingsPerPeriod null = neomezeno', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Unlimited',
      durationDays: 30,
      maxBookingsPerPeriod: null,
      priceHellers: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxBookingsPerPeriod=0', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Zero',
      durationDays: 30,
      maxBookingsPerPeriod: 0,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxBookingsPerDay > 100', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Crazy',
      durationDays: 30,
      maxBookingsPerDay: 1000,
      priceHellers: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID allowedServiceIds', () => {
    const result = CreateTimePackSchema.safeParse({
      name: 'Test',
      durationDays: 30,
      priceHellers: 100,
      allowedServiceIds: ['not-uuid'],
    });
    expect(result.success).toBe(false);
  });
});

describe('AllocateTimePackSchema', () => {
  it('requires timePackId', () => {
    const result = AllocateTimePackSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts minimal input with UUID', () => {
    const result = AllocateTimePackSchema.safeParse({ timePackId: UUID_A });
    expect(result.success).toBe(true);
  });

  it('accepts price override + note', () => {
    const result = AllocateTimePackSchema.safeParse({
      timePackId: UUID_A,
      pricePaidHellers: 100000,
      note: 'sleva',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative price', () => {
    const result = AllocateTimePackSchema.safeParse({
      timePackId: UUID_A,
      pricePaidHellers: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('AdjustTimePackSchema', () => {
  it('accepts bookingsUsedDelta + note', () => {
    const result = AdjustTimePackSchema.safeParse({
      bookingsUsedDelta: -1,
      note: 'oprava',
    });
    expect(result.success).toBe(true);
  });

  it('accepts extendDays + note', () => {
    const result = AdjustTimePackSchema.safeParse({
      extendDays: 7,
      note: 'bonus 7 dni',
    });
    expect(result.success).toBe(true);
  });

  it('accepts both deltas', () => {
    const result = AdjustTimePackSchema.safeParse({
      bookingsUsedDelta: -2,
      extendDays: 14,
      note: 'kompenzace',
    });
    expect(result.success).toBe(true);
  });

  it('requires note', () => {
    const result = AdjustTimePackSchema.safeParse({ extendDays: 7 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer values', () => {
    const result = AdjustTimePackSchema.safeParse({
      extendDays: 7.5,
      note: 'pul dne',
    });
    expect(result.success).toBe(false);
  });
});
