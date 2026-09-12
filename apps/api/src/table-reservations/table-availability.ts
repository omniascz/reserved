// Pure logika rezervace stolu — bez DB, bez NestJS. Jen čisté funkce.
// Reference: reserved-docs/VERTIKALA-RESTAURACE.md (fáze R1).
//
// Tři odpovědnosti:
//   1. resolveTurnTimeMinutes — jak dlouho skupina obsadí stůl (dle počtu hostů)
//   2. computeEndsAt          — konec obsazení = příchod + turn time + úklid
//   3. pacingAllows / pickTable — vejde se rezervace do stropů a na který stůl

/** Výchozí doba sezení, když směna nemá pravidlo ani není override. */
export const DEFAULT_TURN_MINUTES = 120;

/** Jedno pravidlo doby sezení (z `service_periods.turn_time_rules`). */
export interface TurnTimeRule {
  /** Platí pro skupiny do tohoto počtu hostů včetně. */
  maxParty: number;
  /** Doba obsazení stolu v minutách (bez úklidového bufferu). */
  minutes: number;
}

/**
 * Vybere dobu sezení (v minutách) podle velikosti skupiny.
 * Pravidla se seřadí vzestupně dle maxParty a vezme se první, do kterého se
 * skupina vejde. Když žádné nevyhovuje (větší skupina než poslední pravidlo),
 * použije se minutáž posledního pravidla. Prázdná pravidla → fallback.
 */
export function resolveTurnTimeMinutes(
  partySize: number,
  rules: TurnTimeRule[],
  fallbackMinutes: number = DEFAULT_TURN_MINUTES,
): number {
  if (!Array.isArray(rules) || rules.length === 0) return fallbackMinutes;
  const sorted = [...rules].sort((a, b) => a.maxParty - b.maxParty);
  for (const rule of sorted) {
    if (partySize <= rule.maxParty) return rule.minutes;
  }
  return sorted[sorted.length - 1]!.minutes;
}

/**
 * Konec obsazení stolu = příchod + doba sezení + úklidový buffer.
 * Půlotevřený interval: v `endsAt` je stůl volný pro dalšího hosta.
 */
export function computeEndsAt(startsAt: Date, turnMinutes: number, cleaningMinutes = 0): Date {
  return new Date(startsAt.getTime() + (turnMinutes + cleaningMinutes) * 60_000);
}

/** Aktuální obsazenost jednoho příchodového slotu (pro pacing). */
export interface PacingState {
  /** Součet hostů už rezervovaných v tomto slotu. */
  coversBooked: number;
  /** Počet rezervací už v tomto slotu. */
  partiesBooked: number;
}

/**
 * Vejde se nová skupina do pacing stropů slotu?
 * `null`/`undefined` strop = bez limitu na dané dimenzi.
 */
export function pacingAllows(
  state: PacingState,
  newPartySize: number,
  maxCoversPerSlot?: number | null,
  maxPartiesPerSlot?: number | null,
): boolean {
  if (maxCoversPerSlot != null && state.coversBooked + newPartySize > maxCoversPerSlot) {
    return false;
  }
  if (maxPartiesPerSlot != null && state.partiesBooked + 1 > maxPartiesPerSlot) {
    return false;
  }
  return true;
}

/** Kandidátní (volný) stůl pro přiřazení skupině. */
export interface CandidateTable {
  id: string;
  /** Počet míst u stolu. */
  seats: number;
  /** Pořadí přiřazování (menší dřív); default dle počtu míst. */
  priority?: number;
}

/**
 * Vybere nejvhodnější volný stůl pro skupinu: nejmenší stůl, do kterého se
 * skupina vejde (ať velké stoly zůstanou pro velké skupiny). Při shodě
 * rozhoduje `priority`. Vrací `null`, když žádný stůl nestačí.
 */
export function pickTable(candidates: CandidateTable[], partySize: number): CandidateTable | null {
  const fitting = candidates.filter((t) => t.seats >= partySize);
  if (fitting.length === 0) return null;
  fitting.sort((a, b) => {
    if (a.seats !== b.seats) return a.seats - b.seats;
    return (a.priority ?? a.seats) - (b.priority ?? b.seats);
  });
  return fitting[0]!;
}

/**
 * Záloha za skupinu (haléře). Vyžaduje se od `thresholdGuests` hostů výš,
 * počítá se za hlavu. `null` práh → bez zálohy.
 */
export function computeDeposit(
  partySize: number,
  thresholdGuests: number | null | undefined,
  perGuestHellers: number,
): number {
  if (thresholdGuests == null || partySize < thresholdGuests) return 0;
  return partySize * perGuestHellers;
}

/** Slučitelná sestava stolů (z `table_combinations`). */
export interface CombinationCandidate {
  id: string;
  resourceIds: string[];
  combinedCapacity: number;
  minPartySize: number;
}

/**
 * Vybere nejmenší slučitelnou sestavu, do které se skupina vejde a jejíž
 * VŠECHNY stoly jsou volné. `freeTableIds` = množina volných stolů v daném čase.
 * Vrací sestavu, nebo `null`, když žádná nevyhovuje. Použij až když pickTable
 * nenajde jeden dostatečně velký stůl.
 */
export function pickCombination(
  combinations: CombinationCandidate[],
  partySize: number,
  freeTableIds: Set<string>,
): CombinationCandidate | null {
  const usable = combinations.filter(
    (c) =>
      partySize >= c.minPartySize &&
      partySize <= c.combinedCapacity &&
      c.resourceIds.length > 0 &&
      c.resourceIds.every((id) => freeTableIds.has(id)),
  );
  if (usable.length === 0) return null;
  // Nejmenší vyhovující kapacita (ať velké sestavy zůstanou pro velké skupiny),
  // při shodě méně stolů.
  usable.sort((a, b) => {
    if (a.combinedCapacity !== b.combinedCapacity) return a.combinedCapacity - b.combinedCapacity;
    return a.resourceIds.length - b.resourceIds.length;
  });
  return usable[0]!;
}
