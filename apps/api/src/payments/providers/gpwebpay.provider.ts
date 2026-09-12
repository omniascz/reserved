// GpWebpayPaymentProvider — GP webpay (Global Payments; ČSOB/KB acquiring).
//
// Na rozdíl od ostatních to není JSON REST, ale PODEPSANÝ REDIRECT (RSA-SHA1):
// createCheckout sestaví podepsanou URL na platební bránu; výsledek se ověří
// z návratových parametrů (DIGEST) veřejným klíčem GP.
//
// Config v payment_methods.config:
//   - merchantNumber
//   - privateKey: PEM privátní klíč obchodníka
//   - privateKeyPassword: heslo ke klíči (volitelné)
//   - gpPublicKey: PEM veřejný klíč GP (pro ověření odpovědi)
//   - test: boolean
// POZN.: přesné pořadí polí v DIGESTu ověřit dle integrační dokumentace GP webpay.

import { Injectable, Logger } from '@nestjs/common';
import { createSign, createVerify } from 'node:crypto';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEvent,
} from './payment-provider.interface.js';

interface GpConfig {
  merchantNumber: string;
  privateKey: string;
  privateKeyPassword?: string;
  gpPublicKey: string;
  test?: boolean;
}

const CURRENCY_NUM: Record<string, string> = { CZK: '203', EUR: '978', USD: '840' };

function base(test?: boolean): string {
  return test ? 'https://test.3dsecure.gpwebpay.com/pgw' : 'https://3dsecure.gpwebpay.com/pgw';
}

@Injectable()
export class GpWebpayPaymentProvider implements PaymentProvider {
  readonly type = 'gpwebpay' as const;
  private readonly logger = new Logger('GpWebpayPaymentProvider');

  async createCheckout(
    input: CheckoutInput,
    config: Record<string, unknown>,
  ): Promise<CheckoutResult> {
    const cfg = config as unknown as GpConfig;
    if (!cfg.merchantNumber || !cfg.privateKey) {
      throw new Error('GP webpay config incomplete (need merchantNumber, privateKey).');
    }
    const orderNumber =
      (input.metadata.paymentId ?? `${Date.now()}`).replace(/\D/g, '').slice(-15) ||
      `${Date.now()}`;
    const params: Record<string, string> = {
      MERCHANTNUMBER: cfg.merchantNumber,
      OPERATION: 'CREATE_ORDER',
      ORDERNUMBER: orderNumber,
      AMOUNT: String(input.amountHellers),
      CURRENCY: CURRENCY_NUM[input.currency] ?? '203',
      DEPOSITFLAG: '1',
      URL: input.successUrl,
    };
    // DIGEST = RSA-SHA1 podpis hodnot spojených '|' (v daném pořadí).
    const digestStr = Object.values(params).join('|');
    const digest = createSign('RSA-SHA1')
      .update(digestStr, 'utf8')
      .sign({ key: cfg.privateKey, passphrase: cfg.privateKeyPassword }, 'base64');

    const url = `${base(cfg.test)}/order.do?${new URLSearchParams({ ...params, DIGEST: digest }).toString()}`;
    return { checkoutUrl: url, externalId: orderNumber };
  }

  async verifyWebhook(
    rawBody: string | Buffer,
    _signatureHeader: string,
    config: Record<string, unknown>,
  ): Promise<WebhookEvent> {
    const cfg = config as unknown as GpConfig;
    const p = new URLSearchParams(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
    const operation = p.get('OPERATION') ?? '';
    const orderNumber = p.get('ORDERNUMBER') ?? '';
    const prCode = p.get('PRCODE') ?? '';
    const srCode = p.get('SRCODE') ?? '';
    const resultText = p.get('RESULTTEXT') ?? '';
    const digest = p.get('DIGEST') ?? '';

    const signedStr = [operation, orderNumber, prCode, srCode, resultText].join('|');
    const valid = cfg.gpPublicKey
      ? createVerify('RSA-SHA1').update(signedStr, 'utf8').verify(cfg.gpPublicKey, digest, 'base64')
      : false;
    if (!valid) throw new Error('GP webpay: neplatný podpis odpovědi (DIGEST).');

    const ok = prCode === '0' && srCode === '0';
    return {
      status: ok ? 'succeeded' : 'failed',
      externalId: orderNumber,
      failureReason: ok ? undefined : `PRCODE=${prCode} SRCODE=${srCode} ${resultText}`,
      rawPayload: Object.fromEntries(p.entries()),
    };
  }

  async refund(_input: RefundInput, _config: Record<string, unknown>): Promise<RefundResult> {
    // GP webpay refund jde přes operaci APPROVE_REVERSE / batch nebo portál banky.
    throw new Error('GP webpay refund: proveďte přes portál/batch API banky.');
  }
}
