// StripePaymentProvider — implementace Stripe Checkout API + webhooks.
//
// Konfigurace v payment_methods.config:
//   - publishableKey: pk_test_... (pro frontend, ne secret)
//   - secretKey: sk_test_...
//   - webhookSecret: whsec_... (z Stripe Dashboard)

import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
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

function client(config: Record<string, unknown>): Stripe {
  const cfg = config as unknown as StripeConfig;
  if (!cfg.secretKey) {
    throw new Error('Stripe secretKey is missing in config.');
  }
  return new Stripe(cfg.secretKey, { apiVersion: '2025-02-24.acacia' });
}

@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly type = 'stripe' as const;
  private readonly logger = new Logger('StripePaymentProvider');

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const stripe = client(config);
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
    const stripe = client(config);
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
    };
  }

  async refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult> {
    const stripe = client(config);
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
}
