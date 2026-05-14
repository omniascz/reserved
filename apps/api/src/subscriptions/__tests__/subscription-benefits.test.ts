// Unit testy pro merge logic SubscriptionsService.getActiveBenefitsForCustomer
// (sprint 3.3 fáze A — benefits). Testuje cistou matematiku bez DB.

import { describe, expect, it } from 'vitest';

type Benefits = {
  discountPercent?: number;
  priorityAccess?: boolean;
  freeCreditsPerPeriod?: number;
  exclusiveServiceIds?: string[];
};

// Replikuje merge logiku z SubscriptionsService.getActiveBenefitsForCustomer
function mergeBenefits(
  subs: Array<{ status: string; snapshotBenefits: Benefits }>,
): Benefits | null {
  const active = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
  if (active.length === 0) return null;
  const merged: Benefits = {};
  for (const sub of active) {
    const b = sub.snapshotBenefits;
    if (b.discountPercent !== undefined) {
      merged.discountPercent = Math.max(merged.discountPercent ?? 0, b.discountPercent);
    }
    if (b.priorityAccess) merged.priorityAccess = true;
    if (b.freeCreditsPerPeriod !== undefined) {
      merged.freeCreditsPerPeriod = (merged.freeCreditsPerPeriod ?? 0) + b.freeCreditsPerPeriod;
    }
    if (b.exclusiveServiceIds) {
      merged.exclusiveServiceIds = Array.from(
        new Set([...(merged.exclusiveServiceIds ?? []), ...b.exclusiveServiceIds]),
      );
    }
  }
  return merged;
}

// Replikuje getBookingDiscountFor pricing logiku
function applyDiscount(basePriceHellers: number, discountPercent: number): number {
  return Math.round(basePriceHellers * (1 - discountPercent / 100));
}

const UUID_A = '123e4567-e89b-12d3-a456-426614174000';
const UUID_B = '223e4567-e89b-12d3-a456-426614174001';

describe('mergeBenefits', () => {
  it('vrati null kdyz neni zadny aktivni sub', () => {
    expect(mergeBenefits([])).toBeNull();
    expect(
      mergeBenefits([{ status: 'canceled', snapshotBenefits: { discountPercent: 20 } }]),
    ).toBeNull();
  });

  it('vrati benefits z jedineho aktivniho sub', () => {
    const result = mergeBenefits([
      { status: 'active', snapshotBenefits: { discountPercent: 20, priorityAccess: true } },
    ]);
    expect(result).toEqual({ discountPercent: 20, priorityAccess: true });
  });

  it('vyhrava nejvyssi discount', () => {
    const result = mergeBenefits([
      { status: 'active', snapshotBenefits: { discountPercent: 10 } },
      { status: 'trialing', snapshotBenefits: { discountPercent: 30 } },
      { status: 'active', snapshotBenefits: { discountPercent: 20 } },
    ]);
    expect(result?.discountPercent).toBe(30);
  });

  it('summuje free credits', () => {
    const result = mergeBenefits([
      { status: 'active', snapshotBenefits: { freeCreditsPerPeriod: 2 } },
      { status: 'active', snapshotBenefits: { freeCreditsPerPeriod: 5 } },
    ]);
    expect(result?.freeCreditsPerPeriod).toBe(7);
  });

  it('OR pro priority access', () => {
    const result = mergeBenefits([
      { status: 'active', snapshotBenefits: { priorityAccess: false } },
      { status: 'active', snapshotBenefits: { priorityAccess: true } },
    ]);
    expect(result?.priorityAccess).toBe(true);
  });

  it('union exclusive service IDs (deduplikace)', () => {
    const result = mergeBenefits([
      { status: 'active', snapshotBenefits: { exclusiveServiceIds: [UUID_A, UUID_B] } },
      { status: 'active', snapshotBenefits: { exclusiveServiceIds: [UUID_A] } },
    ]);
    expect(result?.exclusiveServiceIds?.sort()).toEqual([UUID_A, UUID_B].sort());
  });

  it('trialing se pocita jako aktivni', () => {
    const result = mergeBenefits([
      { status: 'trialing', snapshotBenefits: { discountPercent: 15 } },
    ]);
    expect(result?.discountPercent).toBe(15);
  });

  it('past_due se nepocita', () => {
    const result = mergeBenefits([
      { status: 'past_due', snapshotBenefits: { discountPercent: 25 } },
    ]);
    expect(result).toBeNull();
  });

  it('canceled se nepocita', () => {
    const result = mergeBenefits([
      { status: 'canceled', snapshotBenefits: { discountPercent: 25 } },
    ]);
    expect(result).toBeNull();
  });
});

describe('applyDiscount', () => {
  it('0% = beze zmeny', () => {
    expect(applyDiscount(50000, 0)).toBe(50000);
  });

  it('20% sleva z 1000 Kc = 800 Kc', () => {
    expect(applyDiscount(100000, 20)).toBe(80000);
  });

  it('100% sleva = 0', () => {
    expect(applyDiscount(50000, 100)).toBe(0);
  });

  it('zaokrouhleni haléřů u necelych slev', () => {
    // 15 % z 1234 halere = 1048.9 -> 1049
    expect(applyDiscount(1234, 15)).toBe(1049);
  });

  it('33% z 99900 = 66933', () => {
    expect(applyDiscount(99900, 33)).toBe(66933);
  });
});
