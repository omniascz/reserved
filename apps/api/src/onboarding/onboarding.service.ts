// OnboardingService — stav onboardingu per tenant.
//
// ZMĚNA PROTI PŮVODNÍ VERZI: stav se POČÍTÁ ZE SKUTEČNÝCH DAT, ne ze sloupců
// v `onboarding_checklist`. Původní verze četla jen uložené příznaky, takže:
//   - tenant bez řádku (např. ze seedu, který jde přímo do DB a obchází service
//     vrstvu) dostal samé nuly bez ohledu na to, kolik toho měl nastaveno,
//   - a tři kroky (ověřený e-mail, pracovní doba, platby) neměly žádné místo,
//     které by je kdy označilo — zůstaly nesplněné navždy.
//
// Tabulka `onboarding_checklist` se NEZAHAZUJE, ale mění roli: je to evidence
// VĚDOMÝCH ROZHODNUTÍ (uživatel dal „Přeskočit"). Data pro takový krok totiž
// nikdy existovat nebudou — kdybychom počítali jen z dat, přeskočený krok by se
// při každém dotazu vrátil na nesplněný.
//
// Výsledek: krok je splněný, když ho DOKLÁDAJÍ DATA, nebo když ho uživatel
// vědomě přeskočil. Stejný princip jako u permanentek (effectiveStatus).

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { extractPaymentSettings } from '../settings/settings.types.js';

export type OnboardingStep =
  | 'emailVerified'
  | 'firstServiceCreated'
  | 'workingHoursSet'
  | 'teamInvited'
  | 'paymentsConnected'
  | 'firstBookingReceived';

export interface OnboardingChecklistView {
  emailVerified: boolean;
  firstServiceCreated: boolean;
  workingHoursSet: boolean;
  teamInvited: boolean;
  paymentsConnected: boolean;
  firstBookingReceived: boolean;
  completedAt: Date | null;
  startedAt: Date | null;
  /** Spočítané: kolik kroků dokončeno z 6. */
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  /** Které kroky platí jen proto, že je uživatel vědomě přeskočil. */
  skippedSteps: OnboardingStep[];
}

const STEP_KEYS: OnboardingStep[] = [
  'emailVerified',
  'firstServiceCreated',
  'workingHoursSet',
  'teamInvited',
  'paymentsConnected',
  'firstBookingReceived',
];

/** Jak se každý krok pozná z dat. Pořadí odpovídá STEP_KEYS. */
export type StepEvidence = Record<OnboardingStep, boolean>;

@Injectable()
export class OnboardingService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async get(tenantId: string): Promise<OnboardingChecklistView> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.onboardingChecklist)
        .where(eq(schema.onboardingChecklist.tenantId, tenantId))
        .limit(1);

      const evidence = await this.detectFromData(tx, tenantId);

      // Uložený příznak bereme jen jako „vědomě přeskočeno" — data mají přednost,
      // ale nikdy nesnižují už jednou přeskočený krok zpět na nesplněný.
      const skippedSteps = STEP_KEYS.filter((k) => row?.[k] === true && !evidence[k]);
      const effective = Object.fromEntries(
        STEP_KEYS.map((k) => [k, evidence[k] || row?.[k] === true]),
      ) as StepEvidence;

      const completedCount = STEP_KEYS.filter((k) => effective[k]).length;
      const vseHotovo = completedCount === STEP_KEYS.length;

      return {
        ...effective,
        // completedAt drží tabulka; když je hotovo podle dat a razítko chybí,
        // radši nelžeme datem a vrátíme null (zápis do DB při čtení neděláme).
        completedAt: vseHotovo ? (row?.completedAt ?? null) : null,
        startedAt: row?.createdAt ?? null,
        completedCount,
        totalCount: STEP_KEYS.length,
        progressPercent: Math.round((completedCount / STEP_KEYS.length) * 100),
        skippedSteps,
      };
    });
  }

  /**
   * Zjistí z reálných dat, které kroky jsou splněné. Každý dotaz je jen test
   * existence (LIMIT 1), takže je to levné i při každém načtení dashboardu.
   */
  private async detectFromData(
    tx: Parameters<Parameters<DbService['withRlsContext']>[1]>[0],
    tenantId: string,
  ): Promise<StepEvidence> {
    // 1. Ověřený e-mail = vlastník tenanta má potvrzenou adresu.
    //    POZOR: `users.email_verified_at` dnes nikdo nenastavuje (ověřování
    //    e-mailu pro administrátory není implementované — funguje jen pro
    //    klienty v portálu). Podmínka je správná, ale dokud ten flow
    //    nevznikne, zůstane krok nesplněný, pokud ho uživatel nepřeskočí.
    const [owner] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.tenantId, tenantId),
          eq(schema.users.role, 'owner'),
          isNotNull(schema.users.emailVerifiedAt),
        ),
      )
      .limit(1);

    // 2. První služba = existuje aktivní služba.
    const [sluzba] = await tx
      .select({ id: schema.services.id })
      .from(schema.services)
      .where(and(eq(schema.services.tenantId, tenantId), eq(schema.services.isActive, true)))
      .limit(1);

    // 3. Pracovní doba = existuje aktivní záznam. Tabulka má přímo tenant_id
    //    (i vlastní index), takže není potřeba join přes zaměstnance.
    const [doba] = await tx
      .select({ id: schema.employeeWorkingHours.id })
      .from(schema.employeeWorkingHours)
      .where(
        and(
          eq(schema.employeeWorkingHours.tenantId, tenantId),
          eq(schema.employeeWorkingHours.isActive, true),
        ),
      )
      .limit(1);

    // 4. Tým = existuje aktivní zaměstnanec.
    const [zamestnanec] = await tx
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(and(eq(schema.employees.tenantId, tenantId), eq(schema.employees.isActive, true)))
      .limit(1);

    // 5a. Platby = napojená POUŽITELNÁ brána (stejná podmínka, jakou používá
    //     PaymentsService při hledání brány ke stržení).
    const [brana] = await tx
      .select({ id: schema.paymentConnections.id })
      .from(schema.paymentConnections)
      .where(
        and(
          eq(schema.paymentConnections.tenantId, tenantId),
          eq(schema.paymentConnections.status, 'active'),
          eq(schema.paymentConnections.chargesEnabled, true),
        ),
      )
      .limit(1);

    // 5b. …NEBO vědomé rozhodnutí brát jen hotovost. Bez tohohle by provozovna
    //     bez online plateb měla onboarding nedokončený napořád.
    const [tenantRow] = await tx
      .select({ settings: schema.tenants.settings })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    const jenHotovost = extractPaymentSettings(tenantRow?.settings).cashOnly;

    // 6. První rezervace = existuje jakákoli rezervace (i zrušená — přišla).
    const [rezervace] = await tx
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(eq(schema.bookings.tenantId, tenantId))
      .limit(1);

    return {
      emailVerified: Boolean(owner),
      firstServiceCreated: Boolean(sluzba),
      workingHoursSet: Boolean(doba),
      teamInvited: Boolean(zamestnanec),
      paymentsConnected: Boolean(brana) || jenHotovost,
      firstBookingReceived: Boolean(rezervace),
    };
  }

  /**
   * Označí krok jako dokončený. Idempotentní — re-call nezničí completedAt.
   * Řádek zakládá líně, takže funguje i pro tenanta, který ho ještě nemá
   * (např. ze seedu).
   *
   * Pozn.: u kroků doložitelných daty tohle běží jen pro pořádek/historii —
   * `get()` je stejně počítá z dat.
   */
  async markStep(tenantId: string, step: OnboardingStep): Promise<OnboardingChecklistView> {
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.onboardingChecklist)
        .where(eq(schema.onboardingChecklist.tenantId, tenantId))
        .limit(1);

      if (!existing) {
        await tx.insert(schema.onboardingChecklist).values({ tenantId, [step]: true });
        return;
      }

      if (existing[step] === true) return;

      const wouldBeComplete = STEP_KEYS.every((k) => (k === step ? true : existing[k] === true));

      await tx
        .update(schema.onboardingChecklist)
        .set({
          [step]: true,
          ...(wouldBeComplete && !existing.completedAt ? { completedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.onboardingChecklist.id, existing.id));
    });

    return this.get(tenantId);
  }

  /**
   * Vědomé „přeskočit" krok (např. „nemám tým"). Zapíše se do tabulky a `get()`
   * ho pak bere jako splněný, i když pro něj data nikdy nevzniknou.
   */
  async skipStep(tenantId: string, step: OnboardingStep): Promise<OnboardingChecklistView> {
    return this.markStep(tenantId, step);
  }
}
