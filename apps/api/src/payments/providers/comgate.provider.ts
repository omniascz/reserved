// ComgatePaymentProvider — Comgate platební brána (v1.0 REST).
//
// Spec: https://apidoc.comgate.cz/
// Config v payment_methods.config:
//   - merchant: ID e-shopu
//   - secret: heslo brány
//   - test: boolean (sandbox)
// Comgate vrací odpovědi jako application/x-www-form-urlencoded.
// Webhook (LinkPay/notifikace) posílá transId + status → ověříme přes /status.

import { Injectable, Logger } from '@nestjs/common';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

interface ComgateConfig {
  merchant: string;
  secret: string;
  test?: boolean;
}

const BASE = 'https://payments.comgate.cz/v1.0';

async function postForm(path: string, params: Record<string, string>): Promise<URLSearchParams> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Comgate ${path} failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
  return new URLSearchParams(text);
}

function mapStatus(s?: string): WebhookEvent['status'] {
  switch ((s ?? '').toUpperCase()) {
    case 'PAID':
      return 'succeeded';
    case 'CANCELLED':
      return 'cancelled';
    case 'AUTHORIZED':
      return 'succeeded';
    default:
      return 'pending';
  }
}

@Injectable()
export class ComgatePaymentProvider implements PaymentProvider {
  readonly type = 'comgate' as const;
  private readonly logger = new Logger('ComgatePaymentProvider');

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const cfg = config as unknown as ComgateConfig;
    if (!cfg.merchant || !cfg.secret) {
      throw new Error('Comgate config incomplete (need merchant, secret).');
    }
    const out = await postForm('/create', {
      merchant: cfg.merchant,
      secret: cfg.secret,
      price: String(input.amountHellers),
      curr: input.currency,
      label: input.description.slice(0, 200),
      refId: input.metadata.paymentId ?? `ref_${Date.now()}`,
      method: 'ALL',
      email: input.customerEmail ?? '',
      prepareOnly: 'true',
      country: 'CZ',
      lang: 'cs',
      test: cfg.test ? 'true' : 'false',
      url_paid: input.successUrl,
      url_cancel: input.cancelUrl,
      url_pending: input.successUrl,
    });
    if (out.get('code') !== '0') {
      throw new Error(`Comgate create error: ${out.get('code')} ${out.get('message')}`);
    }
    return { checkoutUrl: out.get('redirect') ?? '', externalId: out.get('transId') ?? '' };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    _signatureHeader: string,
    config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const cfg = config as unknown as ComgateConfig;
    const body = new URLSearchParams(
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
    );
    const transId = body.get('transId');
    if (!transId) throw new Error('Comgate webhook missing transId.');

    // Ověř stav serverovým dotazem (anti-spoofing).
    const st = await postForm('/status', {
      merchant: cfg.merchant,
      secret: cfg.secret,
      transId,
    });
    return {
      status: mapStatus(st.get('status') ?? undefined),
      externalId: transId,
      amountHellers: st.get('price') ? Number(st.get('price')) : undefined,
      rawPayload: Object.fromEntries(st.entries()),
    };
  }

  async refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult> {
    const cfg = config as unknown as ComgateConfig;
    const params: Record<string, string> = {
      merchant: cfg.merchant,
      secret: cfg.secret,
      transId: input.externalId,
    };
    if (input.amountHellers) params.amount = String(input.amountHellers);
    const out = await postForm('/refund', params);
    return {
      externalId: input.externalId,
      status: out.get('code') === '0' ? 'succeeded' : 'failed',
    };
  }
}
