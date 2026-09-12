import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_PRESET_VALUES,
  DEFAULT_CANCELLATION_POLICY,
  extractCancellationPolicy,
  resolveCancelOutcome,
  resolveCancellationPolicy,
  resolveRollover,
} from '../cancellation-policy.js';

describe('cancellation-policy: presety', () => {
  it('default je Férový', () => {
    expect(DEFAULT_CANCELLATION_POLICY.preset).toBe('fair');
    expect(DEFAULT_CANCELLATION_POLICY.freeCancelHours).toBe(12);
    expect(DEFAULT_CANCELLATION_POLICY.lateCancel).toBe('makeup_credit');
    expect(DEFAULT_CANCELLATION_POLICY.rolloverMax).toBe(2);
  });

  it('volba presetu vždy přebije zastaralé páčky (preset = zdroj pravdy)', () => {
    // Uložené páčky neodpovídají presetu „strict" → resolve je ignoruje.
    const eff = resolveCancellationPolicy({
      preset: 'strict',
      freeCancelHours: 1,
      lateCancel: 'makeup_credit',
      rolloverEnabled: true,
    });
    expect(eff).toEqual(CANCELLATION_PRESET_VALUES.strict);
    expect(eff.freeCancelHours).toBe(24);
    expect(eff.lateCancel).toBe('lose_lesson');
    expect(eff.rolloverEnabled).toBe(false);
  });

  it('custom režim bere páčky doslova', () => {
    const eff = resolveCancellationPolicy({
      preset: 'custom',
      freeCancelHours: 6,
      lateCancel: 'lose_lesson',
      rolloverEnabled: true,
      rolloverMax: 5,
    });
    expect(eff.preset).toBe('custom');
    expect(eff.freeCancelHours).toBe(6);
    expect(eff.rolloverMax).toBe(5);
  });

  it('extractCancellationPolicy: chybějící klíč → default Férový', () => {
    expect(extractCancellationPolicy(null)).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(extractCancellationPolicy({})).toEqual(DEFAULT_CANCELLATION_POLICY);
    expect(extractCancellationPolicy({ cancellationPolicy: { preset: 'generous' } })).toEqual(
      CANCELLATION_PRESET_VALUES.generous,
    );
  });
});

describe('cancellation-policy: storno výsledek', () => {
  const fair = CANCELLATION_PRESET_VALUES.fair; // okno 12h, pozdě→makeup
  const strict = CANCELLATION_PRESET_VALUES.strict; // okno 24h, pozdě→propadá

  it('zrušení v okně → lekce se vrací', () => {
    const o = resolveCancelOutcome(fair, { hoursUntilStart: 24, kind: 'cancel' });
    expect(o.returnLesson).toBe(true);
    expect(o.issueMakeup).toBe(false);
    expect(o.reasonCode).toBe('free_cancel');
  });

  it('Férový: pozdní zrušení → náhradový kredit (60 dní)', () => {
    const o = resolveCancelOutcome(fair, { hoursUntilStart: 3, kind: 'cancel' });
    expect(o.returnLesson).toBe(false);
    expect(o.issueMakeup).toBe(true);
    expect(o.makeupValidDays).toBe(60);
    expect(o.reasonCode).toBe('late_makeup');
  });

  it('Přísný: pozdní zrušení → lekce propadá', () => {
    const o = resolveCancelOutcome(strict, { hoursUntilStart: 3, kind: 'cancel' });
    expect(o.returnLesson).toBe(false);
    expect(o.issueMakeup).toBe(false);
    expect(o.reasonCode).toBe('late_lose');
  });

  it('hranice okna: přesně na okně se počítá jako včas', () => {
    const o = resolveCancelOutcome(fair, { hoursUntilStart: 12, kind: 'cancel' });
    expect(o.returnLesson).toBe(true);
  });

  it('no-show: Přísný propadá, Benevolentní dává náhradu', () => {
    expect(resolveCancelOutcome(strict, { hoursUntilStart: 0, kind: 'no_show' }).issueMakeup).toBe(
      false,
    );
    const gen = resolveCancelOutcome(CANCELLATION_PRESET_VALUES.generous, {
      hoursUntilStart: 0,
      kind: 'no_show',
    });
    expect(gen.issueMakeup).toBe(true);
    expect(gen.reasonCode).toBe('noshow_makeup');
  });
});

describe('cancellation-policy: rollover', () => {
  it('Férový: přenese max 2 z 5 nevyčerpaných', () => {
    const r = resolveRollover(CANCELLATION_PRESET_VALUES.fair, { unusedCredits: 5 });
    expect(r.credits).toBe(2);
    expect(r.extendDays).toBe(30);
  });

  it('Férový: nevyčerpané < limit → přenese vše dostupné', () => {
    expect(resolveRollover(CANCELLATION_PRESET_VALUES.fair, { unusedCredits: 1 }).credits).toBe(1);
  });

  it('Benevolentní: bez limitu přenese vše', () => {
    expect(
      resolveRollover(CANCELLATION_PRESET_VALUES.generous, { unusedCredits: 17 }).credits,
    ).toBe(17);
  });

  it('Přísný: rollover vypnutý → 0', () => {
    expect(resolveRollover(CANCELLATION_PRESET_VALUES.strict, { unusedCredits: 9 }).credits).toBe(
      0,
    );
  });

  it('žádné nevyčerpané → 0', () => {
    expect(resolveRollover(CANCELLATION_PRESET_VALUES.fair, { unusedCredits: 0 }).credits).toBe(0);
  });
});
