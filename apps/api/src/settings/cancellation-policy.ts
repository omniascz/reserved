// Storno & bonus policy engine — uloženo v tenants.settings JSONB pod klíčem
// `cancellationPolicy`. Místo nekonečných kombinací nabízí pár nezávislých
// „páček" + 3 hotové presety (Přísný / Férový / Benevolentní), které páčky
// předvyplní. Provozovatel klikne na preset (hotovo za 5 vteřin) nebo si
// v režimu `custom` páčky doladí.
//
// Tři vrstvy:
//   1. Storno klientem — okno volného zrušení + co se stane po okně.
//   2. Nedostavil se (no-show) — propadnutí nebo náhrada.
//   3. Přenos nevyčerpaných kreditů při koupi dalšího programu (rollover).
//
// Veškerá rozhodovací logika je čistá (bez DB) → snadno testovatelná.

import { z } from 'zod';

export const CANCELLATION_PRESETS = ['strict', 'fair', 'generous', 'custom'] as const;
export type CancellationPreset = (typeof CANCELLATION_PRESETS)[number];

/** Co se stane s lekcí při pozdním zrušení / no-show. */
export const LESSON_OUTCOMES = ['lose_lesson', 'makeup_credit'] as const;
export type LessonOutcome = (typeof LESSON_OUTCOMES)[number];

export const CancellationPolicySchema = z.object({
  /** Který režim je zvolený. `custom` = páčky níže se berou doslova. */
  preset: z.enum(CANCELLATION_PRESETS).default('fair'),

  // ── 1. Storno klientem ──────────────────────────────────────────────
  /** Okno volného storna: do kolika hodin před začátkem je zrušení „zdarma"
   *  (lekce/kredit se vrací). Po okně se uplatní `lateCancel`. */
  freeCancelHours: z.number().min(0).max(168).default(12),
  /** Co se stane při zrušení PO okně. */
  lateCancel: z.enum(LESSON_OUTCOMES).default('makeup_credit'),
  /** Platnost (dny) náhradového kreditu vydaného za pozdní storno / no-show. */
  makeupValidDays: z.number().int().min(1).max(365).default(60),

  // ── 2. No-show ──────────────────────────────────────────────────────
  /** Co se stane, když klient nezrušil a nepřišel. */
  noShow: z.enum(LESSON_OUTCOMES).default('lose_lesson'),

  // ── 3. Přenos nevyčerpaného (rollover) ──────────────────────────────
  /** Přenášet nevyčerpané kredity z expirovaného programu na nový nákup? */
  rolloverEnabled: z.boolean().default(true),
  /** Max. počet přenesených kreditů (ignoruje se, když `rolloverUnlimited`). */
  rolloverMax: z.number().int().min(0).max(1000).default(2),
  /** Přenést vše nevyčerpané bez limitu. */
  rolloverUnlimited: z.boolean().default(false),
  /** O kolik dní prodloužit platnost přenesených kreditů (na novém programu). */
  rolloverExtendDays: z.number().int().min(0).max(365).default(0),
});

export type CancellationPolicy = z.infer<typeof CancellationPolicySchema>;

// ─── 3 presety (předvyplní páčky) ─────────────────────────────────────
type PresetName = Exclude<CancellationPreset, 'custom'>;

export const CANCELLATION_PRESET_VALUES: Record<PresetName, CancellationPolicy> = {
  // Přísný — chrání obsazenost, žádné ústupky.
  strict: CancellationPolicySchema.parse({
    preset: 'strict',
    freeCancelHours: 24,
    lateCancel: 'lose_lesson',
    makeupValidDays: 60,
    noShow: 'lose_lesson',
    rolloverEnabled: false,
    rolloverMax: 0,
    rolloverUnlimited: false,
    rolloverExtendDays: 0,
  }),
  // Férový (doporučený default) — rozumná rovnováha klient ↔ studio.
  fair: CancellationPolicySchema.parse({
    preset: 'fair',
    freeCancelHours: 12,
    lateCancel: 'makeup_credit',
    makeupValidDays: 60,
    noShow: 'lose_lesson',
    rolloverEnabled: true,
    rolloverMax: 2,
    rolloverUnlimited: false,
    rolloverExtendDays: 30,
  }),
  // Benevolentní — maximální vstřícnost ke klientovi.
  generous: CancellationPolicySchema.parse({
    preset: 'generous',
    freeCancelHours: 4,
    lateCancel: 'makeup_credit',
    makeupValidDays: 90,
    noShow: 'makeup_credit',
    rolloverEnabled: true,
    rolloverMax: 0,
    rolloverUnlimited: true,
    rolloverExtendDays: 90,
  }),
};

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = CANCELLATION_PRESET_VALUES.fair;

/**
 * Vrátí EFEKTIVNÍ politiku: u presetu (jiný než `custom`) vždy hodnoty presetu
 * (kliknutí na preset = okamžitě platné), u `custom` doslova uložené páčky.
 */
export function resolveCancellationPolicy(raw: unknown): CancellationPolicy {
  const parsed = CancellationPolicySchema.safeParse(raw);
  if (!parsed.success) return DEFAULT_CANCELLATION_POLICY;
  const p = parsed.data;
  if (p.preset !== 'custom') return CANCELLATION_PRESET_VALUES[p.preset];
  return p;
}

/** Z `tenants.settings` JSONB vytáhne efektivní storno politiku. */
export function extractCancellationPolicy(settings: unknown): CancellationPolicy {
  if (!settings || typeof settings !== 'object') return DEFAULT_CANCELLATION_POLICY;
  const raw = (settings as Record<string, unknown>).cancellationPolicy;
  if (!raw) return DEFAULT_CANCELLATION_POLICY;
  return resolveCancellationPolicy(raw);
}

// ─── Čisté rozhodovací funkce ─────────────────────────────────────────

export type CancelOutcome = {
  /** Vrátit lekci/kredit (refund permanentky, slot je znovu volný). */
  returnLesson: boolean;
  /** Vydat náhradový kredit. */
  issueMakeup: boolean;
  /** Platnost náhradového kreditu (dny). */
  makeupValidDays: number;
  /** Strojový důvod (do historie / hlášek). */
  reasonCode: 'free_cancel' | 'late_lose' | 'late_makeup' | 'noshow_lose' | 'noshow_makeup';
};

/**
 * Rozhodne, co se stane při zrušení (kind='cancel') nebo no-show
 * (kind='no_show') podle politiky a kolik hodin zbývá do začátku.
 */
export function resolveCancelOutcome(
  policy: CancellationPolicy,
  args: { hoursUntilStart: number; kind: 'cancel' | 'no_show' },
): CancelOutcome {
  if (args.kind === 'no_show') {
    return policy.noShow === 'makeup_credit'
      ? {
          returnLesson: false,
          issueMakeup: true,
          makeupValidDays: policy.makeupValidDays,
          reasonCode: 'noshow_makeup',
        }
      : {
          returnLesson: false,
          issueMakeup: false,
          makeupValidDays: policy.makeupValidDays,
          reasonCode: 'noshow_lose',
        };
  }

  // Zrušení V OKNĚ → lekce se vrací zdarma.
  if (args.hoursUntilStart >= policy.freeCancelHours) {
    return {
      returnLesson: true,
      issueMakeup: false,
      makeupValidDays: policy.makeupValidDays,
      reasonCode: 'free_cancel',
    };
  }

  // Pozdní zrušení → podle páčky.
  return policy.lateCancel === 'makeup_credit'
    ? {
        returnLesson: false,
        issueMakeup: true,
        makeupValidDays: policy.makeupValidDays,
        reasonCode: 'late_makeup',
      }
    : {
        returnLesson: false,
        issueMakeup: false,
        makeupValidDays: policy.makeupValidDays,
        reasonCode: 'late_lose',
      };
}

/**
 * Spočítá, kolik nevyčerpaných kreditů přenést na nový program (a o kolik dní
 * prodloužit jejich platnost). Čistá funkce — volající dodá zbývající kredity.
 */
export function resolveRollover(
  policy: CancellationPolicy,
  args: { unusedCredits: number },
): { credits: number; extendDays: number } {
  if (!policy.rolloverEnabled || args.unusedCredits <= 0) {
    return { credits: 0, extendDays: 0 };
  }
  const credits = policy.rolloverUnlimited
    ? args.unusedCredits
    : Math.min(args.unusedCredits, policy.rolloverMax);
  return { credits: Math.max(0, credits), extendDays: policy.rolloverExtendDays };
}
