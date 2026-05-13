// MockPaymentProvider — pro dev a test bez external APIs.
//
// createCheckout vraci URL na /payments/mock-checkout?id=... (fake checkout
// stranka, ktera ti dovoli kliknout 'Zaplatit' nebo 'Zruseni').
//
// Verifikace webhook proste vraci status z payload bez kontroly.

import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly type = 'mock' as const;

  async createCheckout(
    input: CheckoutInput,
    _config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const id = `mock_${randomBytes(12).toString('hex')}`;
    const base = input.metadata.baseUrl ?? 'http://localhost:3005';
    const url =
      `${base}/mock-checkout?id=${id}` +
      `&amount=${input.amountHellers}` +
      `&desc=${encodeURIComponent(input.description)}` +
      `&success=${encodeURIComponent(input.successUrl)}` +
      `&cancel=${encodeURIComponent(input.cancelUrl)}`;
    return { checkoutUrl: url, externalId: id };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    _signatureHeader: string,
    _config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')) as {
      externalId: string;
      status: WebhookEvent['status'];
      amountHellers?: number;
    };
    return {
      status: body.status ?? 'pending',
      externalId: body.externalId,
      amountHellers: body.amountHellers,
      rawPayload: body as unknown as Record<string, unknown>,
    };
  }

  async refund(input: RefundInput, _config: Record<string, unknown>): Promise<RefundResult> {
    return {
      externalId: `mock_refund_${randomBytes(8).toString('hex')}`,
      status: 'succeeded',
    };
  }
}
