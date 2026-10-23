import { describe, expect, it } from 'vitest';
import { seriesOccurrence } from '../occurrence.js';
import { toLocalParts } from '../../common/local-time.js';

const TZ = 'Europe/Prague';
const local = (d: Date) => toLocalParts(d, TZ);

// Scénáře změny času převzaté z cal.com testů (calcom/cal.diy@0f19cc4
// packages/features/schedules/lib/date-ranges.test.ts, MIT) a přizpůsobené CZ.
describe('seriesOccurrence — změna letního času', () => {
  it('týdenní série přes 29. 3. drží 10:00 místního času', () => {
    const first = new Date('2026-03-19T09:00:00Z'); // 19. 3. 10:00 SEČ
    const occ = [0, 1, 2, 3].map((i) => local(seriesOccurrence(first, 'weekly', i, TZ)));
    expect(occ).toEqual([
      { date: '2026-03-19', time: '10:00' },
      { date: '2026-03-26', time: '10:00' },
      { date: '2026-04-02', time: '10:00' },
      { date: '2026-04-09', time: '10:00' },
    ]);
  });

  it('týdenní série přes 25. 10. drží 18:00 místního času', () => {
    const first = new Date('2026-10-15T16:00:00Z'); // 15. 10. 18:00 SELČ
    const occ = [0, 1, 2].map((i) => seriesOccurrence(first, 'weekly', i, TZ));
    expect(occ.map(local)).toEqual([
      { date: '2026-10-15', time: '18:00' },
      { date: '2026-10-22', time: '18:00' },
      { date: '2026-10-29', time: '18:00' },
    ]);
    // a v UTC se tím hodina opravdu posune (SELČ +2 → SEČ +1)
    expect(occ[2]!.toISOString()).toBe('2026-10-29T17:00:00.000Z');
  });

  it('čtrnáctidenní série přes 29. 3.', () => {
    const first = new Date('2026-03-20T07:30:00Z'); // 20. 3. 8:30 SEČ
    const third = seriesOccurrence(first, 'biweekly', 2, TZ);
    expect(local(third)).toEqual({ date: '2026-04-17', time: '08:30' });
  });
});

describe('seriesOccurrence — měsíční série', () => {
  it('z 31. 1. připadne na konec února, ne na 3. 3.', () => {
    const first = new Date('2026-01-31T09:00:00Z'); // 31. 1. 10:00
    const occ = [0, 1, 2, 3].map((i) => local(seriesOccurrence(first, 'monthly', i, TZ)));
    expect(occ).toEqual([
      { date: '2026-01-31', time: '10:00' },
      { date: '2026-02-28', time: '10:00' },
      { date: '2026-03-31', time: '10:00' },
      { date: '2026-04-30', time: '10:00' },
    ]);
  });

  it('přestupný rok: 31. 1. 2028 → 29. 2. 2028', () => {
    const first = new Date('2028-01-31T09:00:00Z');
    expect(local(seriesOccurrence(first, 'monthly', 1, TZ))).toEqual({
      date: '2028-02-29',
      time: '10:00',
    });
  });

  it('přes přelom roku', () => {
    const first = new Date('2026-11-15T13:00:00Z'); // 15. 11. 14:00
    expect(local(seriesOccurrence(first, 'monthly', 3, TZ))).toEqual({
      date: '2027-02-15',
      time: '14:00',
    });
  });
});

describe('seriesOccurrence — první výskyt', () => {
  it('index 0 vrací přesně zadaný začátek', () => {
    const first = new Date('2026-07-01T06:15:00Z');
    for (const f of ['weekly', 'biweekly', 'monthly'] as const) {
      expect(seriesOccurrence(first, f, 0, TZ).toISOString()).toBe(first.toISOString());
    }
  });
});
