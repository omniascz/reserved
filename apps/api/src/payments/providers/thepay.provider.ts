// ThePayPaymentProvider — ThePay v2 (Realtime API).
//
// Spec: https://dataapi.docs.thepay.cz/ (v2)
// Config v payment_methods.config:
//   - projectId: ID projektu
//   - apiPassword: heslo k API (merchant)
//   - test: boolean (demo)
// POZN.: přesné podepisování requestů ThePay v2 (Signature/Api-Password) je nutné
// doladit proti sandboxu ThePay s reálnými údaji; níže je v2 REST tvar.

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

interface ThePayConfig {
  projectId: string;
  apiPassword: string;
  test?: boolean;
}

function base(test?: boolean): string {
  return test ? 'https://demo.api.thepay.cz/v2' : 'https://api.thepay.cz/v2';
}

function sign(apiPassword: string, body: string): string {
  return createHash('sha256')
    .update(body + apiPassword)
    .digest('hex');
}

function mapStatus(s?: string): WebhookEvent['status'] {
  switch ((s ?? '').toLowerCase()) {
    case 'paid':
      return 'succeeded';
    case 'cancelled':
    case 'expired':
      return 'cancelled';
    case 'error':
      return 'failed';
    case 'refunded':
      return 'refunded';
    default:
      return 'pending';
  }
}

@Injectable()
export class ThePayPaymentProvider implements PaymentProvider {
  readonly type = 'thepay' as const;
  private readonly logger = new Logger('ThePayPaymentProvider');

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const cfg = config as unknown as ThePayConfig;
    if (!cfg.projectId || !cfg.apiPassword) {
      throw new Error('ThePay config incomplete (need projectId, apiPassword).');
    }
    const body = JSON.stringify({
      // ThePay v2 hodnota je v základní jednotce měny (Kč), ne v haléřích.
      value: (input.amountHellers / 100).toFixed(2),
      currency_code: input.currency,
      description_for_merchant: input.description.slice(0, 255),
      uid: input.metadata.paymentId ?? `uid_${Date.now()}`,
      return_url: input.successUrl,
      notif_url: input.metadata.notificationUrl ?? input.successUrl,
      customer: input.customerEmail ? { email: input.customerEmail } : undefined,
    });
    const res = await fetch(`${base(cfg.test)}/projects/${cfg.projectId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Api-Password': cfg.apiPassword,
        Signature: sign(cfg.apiPassword, body),
      },
      body,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`ThePay create failed: HTTP ${res.status} — ${t.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      pay_url?: string;
      uid?: string;
      detail?: { uid?: string };
    };
    return {
      checkoutUrl: data.pay_url ?? '',
      externalId: data.uid ?? data.detail?.uid ?? '',
    };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    _signatureHeader: string,
    _config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      uid?: string;
      payment_uid?: string;
      state?: string;
      value?: string;
    };
    const uid = body.uid ?? body.payment_uid;
    if (!uid) throw new Error('ThePay webhook missing uid.');
    return {
      status: mapStatus(body.state),
      externalId: uid,
      amountHellers: body.value ? Math.round(Number(body.value) * 100) : undefined,
      rawPayload: body as unknown as Record<string, unknown>,
    };
  }

  async refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult> {
    const cfg = config as unknown as ThePayConfig;
    const body = JSON.stringify(
      input.amountHellers ? { value: (input.amountHellers / 100).toFixed(2) } : {},
    );
    const res = await fetch(
      `${base(cfg.test)}/projects/${cfg.projectId}/payments/${input.externalId}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Api-Password': cfg.apiPassword,
          Signature: sign(cfg.apiPassword, body),
        },
        body,
      },
    );
    return { externalId: input.externalId, status: res.ok ? 'succeeded' : 'failed' };
  }
}
