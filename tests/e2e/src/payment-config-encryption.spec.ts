// Šifrování přístupů k platebním bránám — E2E.
//
// Jednotkové testy v packages/utils ověřují samotný převod. Tady jde o to
// podstatnější: že přes SKUTEČNÉ API projde uložení i načtení, že v databázi
// opravdu leží zašifrovaná obálka (ne čitelné heslo) a že odpověď API
// tajemství maskuje.
//
// Kontrola v databázi je tu schválně: kdyby se ověřovalo jen přes API, test by
// prošel i tehdy, kdyby se šifrování vůbec nezapnulo — API by vracelo tytéž
// hodnoty, které dostalo.

import { describe, it, expect, beforeAll } from 'vitest';
import postgres from 'postgres';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';

const sql = postgres(DB_URL, { max: 2 });

function uniqueSlug(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`.slice(0, 32);
}

async function apiCall<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

describe('Šifrování přístupů k platebním bránám', () => {
  const slug = uniqueSlug('pay');
  let token: string;
  let tenantId: string;

  const MERCHANT = '123456';
  const SECRET = 'tajne-heslo-comgate-987';

  beforeAll(async () => {
    const reg = await apiCall<{ tokens: { accessToken: string }; tenantId: string }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Platby ${slug}`,
          email: `${slug}@e2e.local`,
          password: 'SecureTestPwd123!',
          firstName: 'Platby',
          lastName: 'Testovací',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;
    const [t] = await sql`SELECT id FROM tenants WHERE slug = ${slug}`;
    tenantId = (t as { id: string }).id;
  }, 60_000);

  it('uloží konfiguraci Comgate a vrátí ji s maskovaným heslem', async () => {
    const r = await apiCall<{ data: { config: Record<string, unknown> } }>(
      '/admin/payment-methods',
      {
        method: 'POST',
        token,
        body: JSON.stringify({
          methodType: 'comgate',
          config: { merchant: MERCHANT, secret: SECRET, test: true },
          isEnabled: true,
        }),
      },
    );

    // Identifikátor zůstává čitelný — provozovatel si musí ověřit, že zadal
    // správné číslo napojení.
    expect(r.data.config.merchant).toBe(MERCHANT);
    // Heslo se vrací maskované.
    expect(String(r.data.config.secret)).toMatch(/^••••••/);
    expect(String(r.data.config.secret)).not.toContain(SECRET);
    // Boolean zůstal booleanem — text "false" by brána brala jako PRAVDU.
    expect(r.data.config.test).toBe(true);
  });

  it('V DATABÁZI je zašifrovaná obálka, ne čitelné heslo', async () => {
    const [row] = await sql`
      SELECT config::text AS config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'comgate'`;
    const ulozeno = (row as { config: string }).config;

    // Tohle je jádro věci: dump databáze nesmí vydat přístupy k bráně.
    expect(ulozeno).not.toContain(SECRET);
    expect(ulozeno).not.toContain(MERCHANT);
    expect(ulozeno).toContain('__enc');
    expect(ulozeno).toContain('enc.v1:');
  });

  it('výpis metod vrací maskovaná tajemství všech bran, ne jen Stripe', async () => {
    // Dřív maskování pokrývalo jen secretKey/webhookSecret/clientSecret, takže
    // heslo Comgate se vracelo čitelné.
    await apiCall('/admin/payment-methods', {
      method: 'POST',
      token,
      body: JSON.stringify({
        methodType: 'thepay',
        config: { projectId: '42', apiPassword: 'tajne-thepay-heslo' },
        isEnabled: false,
      }),
    });

    const r = await apiCall<{
      data: Array<{ methodType: string; config: Record<string, unknown> }>;
    }>('/admin/payment-methods', { token });

    const comgate = r.data.find((m) => m.methodType === 'comgate')!;
    const thepay = r.data.find((m) => m.methodType === 'thepay')!;

    expect(String(comgate.config.secret)).toMatch(/^••••••/);
    expect(String(thepay.config.apiPassword)).toMatch(/^••••••/);
    expect(JSON.stringify(r.data)).not.toContain(SECRET);
    expect(JSON.stringify(r.data)).not.toContain('tajne-thepay-heslo');
  });

  it('úprava jiného pole NEZTRATÍ uložené heslo', async () => {
    // Klient pošle zpět maskovanou hodnotu (tak, jak ji dostal). Server musí
    // dosadit původní heslo — jinak by se do databáze uložily hvězdičky a
    // brána by přestala fungovat.
    const pred = await apiCall<{
      data: Array<{ methodType: string; config: Record<string, unknown> }>;
    }>('/admin/payment-methods', { token });
    const maskovane = pred.data.find((m) => m.methodType === 'comgate')!.config;

    await apiCall('/admin/payment-methods', {
      method: 'POST',
      token,
      body: JSON.stringify({
        methodType: 'comgate',
        config: { ...maskovane, merchant: '654321' },
        isEnabled: true,
      }),
    });

    // Ověření v databázi: heslo tam pořád je (zašifrované), ne hvězdičky.
    const [row] = await sql`
      SELECT config::text AS config FROM payment_methods
      WHERE tenant_id = ${tenantId} AND method_type = 'comgate'`;
    expect((row as { config: string }).config).not.toContain('••••••');

    // A po dalším načtení je heslo pořád maskované, tedy uložené.
    const po = await apiCall<{
      data: Array<{ methodType: string; config: Record<string, unknown> }>;
    }>('/admin/payment-methods', { token });
    const comgate = po.data.find((m) => m.methodType === 'comgate')!;
    expect(String(comgate.config.secret)).toMatch(/^••••••/);
    expect(comgate.config.merchant).toBe('654321');
  });

  it('cizí tenant konfiguraci nevidí', async () => {
    const slug2 = uniqueSlug('pay2');
    const reg = await apiCall<{ tokens: { accessToken: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug2,
        tenantName: `Cizí ${slug2}`,
        email: `${slug2}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Cizí',
        lastName: 'Tenant',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });

    const r = await apiCall<{ data: Array<{ methodType: string }> }>('/admin/payment-methods', {
      token: reg.tokens.accessToken,
    });
    expect(r.data.find((m) => m.methodType === 'comgate')).toBeUndefined();

    await sql`DELETE FROM tenants WHERE slug = ${slug2}`;
  });
});
