// GoPayPaymentProvider — REST API integrace (GoPay Standard).
//
// Spec: https://doc.gopay.com/#payment-creation
//
// Konfigurace v payment_methods.config:
//   - goId: numericke ID merchant ucet
//   - clientId
//   - clientSecret
//   - environment: 'sandbox' | 'production' (default sandbox)

import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

interface GoPayConfig {
  goId: string | number;
  clientId: string;
  clientSecret: string;
  environment?: 'sandbox' | 'production';
}

function baseUrl(env?: string): string {
  return env === 'production' ? 'https://gate.gopay.cz/api' : 'https://gw.sandbox.gopay.com/api';
}

async function getAccessToken(cfg: GoPayConfig): Promise<string> {
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${baseUrl(cfg.environment)}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials&scope=payment-create',
  });
  if (!res.ok) {
    throw new Error(`GoPay oauth failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

@Injectable()
export class GoPayPaymentProvider implements PaymentProvider {
  readonly type = 'gopay' as const;
  private readonly logger = new Logger('GoPayPaymentProvider');

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const cfg = config as unknown as GoPayConfig;
    if (!cfg.clientId || !cfg.clientSecret || !cfg.goId) {
      throw new Error('GoPay config incomplete (need goId, clientId, clientSecret).');
    }
    const token = await getAccessToken(cfg);

    const body = {
      payer: {
        default_payment_instrument: 'PAYMENT_CARD',
        allowed_payment_instruments: ['PAYMENT_CARD', 'BANK_ACCOUNT', 'GPAY', 'APPLE_PAY'],
        contact: input.customerEmail ? { email: input.customerEmail } : undefined,
      },
      amount: input.amountHellers,
      currency: input.currency,
      order_number: input.metadata.paymentId ?? `order_${Date.now()}`,
      order_description: input.description,
      callback: {
        return_url: input.successUrl,
        notification_url: `${input.metadata.notificationUrl ?? ''}`,
      },
      additional_params: Object.entries(input.metadata).map(([name, value]) => ({
        name,
        value,
      })),
      lang: 'CS',
      target: { type: 'ACCOUNT', goid: Number(cfg.goId) },
    };

    const res = await fetch(`${baseUrl(cfg.environment)}/payments/payment`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoPay createPayment failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id: number | string; gw_url: string };
    return { checkoutUrl: data.gw_url, externalId: String(data.id) };
  }

  /**
   * GoPay nemá HMAC signaturu na webhook samém — místo toho posílá jen `id`
   * a my si v API ověříme status pres GET /payments/payment/{id}. Tím je
   * webhook bezpečný proti spoofingu.
   */
  async verifyWebhook(
    rawBody: string | Buffer,
    _signatureHeader: string,
    config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const cfg = config as unknown as GoPayConfig;
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      id?: number | string;
      parent_id?: number | string;
    };

    const paymentId = body.id ?? body.parent_id;
    if (!paymentId) {
      throw new Error('GoPay webhook missing payment id.');
    }

    const token = await getAccessToken(cfg);
    const res = await fetch(`${baseUrl(cfg.environment)}/payments/payment/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`GoPay status check failed: HTTP ${res.status}`);
    }
    const payment = (await res.json()) as {
      id: number;
      state: string; // CREATED, PAYMENT_METHOD_CHOSEN, PAID, AUTHORIZED, CANCELED, TIMEOUTED, REFUNDED, FAILED
      amount: number;
      sub_state?: string;
    };

    let status: WebhookEvent['status'] = 'pending';
    if (payment.state === 'PAID' || payment.state === 'AUTHORIZED') status = 'succeeded';
    else if (payment.state === 'CANCELED' || payment.state === 'TIMEOUTED') status = 'cancelled';
    else if (payment.state === 'FAILED') status = 'failed';
    else if (payment.state === 'REFUNDED') status = 'refunded';

    return {
      status,
      externalId: String(payment.id),
      amountHellers: payment.amount,
      failureReason: status === 'failed' ? payment.sub_state : undefined,
      rawPayload: payment as unknown as Record<string, unknown>,
    };
  }

  async refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult> {
    const cfg = config as unknown as GoPayConfig;
    const token = await getAccessToken(cfg);
    const body = input.amountHellers ? { amount: input.amountHellers } : {};

    const res = await fetch(
      `${baseUrl(cfg.environment)}/payments/payment/${input.externalId}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GoPay refund failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id: number; result: string };
    return {
      externalId: String(data.id),
      status: data.result === 'FINISHED' ? 'succeeded' : 'pending',
    };
  }
}

// Suppress unused
void createHmac;
