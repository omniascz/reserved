// PayUPaymentProvider — PayU REST API (v2.1).
//
// Spec: https://developers.payu.com/
// Config v payment_methods.config:
//   - posId: merchant POS ID
//   - clientId, clientSecret: OAuth client_credentials
//   - secondKey: pro ověření notifikací (OpenPayU-Signature, md5)
//   - environment: 'sandbox' | 'production'
// POZN.: ověření OpenPayU-Signature na webhooku doladit proti sandboxu PayU.

import { Injectable, Logger } from '@nestjs/common';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

interface PayUConfig {
  posId: string;
  clientId: string;
  clientSecret: string;
  secondKey?: string;
  environment?: 'sandbox' | 'production';
}

function base(env?: string): string {
  return env === 'production' ? 'https://secure.payu.com' : 'https://secure.snd.payu.com';
}

async function getToken(cfg: PayUConfig): Promise<string> {
  const res = await fetch(`${base(cfg.environment)}/pl/standard/user/oauth/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
  });
  if (!res.ok) throw new Error(`PayU oauth failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function mapStatus(s?: string): WebhookEvent['status'] {
  switch ((s ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded';
    case 'CANCELED':
      return 'cancelled';
    case 'REJECTED':
      return 'failed';
    default:
      return 'pending';
  }
}

@Injectable()
export class PayUPaymentProvider implements PaymentProvider {
  readonly type = 'payu' as const;
  private readonly logger = new Logger('PayUPaymentProvider');

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const cfg = config as unknown as PayUConfig;
    if (!cfg.posId || !cfg.clientId || !cfg.clientSecret) {
      throw new Error('PayU config incomplete (need posId, clientId, clientSecret).');
    }
    const token = await getToken(cfg);
    const body = {
      notifyUrl: input.metadata.notificationUrl ?? input.successUrl,
      continueUrl: input.successUrl,
      customerIp: input.metadata.customerIp ?? '127.0.0.1',
      merchantPosId: cfg.posId,
      description: input.description.slice(0, 255),
      currencyCode: input.currency,
      totalAmount: String(input.amountHellers), // PayU = minor units (haléře)
      extOrderId: input.metadata.paymentId,
      buyer: input.customerEmail ? { email: input.customerEmail } : undefined,
      products: [
        {
          name: input.description.slice(0, 100),
          unitPrice: String(input.amountHellers),
          quantity: '1',
        },
      ],
    };
    const res = await fetch(`${base(cfg.environment)}/api/v2_1/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: { statusCode?: string };
      redirectUri?: string;
      orderId?: string;
    };
    if (!data.redirectUri || !data.orderId) {
      throw new Error(`PayU create failed: ${data.status?.statusCode ?? res.status}`);
    }
    return { checkoutUrl: data.redirectUri, externalId: data.orderId };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    _signatureHeader: string,
    _config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      order?: { orderId?: string; status?: string; totalAmount?: string };
    };
    const order = body.order;
    if (!order?.orderId) throw new Error('PayU webhook missing order.');
    return {
      status: mapStatus(order.status),
      externalId: order.orderId,
      amountHellers: order.totalAmount ? Number(order.totalAmount) : undefined,
      rawPayload: body as unknown as Record<string, unknown>,
    };
  }

  async refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult> {
    const cfg = config as unknown as PayUConfig;
    const token = await getToken(cfg);
    const refund: Record<string, string> = { description: input.reason ?? 'Refund' };
    if (input.amountHellers) refund.amount = String(input.amountHellers);
    const res = await fetch(
      `${base(cfg.environment)}/api/v2_1/orders/${input.externalId}/refunds`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refund }),
      },
    );
    return { externalId: input.externalId, status: res.ok ? 'succeeded' : 'failed' };
  }
}
