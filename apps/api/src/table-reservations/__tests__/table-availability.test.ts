import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TURN_MINUTES,
  computeDeposit,
  computeEndsAt,
  pacingAllows,
  pickCombination,
  pickTable,
  resolveTurnTimeMinutes,
  type CombinationCandidate,
  type TurnTimeRule,
} from '../table-availability.js';

const RULES: TurnTimeRule[] = [
  { maxParty: 2, minutes: 90 },
  { maxParty: 4, minutes: 120 },
  { maxParty: 8, minutes: 150 },
];

describe('resolveTurnTimeMinutes', () => {
  it('vybere pravidlo dle velikosti skupiny', () => {
    expect(resolveTurnTimeMinutes(2, RULES)).toBe(90);
    expect(resolveTurnTimeMinutes(3, RULES)).toBe(120);
    expect(resolveTurnTimeMinutes(4, RULES)).toBe(120);
    expect(resolveTurnTimeMinutes(6, RULES)).toBe(150);
  });

  it('skupina větší než poslední pravidlo dostane minutáž posledního pravidla', () => {
    expect(resolveTurnTimeMinutes(20, RULES)).toBe(150);
  });

  it('prázdná pravidla → fallback', () => {
    expect(resolveTurnTimeMinutes(4, [])).toBe(DEFAULT_TURN_MINUTES);
    expect(resolveTurnTimeMinutes(4, [], 75)).toBe(75);
  });

  it('neseřazená pravidla se vyhodnotí správně', () => {
    const unsorted: TurnTimeRule[] = [
      { maxParty: 8, minutes: 150 },
      { maxParty: 2, minutes: 90 },
      { maxParty: 4, minutes: 120 },
    ];
    expect(resolveTurnTimeMinutes(2, unsorted)).toBe(90);
  });
});

describe('computeEndsAt', () => {
  it('konec = příchod + turn time + úklid', () => {
    const start = new Date('2026-06-23T18:00:00.000Z');
    expect(computeEndsAt(start, 120).toISOString()).toBe('2026-06-23T20:00:00.000Z');
    expect(computeEndsAt(start, 120, 15).toISOString()).toBe('2026-06-23T20:15:00.000Z');
  });

  it('bez úklidu je default 0', () => {
    const start = new Date('2026-06-23T12:00:00.000Z');
    expect(computeEndsAt(start, 90).toISOString()).toBe('2026-06-23T13:30:00.000Z');
  });
});

describe('pacingAllows', () => {
  const state = { coversBooked: 18, partiesBooked: 6 };

  it('povolí, když je pod stropy', () => {
    expect(pacingAllows(state, 2, 20, 8)).toBe(true);
  });

  it('zamítne při překročení stropu hostů', () => {
    expect(pacingAllows(state, 4, 20, 8)).toBe(false); // 18+4 > 20
  });

  it('zamítne při překročení stropu rezervací', () => {
    expect(pacingAllows({ coversBooked: 4, partiesBooked: 8 }, 2, 50, 8)).toBe(false); // 8+1 > 8
  });

  it('null strop = bez limitu na dané dimenzi', () => {
    expect(pacingAllows(state, 100, null, null)).toBe(true);
    expect(pacingAllows(state, 100, undefined, 8)).toBe(true); // covers neomezené
  });

  it('hraniční hodnota přesně na stropu projde', () => {
    expect(pacingAllows({ coversBooked: 18, partiesBooked: 7 }, 2, 20, 8)).toBe(true); // 20 a 8
  });
});

describe('pickTable', () => {
  const tables = [
    { id: 't2', seats: 2 },
    { id: 't4', seats: 4 },
    { id: 't6', seats: 6 },
  ];

  it('vybere nejmenší vyhovující stůl', () => {
    expect(pickTable(tables, 2)?.id).toBe('t2');
    expect(pickTable(tables, 3)?.id).toBe('t4');
    expect(pickTable(tables, 5)?.id).toBe('t6');
  });

  it('null, když žádný stůl nestačí', () => {
    expect(pickTable(tables, 10)).toBeNull();
  });

  it('při shodě míst rozhoduje priority', () => {
    const same = [
      { id: 'a', seats: 4, priority: 200 },
      { id: 'b', seats: 4, priority: 100 },
    ];
    expect(pickTable(same, 3)?.id).toBe('b');
  });
});

describe('computeDeposit', () => {
  it('bez prahu = žádná záloha', () => {
    expect(computeDeposit(10, null, 20000)).toBe(0);
    expect(computeDeposit(10, undefined, 20000)).toBe(0);
  });

  it('pod prahem = žádná záloha', () => {
    expect(computeDeposit(5, 8, 20000)).toBe(0);
  });

  it('na prahu i nad ním = záloha za hlavu', () => {
    expect(computeDeposit(8, 8, 20000)).toBe(160000);
    expect(computeDeposit(12, 8, 20000)).toBe(240000);
  });
});

describe('pickCombination', () => {
  const combos: CombinationCandidate[] = [
    { id: 'c56', resourceIds: ['t5', 't6'], combinedCapacity: 8, minPartySize: 5 },
    { id: 'c567', resourceIds: ['t5', 't6', 't7'], combinedCapacity: 12, minPartySize: 9 },
  ];

  it('vybere nejmenší vyhovující sestavu, jejíž stoly jsou volné', () => {
    const free = new Set(['t5', 't6', 't7']);
    expect(pickCombination(combos, 6, free)?.id).toBe('c56');
    expect(pickCombination(combos, 10, free)?.id).toBe('c567');
  });

  it('přeskočí sestavu, když některý stůl není volný', () => {
    const free = new Set(['t5', 't7']); // t6 obsazený
    expect(pickCombination(combos, 6, free)).toBeNull();
  });

  it('respektuje minPartySize (malá skupina nedostane velkou sestavu)', () => {
    const free = new Set(['t5', 't6', 't7']);
    expect(pickCombination(combos, 3, free)).toBeNull(); // 3 < min 5
  });

  it('null, když se skupina nevejde ani do největší sestavy', () => {
    const free = new Set(['t5', 't6', 't7']);
    expect(pickCombination(combos, 20, free)).toBeNull();
  });
});
