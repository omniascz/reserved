import { describe, it, expect } from 'vitest';
import { computeDynamicClassPrice, DEFAULT_DYNAMIC_PRICING } from '../settings.types.js';

const cfg = {
  ...DEFAULT_DYNAMIC_PRICING,
  enabled: true,
  offPeakStartHour: 9,
  offPeakEndHour: 15,
  offPeakDiscountPct: 20,
  highDemandFillPct: 80,
  highDemandSurgePct: 15,
  lowDemandFillPct: 20,
  lowDemandDiscountPct: 15,
};

describe('computeDynamicClassPrice', () => {
  it('vrací bazickou cenu když je vypnuto', () => {
    const r = computeDynamicClassPrice(50000, 10, 0, 10, { ...cfg, enabled: false });
    expect(r.effectiveHellers).toBe(50000);
    expect(r.adjustments).toHaveLength(0);
  });

  it('off-peak sleva 20 % + nízká poptávka sleva 15 %', () => {
    // 12:00 (off-peak), prázdná lekce 0/10 (fill 0 % <= 20)
    const r = computeDynamicClassPrice(50000, 12, 0, 10, cfg);
    // 50000 * 0.8 * 0.85 = 34000
    expect(r.effectiveHellers).toBe(34000);
    expect(r.adjustments).toContain('off-peak -20%');
    expect(r.adjustments).toContain('nízká poptávka -15%');
  });

  it('špička (18:00) + vysoká poptávka → přirážka 15 %', () => {
    // 18:00 (mimo off-peak), 9/10 (fill 90 % >= 80)
    const r = computeDynamicClassPrice(50000, 18, 9, 10, cfg);
    // 50000 * 1.15 = 57500
    expect(r.effectiveHellers).toBe(57500);
    expect(r.adjustments).toEqual(['vysoká poptávka +15%']);
  });

  it('nulová bazická cena zůstává nula', () => {
    const r = computeDynamicClassPrice(0, 12, 0, 10, cfg);
    expect(r.effectiveHellers).toBe(0);
  });
});
