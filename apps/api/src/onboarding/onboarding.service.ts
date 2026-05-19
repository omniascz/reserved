// OnboardingService — sprava onboarding checklistu per tenant.
//
// Po registraci se v auth.service vytvoří onboarding_checklist row.
// Tato service:
//   - vrátí stav checklistu pro dashboard widget
//   - umožní manuálně označit krok jako dokončený (např. „skip team invite")
//   - poskytuje markStep() pro automatické označení z jiných services
//     (CustomersService při vytvoření prvního klienta, atd.)

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

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
}

const STEP_KEYS: OnboardingStep[] = [
  'emailVerified',
  'firstServiceCreated',
  'workingHoursSet',
  'teamInvited',
  'paymentsConnected',
  'firstBookingReceived',
];

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

      if (!row) {
        // Žádný record ještě neexistuje — vrať prázdný stav
        return {
          emailVerified: false,
          firstServiceCreated: false,
          workingHoursSet: false,
          teamInvited: false,
          paymentsConnected: false,
          firstBookingReceived: false,
          completedAt: null,
          startedAt: null,
          completedCount: 0,
          totalCount: STEP_KEYS.length,
          progressPercent: 0,
        };
      }

      const completedCount = STEP_KEYS.filter((k) => row[k] === true).length;
      return {
        emailVerified: row.emailVerified,
        firstServiceCreated: row.firstServiceCreated,
        workingHoursSet: row.workingHoursSet,
        teamInvited: row.teamInvited,
        paymentsConnected: row.paymentsConnected,
        firstBookingReceived: row.firstBookingReceived,
        completedAt: row.completedAt,
        startedAt: row.createdAt,
        completedCount,
        totalCount: STEP_KEYS.length,
        progressPercent: Math.round((completedCount / STEP_KEYS.length) * 100),
      };
    });
  }

  /**
   * Označí krok jako dokončený. Idempotentní — re-call neznicí completedAt.
   * Pokud jsou všechny kroky hotové, nastaví completedAt.
   */
  async markStep(tenantId: string, step: OnboardingStep): Promise<OnboardingChecklistView> {
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.onboardingChecklist)
        .where(eq(schema.onboardingChecklist.tenantId, tenantId))
        .limit(1);

      if (!existing) {
        // Vytvoř nový s tímhle krokem hotovým
        await tx.insert(schema.onboardingChecklist).values({
          tenantId,
          [step]: true,
        });
        return;
      }

      if (existing[step] === true) {
        // Už hotové, no-op
        return;
      }

      // Update + případně completedAt pokud teď máme všechno
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
   * Manuální „přeskočit" krok (např. „nemám tým"). Označí jako hotové bez
   * skutečné akce.
   */
  async skipStep(tenantId: string, step: OnboardingStep): Promise<OnboardingChecklistView> {
    return this.markStep(tenantId, step);
  }
}
