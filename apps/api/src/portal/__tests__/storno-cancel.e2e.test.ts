// E2E: portálové storno klientem podle storno politiky (sprint 11.x).
// Ověřuje za běhu, že POZDNÍ zrušení přes /portal/me/bookings/:id/cancel:
//   - u presetu „Benevolentní" (pozdě → náhrada) vydá náhradový kredit,
//   - u presetu „Přísný" (pozdě → propadá) náhradu nevydá.
//
// Vyžaduje běžící API (API_URL) + Postgres (DATABASE_URL). Magic-link token se
// vkládá přímo do DB (surový token jinak existuje jen v e-mailu), zbytek jde
// přes reálné HTTP. Login zákazníka = vlož magic-link → GET /portal/auth/verify.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const DB = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DB, { max: 4 });

function sha256(x: string): string {
  return createHash('sha256').update(x).digest('hex');
}

async function http<T>(
  path: string,
  init: RequestInit & { token?: string; tenantId?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init.tenantId) headers['X-Tenant-ID'] = init.tenantId;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${text}`);
  return body as T;
}

describe('Portálové storno dle politiky (e2e)', () => {
  const slug = `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    32,
  );
  let token: string;
  let tenantId: string;
  let svcId: string;
  let empId: string;

  beforeAll(async () => {
    const reg = await http<{ tenantId: string; tokens: { accessToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Portal Cancel ${slug}`,
          email: `${slug}@e2e.local`,
          password: 'SecureTestPwd123!',
          firstName: 'PC',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;
    tenantId = reg.tenantId;

    const branches = await http<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    const branchId = branches.data[0]!.id;

    const svc = await http<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Lekce',
        durationMinutes: 45,
        priceHellers: 30000,
        archetype: 'skupinova_lekce',
      }),
    });
    svcId = svc.data.id;

    const emp = await http<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({
        firstName: 'Trenér',
        lastName: 'PC',
        branchIds: [branchId],
        serviceIds: [svcId],
      }),
    });
    empId = emp.data.id;
  });

  afterAll(async () => {
    await sql.end();
  });

  // Vytvoří lekci za `hoursAhead`, klient se veřejně přihlásí → vrátí
  // { bookingId, customerId } (booking přes class join zakládá customer entitu).
  let counter = 0;
  async function joinSoon(email: string, hoursAhead: number) {
    // Každé volání posuň o 3h, ať se lekce stejného trenéra nepřekrývají.
    const startsAt = new Date(
      Date.now() + hoursAhead * 3_600_000 + counter++ * 3 * 3_600_000,
    ).toISOString();
    const s = await http<{ data: { id: string } }>('/admin/class-sessions', {
      method: 'POST',
      token,
      body: JSON.stringify({ serviceId: svcId, employeeId: empId, startsAt, capacity: 5 }),
    });
    const j = await http<{ data: { id: string } }>(
      `/public/${slug}/class-sessions/${s.data.id}/join`,
      { method: 'POST', body: JSON.stringify({ customerName: 'Klient', customerEmail: email }) },
    );
    const list = await http<{ data: Array<{ id: string; email: string }> }>(
      `/admin/customers?search=${encodeURIComponent(email)}`,
      { token },
    );
    const customerId = list.data.find((c) => c.email.toLowerCase() === email.toLowerCase())!.id;
    return { bookingId: j.data.id, customerId };
  }

  // Portal login: vlož magic-link s known tokenem → verify → access token.
  async function portalToken(email: string): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    await sql`INSERT INTO customer_magic_links (tenant_id, email, token_hash, purpose, expires_at)
      VALUES (${tenantId}, ${email}, ${sha256(raw)}, 'login', ${new Date(Date.now() + 600_000)})`;
    const v = await http<{ accessToken?: string; data?: { accessToken: string } }>(
      `/portal/auth/verify?token=${raw}`,
      { tenantId },
    );
    return v.accessToken ?? v.data!.accessToken;
  }

  async function makeupCount(email: string): Promise<number> {
    const rows = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM makeup_credits
      WHERE tenant_id = ${tenantId} AND lower(customer_email) = lower(${email})
        AND status = 'available'`;
    return rows[0]?.n ?? 0;
  }

  async function bookingStatus(bookingId: string): Promise<string> {
    const rows = await sql<Array<{ status: string }>>`
      SELECT status FROM bookings WHERE id = ${bookingId}`;
    return rows[0]?.status ?? 'missing';
  }

  it('Benevolentní: pozdní storno → vydá náhradový kredit', async () => {
    await http('/admin/settings/cancellation', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ preset: 'generous' }), // freeCancelHours 4, pozdě → makeup
    });
    const email = 'late-makeup@pc.local';
    const { bookingId } = await joinSoon(email, 3); // 3h < 4h → pozdě

    const ptoken = await portalToken(email);
    await http(`/portal/me/bookings/${bookingId}/cancel`, {
      method: 'POST',
      token: ptoken,
      tenantId,
      body: JSON.stringify({ reason: 'nemoc' }),
    });

    expect(await bookingStatus(bookingId)).toBe('cancelled');
    expect(await makeupCount(email)).toBe(1);
  });

  it('Přísný: pozdní storno → lekce propadá, žádná náhrada', async () => {
    await http('/admin/settings/cancellation', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ preset: 'strict' }), // freeCancelHours 24, pozdě → propadá
    });
    const email = 'late-lose@pc.local';
    const { bookingId } = await joinSoon(email, 3); // 3h < 24h → pozdě

    const ptoken = await portalToken(email);
    await http(`/portal/me/bookings/${bookingId}/cancel`, {
      method: 'POST',
      token: ptoken,
      tenantId,
      body: JSON.stringify({ reason: 'nestihnu' }),
    });

    expect(await bookingStatus(bookingId)).toBe('cancelled');
    expect(await makeupCount(email)).toBe(0);
  });

  it('včasné storno (v okně) → náhrada se nevydává', async () => {
    await http('/admin/settings/cancellation', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ preset: 'generous' }), // okno 4h
    });
    const email = 'in-window@pc.local';
    const { bookingId } = await joinSoon(email, 30); // 30h > 4h → včas

    const ptoken = await portalToken(email);
    await http(`/portal/me/bookings/${bookingId}/cancel`, {
      method: 'POST',
      token: ptoken,
      tenantId,
      body: JSON.stringify({ reason: 'změna plánů' }),
    });

    expect(await bookingStatus(bookingId)).toBe('cancelled');
    expect(await makeupCount(email)).toBe(0); // včas → lekce se vrací, ne náhrada
  });
});
