// StripePaymentProvider — implementace Stripe Checkout API + webhooks.
//
// Konfigurace v payment_methods.config:
//   - publishableKey: pk_test_... (pro frontend, ne secret)
//   - secretKey: sk_test_...
//   - webhookSecret: whsec_... (z Stripe Dashboard)

import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentsConfig } from '../payments.config.js';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

interface StripeConfig {
  publishableKey?: string;
  secretKey: string;
  webhookSecret: string;
}

/** Uložená karta zákazníka ve Stripe (po dokončeném „setup" Checkoutu). */
export interface SavedCard {
  stripeCustomerId: string;
  paymentMethodId: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export type OffSessionChargeResult =
  | { status: 'succeeded'; externalId: string }
  | {
      status: 'requires_action' | 'failed';
      externalId: string | null;
      /** Kód chyby karty ze Stripe (card_declined, authentication_required, …). */
      failureCode: string;
      failureMessage: string;
    };

/**
 * Srozumitelné české hlášky k nejčastějším chybám karty.
 * Adapted from calcom/cal.diy@0f19cc4 packages/app-store/stripepayment/lib/PaymentService.ts
 * (mapování chyb `chargeCard`) — MIT, (c) 2020-present Cal.com, Inc.
 */
const CARD_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: 'Banka vyžaduje ověření platby zákazníkem (3-D Secure).',
  card_declined: 'Banka platbu zamítla.',
  insufficient_funds: 'Na kartě nejsou dostatečné prostředky.',
  expired_card: 'Platnost karty vypršela.',
  incorrect_cvc: 'Nesprávný bezpečnostní kód karty.',
  processing_error: 'Chyba při zpracování platby, zkuste to později.',
};

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly type = 'stripe' as const;
  private readonly logger = new Logger('StripePaymentProvider');

  constructor(@Inject(PaymentsConfig) private readonly paymentsConfig: PaymentsConfig) {}

  private client(config: Record<string, unknown>): Stripe {
    const cfg = config as unknown as StripeConfig;
    if (!cfg.secretKey) {
      throw new Error('Stripe secretKey is missing in config.');
    }
    const base = this.paymentsConfig.stripeApiBase;
    return new Stripe(cfg.secretKey, {
      apiVersion: '2025-02-24.acacia',
      ...(base && {
        host: base.hostname,
        port: Number(base.port) || (base.protocol === 'https:' ? 443 : 80),
        protocol: base.protocol === 'https:' ? 'https' : 'http',
      }),
    });
  }

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const stripe = this.client(config);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountHellers,
            product_data: { name: input.description },
          },
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail,
      metadata: input.metadata,
    });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return { checkoutUrl: session.url, externalId: session.id };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    signatureHeader: string,
    config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const cfg = config as unknown as StripeConfig;
    if (!cfg.webhookSecret) {
      throw new Error('Stripe webhookSecret is missing in config.');
    }
    const stripe = this.client(config);
    const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, cfg.webhookSecret);

    // Map Stripe event types na nase status
    let status: WebhookEvent['status'] = 'pending';
    let externalId = '';
    let amountHellers: number | undefined;
    let failureReason: string | undefined;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      externalId = session.id;
      amountHellers = session.amount_total ?? undefined;
      status = session.payment_status === 'paid' ? 'succeeded' : 'pending';
    } else if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      externalId = session.id;
      amountHellers = session.amount_total ?? undefined;
      status = 'succeeded';
    } else if (
      event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'checkout.session.expired'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      externalId = session.id;
      status = 'failed';
      failureReason = event.type;
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      externalId = (charge.payment_intent as string) ?? charge.id;
      status = 'refunded';
      amountHellers = charge.amount_refunded;
    } else {
      // Jiny event type — ignore, ale log
      this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
      externalId = (event.data.object as { id?: string }).id ?? `evt_${event.id}`;
    }

    return {
      status,
      externalId,
      amountHellers,
      failureReason,
      rawPayload: event as unknown as Record<string, unknown>,
      stripeEventType: event.type,
      stripeEventId: event.id,
    };
  }

  async refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult> {
    const stripe = this.client(config);
    // Stripe potřebuje PaymentIntent ID, ne session ID. Pokud máme session ID,
    // musíme to nejdřív přečíst.
    let paymentIntentId = input.externalId;
    if (paymentIntentId.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(paymentIntentId);
      paymentIntentId = session.payment_intent as string;
    }
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: input.amountHellers,
      reason: input.reason ? 'requested_by_customer' : undefined,
    });
    return {
      externalId: refund.id,
      status:
        refund.status === 'succeeded'
          ? 'succeeded'
          : refund.status === 'pending'
            ? 'pending'
            : 'failed',
    };
  }

  // ─── Uložená karta + strh bez účasti zákazníka (P4) ─────────────────
  // Adapted from calcom/cal.diy@0f19cc4 packages/app-store/stripepayment/lib/PaymentService.ts
  // (`collectCard` / `chargeCard`) — MIT, (c) 2020-present Cal.com, Inc.
  // Místo Stripe Elements používá Checkout v režimu „setup" (stejně jako
  // ostatní platby přes Checkout) — formulář karty hostuje Stripe.

  /**
   * Vytvoří stránku Stripe, kde zákazník uloží kartu. Když zákazník ve
   * Stripe ještě není, založí ho. Výsledek se dočte z webhooku
   * (`checkout.session.completed` s mode='setup') přes `readCardSetup`.
   */
  async createCardSetup(
    input: {
      customerEmail: string;
      customerName: string;
      stripeCustomerId: string | null;
      successUrl: string;
      cancelUrl: string;
      metadata: Record<string, string>;
    },
    config: Record<string, unknown>,
  ): Promise<{ setupUrl: string; sessionId: string; stripeCustomerId: string }> {
    const stripe = this.client(config);
    const stripeCustomerId =
      input.stripeCustomerId ??
      (
        await stripe.customers.create({
          email: input.customerEmail,
          name: input.customerName,
          metadata: input.metadata,
        })
      ).id;
    const metadata = { ...input.metadata, stripeCustomerId };
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata,
      setup_intent_data: { metadata },
    });
    if (!session.url) throw new Error('Stripe did not return a setup URL.');
    return { setupUrl: session.url, sessionId: session.id, stripeCustomerId };
  }

  /** Dočte uloženou kartu z dokončeného „setup" Checkoutu. */
  async readCardSetup(sessionId: string, config: Record<string, unknown>): Promise<SavedCard> {
    const stripe = this.client(config);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent.payment_method'],
    });
    const setupIntent = session.setup_intent as Stripe.SetupIntent | string | null;
    if (!setupIntent || typeof setupIntent === 'string') {
      throw new Error('Stripe setup session has no setup intent.');
    }
    const pm = setupIntent.payment_method as Stripe.PaymentMethod | string | null;
    if (!pm || typeof pm === 'string') {
      throw new Error('Stripe setup intent has no payment method.');
    }
    const customer = session.customer ?? setupIntent.customer;
    const stripeCustomerId =
      (typeof customer === 'string' ? customer : (customer?.id ?? null)) ??
      session.metadata?.stripeCustomerId ??
      null;
    if (!stripeCustomerId) throw new Error('Stripe setup session has no customer.');
    return {
      stripeCustomerId,
      paymentMethodId: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    };
  }

  /**
   * Strhne částku z uložené karty bez účasti zákazníka (off-session).
   * `idempotencyKey` zaručí, že se tentýž poplatek nestrhne dvakrát ani při
   * opakovaném volání. Nikdy nehází kvůli kartě — chybu vrací ve výsledku.
   */
  async chargeSavedCard(
    input: {
      amountHellers: number;
      currency: string;
      stripeCustomerId: string;
      paymentMethodId: string;
      description: string;
      metadata: Record<string, string>;
      idempotencyKey: string;
    },
    config: Record<string, unknown>,
  ): Promise<OffSessionChargeResult> {
    const stripe = this.client(config);
    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: input.amountHellers,
          currency: input.currency.toLowerCase(),
          customer: input.stripeCustomerId,
          payment_method: input.paymentMethodId,
          off_session: true,
          confirm: true,
          description: input.description,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (pi.status === 'succeeded') return { status: 'succeeded', externalId: pi.id };
      if (pi.status === 'requires_action') {
        return {
          status: 'requires_action',
          externalId: pi.id,
          failureCode: 'authentication_required',
          failureMessage: CARD_ERROR_MESSAGES.authentication_required!,
        };
      }
      return {
        status: 'failed',
        externalId: pi.id,
        failureCode: pi.status,
        failureMessage: `Platba skončila ve stavu ${pi.status}.`,
      };
    } catch (err) {
      const e = err as { type?: string; code?: string; message?: string; raw?: unknown };
      // Chyby karty (zamítnutí, 3-D Secure) jsou očekávaný výsledek, ne výjimka.
      if (e.type === 'StripeCardError') {
        const code = e.code ?? 'card_declined';
        const piId =
          (e.raw as { payment_intent?: { id?: string } } | undefined)?.payment_intent?.id ?? null;
        return {
          status: code === 'authentication_required' ? 'requires_action' : 'failed',
          externalId: piId,
          failureCode: code,
          failureMessage: CARD_ERROR_MESSAGES[code] ?? e.message ?? 'Platba kartou se nezdařila.',
        };
      }
      throw err;
    }
  }

  /** Smaže zákazníka ve Stripe i s jeho kartami (výmaz GDPR — Stripe drží jméno a e-mail). */
  async deleteCustomer(stripeCustomerId: string, config: Record<string, unknown>): Promise<void> {
    const stripe = this.client(config);
    await stripe.customers.del(stripeCustomerId);
  }

  /** Odpojí kartu od zákazníka ve Stripe (zákazník / admin ji odebral, výmaz GDPR). */
  async detachPaymentMethod(
    paymentMethodId: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    const stripe = this.client(config);
    await stripe.paymentMethods.detach(paymentMethodId);
  }
}
