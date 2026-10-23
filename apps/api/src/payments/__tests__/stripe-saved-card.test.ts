// Uložená karta + strh bez účasti zákazníka (StripePaymentProvider).
//
// Dvě úrovně ověření (skutečný Stripe tu není — klíče v repu nejsou):
//   1. Falešný Stripe server v testu: přesně řízené odpovědi → ověří, jak se
//      mapuje úspěch, zamítnutí karty a nutnost 3-D Secure, a že jde
//      idempotency klíč a off_session parametry.
//   2. stripe-mock (oficiální emulátor Stripe API, docker stripe/stripe-mock)
//      — ověří, že Stripe takové požadavky PŘIJME (validuje proti OpenAPI).
//      Běží jen když je nastavené STRIPE_MOCK_URL (lokálně / v CI se službou).

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StripePaymentProvider } from '../providers/stripe.provider.js';
import type { PaymentsConfig } from '../payments.config.js';

function provider(base: string): StripePaymentProvider {
  const cfg = { stripeApiBase: new URL(base) } as unknown as PaymentsConfig;
  return new StripePaymentProvider(cfg);
}
const CONFIG = { secretKey: 'sk_test_fake', webhookSecret: 'whsec_fake' };

// ─── 1. Falešný Stripe ────────────────────────────────────────────────────
describe('chargeSavedCard — mapování odpovědí Stripe', () => {
  let server: Server;
  let base: string;
  let reply: { status: number; body: unknown } = { status: 200, body: {} };
  const requests: Array<{ path: string; body: string; idempotency: string | undefined }> = [];

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        requests.push({
          path: req.url ?? '',
          body: decodeURIComponent(body),
          idempotency: req.headers['idempotency-key'] as string | undefined,
        });
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const a = server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const charge = () =>
    provider(base).chargeSavedCard(
      {
        amountHellers: 50000,
        currency: 'CZK',
        stripeCustomerId: 'cus_1',
        paymentMethodId: 'pm_1',
        description: 'No-show poplatek',
        metadata: { bookingId: 'b-1' },
        idempotencyKey: 'storno-fee-b-1',
      },
      CONFIG,
    );

  it('úspěch → succeeded; posílá off_session, confirm a idempotency klíč', async () => {
    reply = { status: 200, body: { id: 'pi_ok', object: 'payment_intent', status: 'succeeded' } };
    expect(await charge()).toEqual({ status: 'succeeded', externalId: 'pi_ok' });
    const r = requests.at(-1)!;
    expect(r.path).toBe('/v1/payment_intents');
    expect(r.body).toContain('off_session=true');
    expect(r.body).toContain('confirm=true');
    expect(r.body).toContain('amount=50000');
    expect(r.body).toContain('currency=czk');
    expect(r.body).toContain('customer=cus_1');
    expect(r.body).toContain('payment_method=pm_1');
    expect(r.idempotency).toBe('storno-fee-b-1');
  });

  it('zamítnutá karta (402 card_error) → failed s českou hláškou, nehází', async () => {
    reply = {
      status: 402,
      body: {
        error: {
          type: 'card_error',
          code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          payment_intent: { id: 'pi_declined' },
        },
      },
    };
    expect(await charge()).toEqual({
      status: 'failed',
      externalId: 'pi_declined',
      failureCode: 'insufficient_funds',
      failureMessage: 'Na kartě nejsou dostatečné prostředky.',
    });
  });

  it('banka chce 3-D Secure → requires_action', async () => {
    reply = {
      status: 402,
      body: {
        error: {
          type: 'card_error',
          code: 'authentication_required',
          message: 'Authentication required.',
          payment_intent: { id: 'pi_3ds' },
        },
      },
    };
    const r = await charge();
    expect(r).toMatchObject({ status: 'requires_action', externalId: 'pi_3ds' });
  });

  it('jiná chyba Stripe (např. špatný klíč) se NEschová — vyhodí se', async () => {
    reply = {
      status: 401,
      body: { error: { type: 'invalid_request_error', message: 'Invalid API Key' } },
    };
    await expect(charge()).rejects.toThrow(/Invalid API Key/);
  });
});

// ─── 2. stripe-mock (oficiální emulátor) ──────────────────────────────────
const MOCK = process.env.STRIPE_MOCK_URL;
describe.skipIf(!MOCK)('Stripe přijme naše požadavky (stripe-mock)', () => {
  it('setup Checkout, dočtení karty, off-session platba a odpojení karty', async () => {
    const p = provider(MOCK!);
    const setup = await p.createCardSetup(
      {
        customerEmail: 'jana@test.cz',
        customerName: 'Jana Nováková',
        stripeCustomerId: null,
        successUrl: 'https://example.cz/ok',
        cancelUrl: 'https://example.cz/zpet',
        metadata: { tenantId: 't-1', customerId: 'c-1', purpose: 'card_on_file' },
      },
      CONFIG,
    );
    expect(setup.setupUrl).toMatch(/^https?:\/\//);
    expect(setup.sessionId).toMatch(/^cs_/);
    expect(setup.stripeCustomerId).toMatch(/^cus_/);

    // stripe-mock vrací STATICKÉ fixtures (bez zákazníka a karty), takže
    // dočtení nemusí najít data — ověřujeme jen, že Stripe dotaz s `expand`
    // PŘIJME. Odmítnutí by bylo StripeInvalidRequestError, ne naše hláška.
    const read = await p.readCardSetup(setup.sessionId, CONFIG).catch((e: Error) => e);
    if (read instanceof Error) {
      expect(read.message).toMatch(/^Stripe setup (session|intent) has no /);
    }

    const charge = await p.chargeSavedCard(
      {
        amountHellers: 50000,
        currency: 'CZK',
        stripeCustomerId: setup.stripeCustomerId,
        paymentMethodId: 'pm_card_visa',
        description: 'No-show poplatek',
        metadata: { bookingId: 'b-1' },
        idempotencyKey: `storno-fee-${Date.now()}`,
      },
      CONFIG,
    );
    expect(charge.externalId).toMatch(/^pi_/);

    await expect(p.detachPaymentMethod('pm_card_visa', CONFIG)).resolves.toBeUndefined();
  });
});
