import { describe, expect, it } from 'vitest';
import { recurrenceOccurrences } from '../recurrence-occurrences.js';

const TZ = 'Europe/Prague';

describe('recurrenceOccurrences — čas lekce je místní', () => {
  it('úterý 18:00 v létě = 16:00 UTC, v zimě = 17:00 UTC', () => {
    const occ = recurrenceOccurrences(
      { daysOfWeek: [2], time: '18:00', startDate: '2026-10-13', endDate: '2026-11-03' },
      TZ,
    );
    expect(occ).toEqual([
      '2026-10-13T16:00:00.000Z',
      '2026-10-20T16:00:00.000Z',
      '2026-10-27T17:00:00.000Z', // po změně času 25. 10.
      '2026-11-03T17:00:00.000Z',
    ]);
  });

  it('vybere jen zadané dny v týdnu (Po + St) včetně krajních dat', () => {
    const occ = recurrenceOccurrences(
      { daysOfWeek: [1, 3], time: '07:00', startDate: '2026-06-01', endDate: '2026-06-10' },
      TZ,
    );
    expect(occ).toEqual([
      '2026-06-01T05:00:00.000Z', // Po
      '2026-06-03T05:00:00.000Z', // St
      '2026-06-08T05:00:00.000Z', // Po
      '2026-06-10T05:00:00.000Z', // St
    ]);
  });

  it('konec před začátkem → nic', () => {
    expect(
      recurrenceOccurrences(
        {
          daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
          time: '09:00',
          startDate: '2026-06-10',
          endDate: '2026-06-01',
        },
        TZ,
      ),
    ).toEqual([]);
  });

  it('pojistka: nejvýš 366 dní', () => {
    const occ = recurrenceOccurrences(
      {
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        time: '09:00',
        startDate: '2026-01-01',
        endDate: '2028-12-31',
      },
      TZ,
    );
    expect(occ).toHaveLength(366);
  });
});
