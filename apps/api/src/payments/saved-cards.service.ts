// SavedCardsService — uložená karta zákazníka a strh poplatku bez jeho účasti.
//
// P4 z plánu plateb: místo „pošleme odkaz k úhradě" se storno / no-show
// poplatek strhne rovnou z karty, kterou zákazník dřív uložil. Vzor cal.com
// (calcom/cal.diy@0f19cc4 packages/app-store/stripepayment/lib/PaymentService.ts —
// `collectCard` + `chargeCard`, MIT, (c) 2020-present Cal.com, Inc.).
//
// Tok:
//   1. startCardSetup   → odkaz na stránku Stripe, kde zákazník uloží kartu
//   2. webhook checkout.session.completed (mode=setup) → handleSetupCompleted
//      → řádek v customer_payment_methods (jen odkazy do Stripe, žádné číslo karty)
//   3. chargeFee        → off-session PaymentIntent; když banka chce 3-D Secure
//      nebo kartu zamítne, volající přejde na dosavadní odkaz k úhradě.
//
// Platí jen pro Stripe — české brány (GoPay, Comgate…) ukládání karet takhle
// nepodporují; u nich zůstává odkaz k úhradě.

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { desifrujKonfiguraci } from '@reserved/utils';
import { DbService } from '../db/db.service.js';
import { PaymentsConfig } from './payments.config.js';
import { StripePaymentProvider } from './providers/stripe.provider.js';

export interface SavedCardView {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  createdAt: Date;
}

export type FeeChargeResult =
  | { charged: true; paymentId: string; card: SavedCardView; alreadyCharged: boolean }
  | { charged: false; reason: 'stripe_not_configured' | 'no_saved_card' }
  | {
      charged: false;
      reason: 'card_failed';
      paymentId: string;
      failureCode: string;
      failureMessage: string;
    };

@Injectable()
export class SavedCardsService {
  private readonly logger = new Logger('SavedCardsService');

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(StripePaymentProvider) private readonly stripe: StripePaymentProvider,
    @Inject(PaymentsConfig) private readonly paymentsConfig: PaymentsConfig,
  ) {}

  /** Konfigurace Stripe tenanta (vlastní klíče v payment_methods), nebo null. */
  private async stripeConfig(tenantId: string): Promise<Record<string, unknown> | null> {
    const [method] = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select({ config: schema.paymentMethods.config })
        .from(schema.paymentMethods)
        .where(
          and(
            eq(schema.paymentMethods.tenantId, tenantId),
            eq(schema.paymentMethods.methodType, 'stripe'),
            eq(schema.paymentMethods.isEnabled, true),
          ),
        )
        .limit(1),
    );
    if (!method) return null;
    const config = desifrujKonfiguraci(
      (method.config ?? {}) as Record<string, unknown>,
      this.paymentsConfig.klic,
    );
    return config.secretKey ? config : null;
  }

  private async activeCards(tenantId: string, customerId: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select()
        .from(schema.customerPaymentMethods)
        .where(
          and(
            eq(schema.customerPaymentMethods.tenantId, tenantId),
            eq(schema.customerPaymentMethods.customerId, customerId),
            eq(schema.customerPaymentMethods.status, 'active'),
          ),
        )
        .orderBy(desc(schema.customerPaymentMethods.createdAt)),
    );
  }

  private view(c: typeof schema.customerPaymentMethods.$inferSelect): SavedCardView {
    return {
      id: c.id,
      brand: c.brand,
      last4: c.last4,
      expMonth: c.expMonth,
      expYear: c.expYear,
      createdAt: c.createdAt,
    };
  }

  // ─── 1. Uložení karty ─────────────────────────────────────────────────

  /** Kam se zákazník vrátí ze Stripe: profil v zákaznickém portálu. */
  async portalReturnUrls(tenantId: string): Promise<{ successUrl: string; cancelUrl: string }> {
    const [tenant] = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select({ slug: schema.tenants.slug })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1),
    );
    const profile = `${this.paymentsConfig.portalBaseUrl}/${tenant?.slug ?? ''}/profile`;
    return { successUrl: `${profile}?karta=ulozena`, cancelUrl: `${profile}?karta=zrusena` };
  }

  async startCardSetup(input: {
    tenantId: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ setupUrl: string }> {
    const config = await this.stripeConfig(input.tenantId);
    if (!config) {
      throw new BadRequestException({
        error: {
          code: 'STRIPE_NOT_CONFIGURED',
          message: 'Ukládání karet vyžaduje zapnutou platební bránu Stripe.',
        },
      });
    }
    const [customer] = await this.dbService.withRlsContext(serviceContext(input.tenantId), (tx) =>
      tx
        .select({
          email: schema.customers.email,
          firstName: schema.customers.firstName,
          lastName: schema.customers.lastName,
        })
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.id, input.customerId),
            eq(schema.customers.tenantId, input.tenantId),
          ),
        )
        .limit(1),
    );
    if (!customer) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
      });
    }
    // Má-li zákazník ve Stripe už kartu, další se připojí ke stejnému účtu.
    const existing = (await this.activeCards(input.tenantId, input.customerId))[0];
    const res = await this.stripe.createCardSetup(
      {
        customerEmail: customer.email,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        stripeCustomerId: existing?.externalCustomerId ?? null,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        metadata: {
          purpose: 'card_on_file',
          tenantId: input.tenantId,
          customerId: input.customerId,
        },
      },
      config,
    );
    return { setupUrl: res.setupUrl };
  }

  /**
   * Webhook: zákazník dokončil uložení karty. Idempotentní — opakovaný
   * webhook kartu nezdvojí (unikátní klíč na pm_…).
   */
  async handleSetupCompleted(
    tenantId: string,
    sessionId: string,
    metadata: Record<string, string | undefined>,
  ): Promise<{ saved: boolean; reason?: string }> {
    if (metadata.purpose !== 'card_on_file' || metadata.tenantId !== tenantId) {
      return { saved: false, reason: 'not_card_setup' };
    }
    const customerId = metadata.customerId;
    if (!customerId) return { saved: false, reason: 'missing_customer' };
    const config = await this.stripeConfig(tenantId);
    if (!config) return { saved: false, reason: 'stripe_not_configured' };

    const card = await this.stripe.readCardSetup(sessionId, config);
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .insert(schema.customerPaymentMethods)
        .values({
          tenantId,
          customerId,
          provider: 'stripe',
          externalCustomerId: card.stripeCustomerId,
          externalPaymentMethodId: card.paymentMethodId,
          brand: card.brand,
          last4: card.last4,
          expMonth: card.expMonth,
          expYear: card.expYear,
          status: 'active',
        })
        .onConflictDoUpdate({
          target: [
            schema.customerPaymentMethods.tenantId,
            schema.customerPaymentMethods.provider,
            schema.customerPaymentMethods.externalPaymentMethodId,
          ],
          set: { status: 'active', removedAt: null, updatedAt: new Date() },
        });
    });
    return { saved: true };
  }

  // ─── 2. Přehled a odebrání ────────────────────────────────────────────

  async listForCustomer(tenantId: string, customerId: string): Promise<SavedCardView[]> {
    return (await this.activeCards(tenantId, customerId)).map((c) => this.view(c));
  }

  /** Odebere kartu: odpojí ji ve Stripe a označí 'removed'. */
  async remove(tenantId: string, customerId: string, cardId: string): Promise<void> {
    const [card] = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select()
        .from(schema.customerPaymentMethods)
        .where(
          and(
            eq(schema.customerPaymentMethods.id, cardId),
            eq(schema.customerPaymentMethods.tenantId, tenantId),
            eq(schema.customerPaymentMethods.customerId, customerId),
            eq(schema.customerPaymentMethods.status, 'active'),
          ),
        )
        .limit(1),
    );
    if (!card) {
      throw new NotFoundException({
        error: { code: 'CARD_NOT_FOUND', message: 'Uložená karta nenalezena.' },
      });
    }
    await this.markRemoved(tenantId, [card]);
  }

  /**
   * Výmaz zákazníka (GDPR): smaže ve Stripe jeho zákaznický účet (tím zmizí
   * i karty a jméno s e-mailem, které tam leží) a u nás karty označí jako
   * odebrané. Řádky pak smaže transakce výmazu. Vrací počet karet.
   */
  async removeAllForCustomer(tenantId: string, customerId: string): Promise<number> {
    const cards = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select()
        .from(schema.customerPaymentMethods)
        .where(
          and(
            eq(schema.customerPaymentMethods.tenantId, tenantId),
            eq(schema.customerPaymentMethods.customerId, customerId),
          ),
        ),
    );
    if (cards.length === 0) return 0;
    const config = await this.stripeConfig(tenantId);
    if (config) {
      for (const stripeCustomerId of new Set(cards.map((c) => c.externalCustomerId))) {
        try {
          await this.stripe.deleteCustomer(stripeCustomerId, config);
        } catch (err) {
          this.logger.warn(
            `Smazání zákazníka ${stripeCustomerId} ve Stripe selhalo: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
    await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .update(schema.customerPaymentMethods)
        .set({ status: 'removed', removedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.customerPaymentMethods.tenantId, tenantId),
            eq(schema.customerPaymentMethods.customerId, customerId),
          ),
        ),
    );
    return cards.length;
  }

  private async markRemoved(
    tenantId: string,
    cards: Array<typeof schema.customerPaymentMethods.$inferSelect>,
  ): Promise<void> {
    if (cards.length === 0) return;
    const config = await this.stripeConfig(tenantId);
    for (const card of cards) {
      // Ve Stripe odpojit best-effort: i když se to nepovede (brána vypnutá,
      // karta už odpojená), u nás se karta k účtování použít nesmí.
      if (config) {
        try {
          await this.stripe.detachPaymentMethod(card.externalPaymentMethodId, config);
        } catch (err) {
          this.logger.warn(
            `Odpojení karty ${card.id} ve Stripe selhalo: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
        tx
          .update(schema.customerPaymentMethods)
          .set({ status: 'removed', removedAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.customerPaymentMethods.id, card.id)),
      );
    }
  }

  // ─── 3. Strh poplatku ─────────────────────────────────────────────────

  /**
   * Strhne poplatek za rezervaci z poslední uložené karty zákazníka.
   * Tentýž poplatek za tutéž rezervaci se strhne nejvýš jednou (kontrola
   * v DB + idempotency klíč ve Stripe).
   */
  async chargeFee(input: {
    tenantId: string;
    bookingId: string;
    customerId: string;
    amountHellers: number;
    currency: string;
    description: string;
  }): Promise<FeeChargeResult> {
    const config = await this.stripeConfig(input.tenantId);
    if (!config) return { charged: false, reason: 'stripe_not_configured' };
    const card = (await this.activeCards(input.tenantId, input.customerId))[0];
    if (!card) return { charged: false, reason: 'no_saved_card' };

    // Už strženo? (opakované spuštění pravidla, souběh)
    const [done] = await this.dbService.withRlsContext(serviceContext(input.tenantId), (tx) =>
      tx
        .select({ id: schema.payments.id })
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.tenantId, input.tenantId),
            eq(schema.payments.bookingId, input.bookingId),
            eq(schema.payments.status, 'succeeded'),
            sql`${schema.payments.metadata}->>'kind' = 'fee_saved_card'`,
          ),
        )
        .limit(1),
    );
    if (done) {
      return { charged: true, paymentId: done.id, card: this.view(card), alreadyCharged: true };
    }

    const result = await this.stripe.chargeSavedCard(
      {
        amountHellers: input.amountHellers,
        currency: input.currency,
        stripeCustomerId: card.externalCustomerId,
        paymentMethodId: card.externalPaymentMethodId,
        description: input.description,
        metadata: { tenantId: input.tenantId, bookingId: input.bookingId, kind: 'fee' },
        idempotencyKey: `fee-${input.bookingId}-${input.amountHellers}`,
      },
      config,
    );

    const succeeded = result.status === 'succeeded';
    const [payment] = await this.dbService.withRlsContext(serviceContext(input.tenantId), (tx) =>
      tx
        .insert(schema.payments)
        .values({
          tenantId: input.tenantId,
          customerId: input.customerId,
          bookingId: input.bookingId,
          amountHellers: input.amountHellers,
          currency: input.currency,
          methodType: 'stripe',
          status: succeeded ? 'succeeded' : 'failed',
          externalId: result.externalId,
          description: input.description,
          paidAt: succeeded ? new Date() : null,
          failureReason: succeeded ? null : `${result.failureCode}: ${result.failureMessage}`,
          metadata: {
            kind: 'fee_saved_card',
            cardId: card.id,
            last4: card.last4,
          },
        })
        .returning({ id: schema.payments.id }),
    );

    if (succeeded) {
      return {
        charged: true,
        paymentId: payment!.id,
        card: this.view(card),
        alreadyCharged: false,
      };
    }
    return {
      charged: false,
      reason: 'card_failed',
      paymentId: payment!.id,
      failureCode: result.failureCode,
      failureMessage: result.failureMessage,
    };
  }
}
