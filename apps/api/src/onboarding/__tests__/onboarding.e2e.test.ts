// E2E: onboarding se počítá ze SKUTEČNÝCH DAT.
//
// Každý krok se ověřuje přechodem nesplněno → splněno po REÁLNÉ AKCI přes HTTP
// (vytvoření služby, zaměstnance, rozpisu, rezervace, volba plateb), ne
// nastavením příznaku v onboarding_checklist. Jediná výjimka je ověření
// e-mailu: pro administrátory pro něj neexistuje žádný endpoint (funkce není
// implementovaná), takže se nastavuje přímo v DB — ale i to je skutečná změna
// dat, ne příznak v checklistu.
//
// Vyžaduje běžící API (API_URL) + Postgres (DATABASE_URL).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const API = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const sql = postgres(DB, { max: 4 });

interface Checklist {
  emailVerified: boolean;
  firstServiceCreated: boolean;
  workingHoursSet: boolean;
  teamInvited: boolean;
  paymentsConnected: boolean;
  firstBookingReceived: boolean;
  completedCount: number;
  totalCount: number;
  skippedSteps: string[];
}

async function http<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

describe('Onboarding — stav se počítá z dat (e2e)', () => {
  const slug = `onb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.slice(
    0,
    32,
  );
  let token: string;
  let tenantId: string;
  let branchId: string;
  let serviceId: string;
  let employeeId: string;

  const checklist = (): Promise<Checklist> =>
    http<{ data: Checklist }>('/admin/onboarding/checklist', { token }).then((r) => r.data);

  beforeAll(async () => {
    const reg = await http<{ tenantId: string; tokens: { accessToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Onboarding ${slug}`,
          email: `${slug}@e2e.local`,
          password: 'SecureTestPwd123!',
          firstName: 'Onb',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;
    tenantId = reg.tenantId;
    const br = await http<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    branchId = br.data[0]!.id;
  });

  afterAll(async () => {
    await sql.end();
  });

  it('čerstvý tenant nemá splněno nic', async () => {
    const c = await checklist();
    expect(c.completedCount).toBe(0);
    expect(c.totalCount).toBe(6);
    expect(c.emailVerified).toBe(false);
    expect(c.paymentsConnected).toBe(false);
  });

  it('krok „Ověřit email" se splní potvrzením e-mailu vlastníka', async () => {
    expect((await checklist()).emailVerified).toBe(false);

    // Ověřovací flow pro administrátory neexistuje → nastavujeme sloupec přímo.
    await sql`UPDATE users SET email_verified_at = now()
              WHERE tenant_id = ${tenantId} AND role = 'owner'`;

    expect((await checklist()).emailVerified).toBe(true);
  });

  it('krok „Vytvořit první službu" se splní vytvořením služby', async () => {
    expect((await checklist()).firstServiceCreated).toBe(false);

    const svc = await http<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'Konzultace', durationMinutes: 60, priceHellers: 50000 }),
    });
    serviceId = svc.data.id;

    expect((await checklist()).firstServiceCreated).toBe(true);
  });

  it('krok „Pozvat tým" se splní vytvořením zaměstnance', async () => {
    expect((await checklist()).teamInvited).toBe(false);

    const emp = await http<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({
        firstName: 'Petr',
        lastName: 'Novák',
        branchIds: [branchId],
        serviceIds: [serviceId],
      }),
    });
    employeeId = emp.data.id;

    expect((await checklist()).teamInvited).toBe(true);
  });

  it('krok „Nastavit pracovní dobu" se splní uložením rozpisu', async () => {
    expect((await checklist()).workingHoursSet).toBe(false);

    await http(`/admin/employees/${employeeId}/schedule`, {
      method: 'PUT',
      token,
      body: JSON.stringify({
        schedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '08:00',
          endTime: '20:00',
        })),
      }),
    });

    expect((await checklist()).workingHoursSet).toBe(true);
  });

  it('krok „Nastavit platby" se splní volbou „jen hotovost" (bez brány)', async () => {
    expect((await checklist()).paymentsConnected).toBe(false);

    // Provozovna vědomě nechce online platby — musí jít dokončit onboarding.
    await http('/admin/settings/payments', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ cashOnly: true }),
    });

    expect((await checklist()).paymentsConnected).toBe(true);
  });

  it('krok „Nastavit platby" se splní i napojenou použitelnou bránou', async () => {
    // Druhá cesta ke stejnému kroku: vypneme hotovost a připojíme bránu.
    await http('/admin/settings/payments', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ cashOnly: false }),
    });
    expect((await checklist()).paymentsConnected).toBe(false);

    await sql`INSERT INTO payment_connections (tenant_id, provider, status, charges_enabled)
              VALUES (${tenantId}, 'mock', 'active', true)`;
    expect((await checklist()).paymentsConnected).toBe(true);

    // Nepoužitelná brána (pending) krok splnit NESMÍ.
    await sql`UPDATE payment_connections SET status = 'pending', charges_enabled = false
              WHERE tenant_id = ${tenantId}`;
    expect((await checklist()).paymentsConnected).toBe(false);

    // Vrátíme zpět na hotovost, ať je tenant dokončitelný.
    await http('/admin/settings/payments', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ cashOnly: true }),
    });
  });

  it('krok „První rezervace" se splní vytvořením rezervace → 6 z 6', async () => {
    expect((await checklist()).firstBookingReceived).toBe(false);

    const zitra = new Date();
    zitra.setUTCDate(zitra.getUTCDate() + 1);
    zitra.setUTCHours(8, 0, 0, 0);

    await http('/admin/bookings', {
      method: 'POST',
      token,
      body: JSON.stringify({
        serviceId,
        employeeId,
        branchId,
        customerName: 'Jana Testovací',
        customerEmail: `klient-${slug}@e2e.local`,
        startsAt: zitra.toISOString(),
        skipEmail: true,
      }),
    });

    const c = await checklist();
    expect(c.firstBookingReceived).toBe(true);
    expect(c.completedCount).toBe(6);
  });

  it('chybějící řádek v onboarding_checklist stav NESHODÍ na nuly', async () => {
    // Přesně ta chyba, kterou fáze opravuje: seed jde přímo do DB a řádek
    // nevytvoří. Stav se musí spočítat z dat i bez něj.
    await sql`DELETE FROM onboarding_checklist WHERE tenant_id = ${tenantId}`;

    const c = await checklist();
    expect(c.completedCount).toBe(6);
    expect(c.firstServiceCreated).toBe(true);
    expect(c.workingHoursSet).toBe(true);
  });

  it('vědomé přeskočení platí i bez dat a je v odpovědi přiznané', async () => {
    // Nový tenant bez čehokoli — krok „Pozvat tým" přeskočíme.
    const slug2 = `onb2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.slice(
      0,
      32,
    );
    const reg = await http<{ tokens: { accessToken: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug2,
        tenantName: `Onboarding ${slug2}`,
        email: `${slug2}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Onb',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    const token2 = reg.tokens.accessToken;

    const pred = await http<{ data: Checklist }>('/admin/onboarding/checklist', { token: token2 });
    expect(pred.data.teamInvited).toBe(false);

    await http('/admin/onboarding/checklist', {
      method: 'PATCH',
      token: token2,
      body: JSON.stringify({ step: 'teamInvited' }),
    });

    const po = await http<{ data: Checklist }>('/admin/onboarding/checklist', { token: token2 });
    expect(po.data.teamInvited).toBe(true);
    // Musí být vidět, že to je přeskočení, ne skutečně pozvaný tým.
    expect(po.data.skippedSteps).toContain('teamInvited');
  });
});
