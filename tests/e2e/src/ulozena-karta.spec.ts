// Uložená karta zákazníka + strh storno / no-show poplatku bez jeho účasti
// (P4, vzor cal.com `collectCard` + `chargeCard`).
//
// Skutečný Stripe tu není (klíče v repu nejsou). API proto musí běžet
// s STRIPE_API_BASE ukazující na falešný Stripe, který tenhle test spustí na
// pevném portu (STRIPE_FAKE_PORT, výchozí 12199). Bez toho se test přeskočí.
//
// Průchod:
//   1. admin pošle zákazníkovi odkaz na uložení karty (Checkout „setup")
//   2. Stripe pošle podepsaný webhook → karta se uloží (jen odkazy, ne číslo)
//   3. no-show + pravidlo charge_storno_fee → poplatek stržen z karty, e-mail
//   4. karta zamítnutá → záznam o neúspěchu + náhradní odkaz k úhradě
//   5. zákazník si v portálu kartu prohlédne a odebere (odpojí se i ve Stripe)
//   6. výmaz GDPR → smaže zákazníka i ve Stripe, karty zmizí z DB

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const FAKE_PORT = Number(process.env.STRIPE_FAKE_PORT ?? 12199);
const ENABLED = Boolean(process.env.STRIPE_API_BASE);
const WEBHOOK_SECRET = 'whsec_e2e_ulozena_karta'; // gitleaks:allow — testovací

const sql = postgres(DB_URL, { max: 2 });

// ─── Falešný Stripe ───────────────────────────────────────────────────────
interface Pozadavek {
  method: string;
  path: string;
  body: string;
  idempotency?: string;
}
const stripeLog: Pozadavek[] = [];
let piMode: 'ok' | 'declined' = 'ok';
let fakeMetadata: Record<string, string> = {};

function fakeStripe(req: IncomingMessage, body: string): { status: number; json: unknown } {
  const path = (req.url ?? '').split('?')[0]!;
  if (req.method === 'POST' && path === '/v1/customers') {
    return { status: 200, json: { id: 'cus_fake1', object: 'customer' } };
  }
  if (req.method === 'POST' && path === '/v1/checkout/sessions') {
    const setup = body.includes('mode=setup');
    return {
      status: 200,
      json: {
        id: setup ? 'cs_fake_setup' : `cs_fake_pay_${stripeLog.length}`,
        object: 'checkout.session',
        mode: setup ? 'setup' : 'payment',
        url: setup ? 'https://checkout.stripe.test/setup' : 'https://checkout.stripe.test/pay',
      },
    };
  }
  if (req.method === 'GET' && path === '/v1/checkout/sessions/cs_fake_setup') {
    return {
      status: 200,
      json: {
        id: 'cs_fake_setup',
        object: 'checkout.session',
        mode: 'setup',
        customer: 'cus_fake1',
        metadata: fakeMetadata,
        setup_intent: {
          id: 'seti_fake',
          object: 'setup_intent',
          customer: 'cus_fake1',
          payment_method: {
            id: 'pm_fake_visa',
            object: 'payment_method',
            card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
          },
        },
      },
    };
  }
  if (req.method === 'POST' && path === '/v1/payment_intents') {
    if (piMode === 'ok') {
      return {
        status: 200,
        json: { id: `pi_ok_${stripeLog.length}`, object: 'payment_intent', status: 'succeeded' },
      };
    }
    return {
      status: 402,
      json: {
        error: {
          type: 'card_error',
          code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          payment_intent: { id: 'pi_declined' },
        },
      },
    };
  }
  if (req.method === 'POST' && /^\/v1\/payment_methods\/[^/]+\/detach$/.test(path)) {
    return { status: 200, json: { id: path.split('/')[3], object: 'payment_method' } };
  }
  if (req.method === 'DELETE' && path.startsWith('/v1/customers/')) {
    return { status: 200, json: { id: path.split('/')[3], object: 'customer', deleted: true } };
  }
  return { status: 404, json: { error: { type: 'invalid_request_error', message: path } } };
}

// ─── Pomocné ──────────────────────────────────────────────────────────────
async function call<T = unknown>(
  path: string,
  init: RequestInit & { token?: string; tenantId?: string } = {},
): Promise<{
  status: number;
  body: { data?: T; error?: { code: string } } & Record<string, unknown>;
}> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init.tenantId) headers['X-Tenant-ID'] = init.tenantId;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}
async function ok<T>(path: string, init: RequestInit & { token?: string; tenantId?: string } = {}) {
  const r = await call<T>(path, init);
  if (r.status >= 300) throw new Error(`[${r.status}] ${path}: ${JSON.stringify(r.body)}`);
  return r.body.data as T;
}
async function cekej<T>(fn: () => Promise<T | undefined>, ms = 10_000): Promise<T> {
  const konec = Date.now() + ms;
  while (Date.now() < konec) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Nedočkal jsem se');
}

describe.skipIf(!ENABLED)('Uložená karta a strh poplatku bez účasti zákazníka', () => {
  const slug = `karta-${Date.now().toString(36)}`.slice(0, 32);
  let server: Server;
  let token: string;
  let tenantId: string;
  let serviceId: string;
  let employeeId: string;
  let customerId: string;
  const email = `jana-${slug}@e2e.local`;

  const novaRezervace = async (startsAt: string) =>
    (
      await ok<{ id: string }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId,
          employeeId,
          customerName: 'Jana Nováková',
          customerEmail: email,
          startsAt,
          skipEmail: true,
        }),
      })
    ).id;

  const platby = (bookingId: string) =>
    sql<
      Array<{
        status: string;
        amount_hellers: number;
        external_id: string | null;
        failure_reason: string | null;
        metadata: { kind?: string; last4?: string };
      }>
    >`SELECT status, amount_hellers, external_id, failure_reason, metadata FROM payments
      WHERE booking_id = ${bookingId} ORDER BY created_at`;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const decoded = decodeURIComponent(body.replace(/\+/g, ' '));
        stripeLog.push({
          method: req.method ?? '',
          path: req.url ?? '',
          body: decoded,
          idempotency: req.headers['idempotency-key'] as string | undefined,
        });
        const r = fakeStripe(req, decoded);
        res.writeHead(r.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(r.json));
      });
    });
    await new Promise<void>((r) => server.listen(FAKE_PORT, '127.0.0.1', r));

    const reg = await call<never>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Karta ${slug}`,
        email: `${slug}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Karta',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    const regBody = reg.body as unknown as { tenantId: string; tokens: { accessToken: string } };
    token = regBody.tokens.accessToken;
    tenantId = regBody.tenantId;

    serviceId = (
      await ok<{ id: string }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Masáž', durationMinutes: 60, priceHellers: 100000 }),
      })
    ).id;
    employeeId = (
      await ok<{ id: string }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Ola', lastName: 'Masérka' }),
      })
    ).id;
    // Stripe s vlastními klíči provozovny (šifrují se v DB) + propojení pro náhradní odkaz.
    await ok('/admin/payment-methods', {
      method: 'POST',
      token,
      body: JSON.stringify({
        methodType: 'stripe',
        config: { secretKey: 'sk_test_fake', webhookSecret: WEBHOOK_SECRET },
      }),
    });
    await sql`INSERT INTO payment_connections (tenant_id, provider, account_id, status, charges_enabled)
      VALUES (${tenantId}, 'stripe', 'acct_fake', 'active', true)`;
    await ok('/admin/rules', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'No-show poplatek 50 %',
        triggerEvent: 'booking_no_show',
        conditions: { type: 'always' },
        actions: [{ type: 'charge_storno_fee', config: { percent: 50 } }],
      }),
    });
  });

  afterAll(async () => {
    await sql.end();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('1. admin pošle zákazníkovi odkaz na uložení karty', async () => {
    const bookingId = await novaRezervace('2027-03-01T09:00:00.000Z');
    const [b] = await sql<Array<{ customer_id: string }>>`
      SELECT customer_id FROM bookings WHERE id = ${bookingId}`;
    customerId = b!.customer_id;

    const res = await ok<{ setupUrl: string; emailed: boolean }>(
      `/admin/customers/${customerId}/cards/setup`,
      { method: 'POST', token, body: JSON.stringify({ sendEmail: true }) },
    );
    expect(res).toEqual({ setupUrl: 'https://checkout.stripe.test/setup', emailed: true });

    const session = stripeLog.find((r) => r.path === '/v1/checkout/sessions')!;
    expect(session.body).toContain('mode=setup');
    expect(session.body).toContain('payment_method_types[0]=card');
    expect(session.body).toContain('customer=cus_fake1');
    expect(session.body).toContain('metadata[purpose]=card_on_file');
    expect(session.body).toContain(`metadata[customerId]=${customerId}`);
    expect(session.body).toMatch(/success_url=http[^&]*\/profile\?karta=ulozena/);

    const [mail] = await sql<Array<{ body: string }>>`
      SELECT body FROM notifications WHERE tenant_id = ${tenantId} AND recipient = ${email}
      ORDER BY created_at DESC LIMIT 1`;
    expect(mail!.body).toContain('https://checkout.stripe.test/setup');
  });

  it('2. podepsaný webhook ze Stripe kartu uloží (bez čísla karty)', async () => {
    fakeMetadata = {
      purpose: 'card_on_file',
      tenantId,
      customerId,
      stripeCustomerId: 'cus_fake1',
    };
    const payload = JSON.stringify({
      id: 'evt_setup_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fake_setup',
          object: 'checkout.session',
          mode: 'setup',
          metadata: fakeMetadata,
        },
      },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');

    // Nepodepsaný / špatně podepsaný webhook se odmítne.
    const spatne = await fetch(`${API_URL}/payments/webhooks/${slug}/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=deadbeef` },
      body: payload,
    });
    expect(spatne.status).toBe(400);

    const res = await fetch(`${API_URL}/payments/webhooks/${slug}/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` },
      body: payload,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('card_saved');

    const karty = await ok<Array<{ brand: string; last4: string; expYear: number }>>(
      `/admin/customers/${customerId}/cards`,
      { token },
    );
    expect(karty).toHaveLength(1);
    expect(karty[0]).toMatchObject({ brand: 'visa', last4: '4242', expYear: 2030 });

    const [radek] =
      await sql`SELECT * FROM customer_payment_methods WHERE customer_id = ${customerId}`;
    expect(radek).toMatchObject({
      external_customer_id: 'cus_fake1',
      external_payment_method_id: 'pm_fake_visa',
      status: 'active',
    });
  });

  it('3. no-show → poplatek stržen z uložené karty, zákazník dostane oznámení', async () => {
    piMode = 'ok';
    const bookingId = await novaRezervace('2027-03-02T09:00:00.000Z');
    await ok(`/admin/bookings/${bookingId}/mark-no-show`, { method: 'POST', token });

    const [p] = await cekej(async () => {
      const r = await platby(bookingId);
      return r.length > 0 ? r : undefined;
    });
    expect(p).toMatchObject({ status: 'succeeded', amount_hellers: 50000 });
    expect(p!.metadata).toMatchObject({ kind: 'fee_saved_card', last4: '4242' });
    expect(p!.external_id).toMatch(/^pi_ok_/);

    const pi = stripeLog.filter((r) => r.path === '/v1/payment_intents').at(-1)!;
    expect(pi.body).toContain('off_session=true');
    expect(pi.body).toContain('confirm=true');
    expect(pi.body).toContain('payment_method=pm_fake_visa');
    expect(pi.body).toContain('amount=50000');
    expect(pi.idempotency).toBe(`fee-${bookingId}-50000`);

    const mail = await cekej(async () => {
      const [m] = await sql<Array<{ subject: string; body: string }>>`
        SELECT subject, body FROM notifications
        WHERE related_booking_id = ${bookingId} AND subject LIKE '%uložené karty%'`;
      return m;
    });
    expect(mail.body).toContain('4242');
  });

  it('4. zamítnutá karta → záznam o neúspěchu + náhradní odkaz k úhradě', async () => {
    piMode = 'declined';
    const bookingId = await novaRezervace('2027-03-03T09:00:00.000Z');
    await ok(`/admin/bookings/${bookingId}/mark-no-show`, { method: 'POST', token });

    const rows = await cekej(async () => {
      const r = await platby(bookingId);
      return r.length >= 2 ? r : undefined;
    });
    expect(rows[0]).toMatchObject({ status: 'failed', external_id: 'pi_declined' });
    expect(rows[0]!.failure_reason).toContain('insufficient_funds');
    expect(rows[1]).toMatchObject({ status: 'pending', amount_hellers: 50000 });

    const mail = await cekej(async () => {
      const [m] = await sql<Array<{ body: string }>>`
        SELECT body FROM notifications
        WHERE related_booking_id = ${bookingId} AND subject LIKE '%k úhradě%'`;
      return m;
    });
    expect(mail.body).toContain('https://checkout.stripe.test/pay');
  });

  it('5. zákazník si v portálu kartu prohlédne a odebere', async () => {
    const raw = randomBytes(32).toString('hex');
    await sql`INSERT INTO customer_magic_links (tenant_id, email, token_hash, purpose, expires_at)
      VALUES (${tenantId}, ${email}, ${createHash('sha256').update(raw).digest('hex')}, 'login',
        now() + interval '10 minutes')`;
    const v = await call<{ accessToken: string }>(`/portal/auth/verify?token=${raw}`, { tenantId });
    const portalToken =
      (v.body as { accessToken?: string }).accessToken ?? v.body.data!.accessToken;

    const karty = await ok<Array<{ id: string; last4: string }>>('/portal/me/cards', {
      token: portalToken,
      tenantId,
    });
    expect(karty.map((k) => k.last4)).toEqual(['4242']);

    const del = await call(`/portal/me/cards/${karty[0]!.id}`, {
      method: 'DELETE',
      token: portalToken,
      tenantId,
    });
    expect(del.status).toBe(204);
    expect(stripeLog.some((r) => r.path === '/v1/payment_methods/pm_fake_visa/detach')).toBe(true);
    expect(await ok('/portal/me/cards', { token: portalToken, tenantId })).toEqual([]);
  });

  it('6. výmaz GDPR smaže zákazníka i ve Stripe a karty z DB', async () => {
    // Karta znovu uložená (stejný webhook) → aktivní.
    const payload = JSON.stringify({
      id: 'evt_setup_2',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_fake_setup',
          object: 'checkout.session',
          mode: 'setup',
          metadata: fakeMetadata,
        },
      },
    });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
    await fetch(`${API_URL}/payments/webhooks/${slug}/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${sig}` },
      body: payload,
    });
    expect(await ok(`/admin/customers/${customerId}/cards`, { token })).toHaveLength(1);

    await ok(`/admin/gdpr/customers/${customerId}/erase`, {
      method: 'POST',
      token,
      body: JSON.stringify({ confirm: true, reason: 'žádost zákazníka' }),
    });
    expect(
      stripeLog.some((r) => r.method === 'DELETE' && r.path === '/v1/customers/cus_fake1'),
    ).toBe(true);
    const zbyle =
      await sql`SELECT id FROM customer_payment_methods WHERE customer_id = ${customerId}`;
    expect(zbyle).toHaveLength(0);
  });
});
