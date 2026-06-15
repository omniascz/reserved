// E2E: Storno & bonus policy engine (presety + rollover) proti běžícímu API.
//
// Ověřuje páčky + 3 presety a hlavně ROLLOVER — klientův scénář: program na
// 20 lekcí, 2x nepřišel → při koupi dalšího programu se nevyčerpané přičtou.
//
// Run: pnpm --filter @reserved/e2e test   (API na :4000 + DB)

import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api/v1';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `sb-${ts}-${rand}`.slice(0, 32);
}

async function apiCall<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${text}`);
  return body as T;
}

describe('Storno & bonus policy E2E', () => {
  const slug = uniqueSlug();
  let token: string;
  let svcId: string;
  let empId: string;

  beforeAll(async () => {
    const reg = await apiCall<{ tokens: { accessToken: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Storno Studio ${slug}`,
        email: `${slug}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Storno',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    token = reg.tokens.accessToken;

    const branches = await apiCall<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    const branchId = branches.data[0]!.id;

    const svc = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Spinning (skupina)',
        durationMinutes: 45,
        priceHellers: 50000,
        archetype: 'skupinova_lekce',
      }),
    });
    svcId = svc.data.id;

    const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({
        firstName: 'Trenér',
        lastName: 'Storno',
        branchIds: [branchId],
        serviceIds: [svcId],
      }),
    });
    empId = emp.data.id;
  });

  // Vytvoří customer entitu přes veřejné přihlášení na lekci (findOrCreate) a
  // vrátí její id (admin rezervace customerId nezakládá).
  let mintHour = 8;
  async function mintCustomer(name: string, email: string): Promise<string> {
    const startsAt = `2032-03-${String(++mintHour).padStart(2, '0')}T08:00:00.000Z`;
    const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
      method: 'POST',
      token,
      body: JSON.stringify({ serviceId: svcId, employeeId: empId, startsAt, capacity: 5 }),
    });
    await apiCall(`/public/${slug}/class-sessions/${s.data.id}/join`, {
      method: 'POST',
      body: JSON.stringify({ customerName: name, customerEmail: email }),
    });
    const list = await apiCall<{ data: Array<{ id: string; email: string }> }>(
      `/admin/customers?search=${encodeURIComponent(email)}`,
      { token },
    );
    const found = list.data.find((c) => c.email.toLowerCase() === email.toLowerCase());
    if (!found) throw new Error(`Customer ${email} nenalezen po join`);
    return found.id;
  }

  // ─── Presety ──────────────────────────────────────────────────────────
  describe('Presety', () => {
    it('Přísný: okno 24h, pozdě propadá, rollover vypnutý', async () => {
      const r = await apiCall<{
        data: { freeCancelHours: number; lateCancel: string; rolloverEnabled: boolean };
      }>('/admin/settings/cancellation', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ preset: 'strict' }),
      });
      expect(r.data.freeCancelHours).toBe(24);
      expect(r.data.lateCancel).toBe('lose_lesson');
      expect(r.data.rolloverEnabled).toBe(false);
    });

    it('Benevolentní: no-show dává náhradu, rollover bez limitu', async () => {
      const r = await apiCall<{ data: { noShow: string; rolloverUnlimited: boolean } }>(
        '/admin/settings/cancellation',
        { method: 'PATCH', token, body: JSON.stringify({ preset: 'generous' }) },
      );
      expect(r.data.noShow).toBe('makeup_credit');
      expect(r.data.rolloverUnlimited).toBe(true);
    });

    it('doladění páčky bez presetu → přepne na custom', async () => {
      const r = await apiCall<{ data: { preset: string; freeCancelHours: number } }>(
        '/admin/settings/cancellation',
        { method: 'PATCH', token, body: JSON.stringify({ freeCancelHours: 6 }) },
      );
      expect(r.data.preset).toBe('custom');
      expect(r.data.freeCancelHours).toBe(6);

      const get = await apiCall<{ data: { preset: string; freeCancelHours: number } }>(
        '/admin/settings/cancellation',
        { token },
      );
      expect(get.data.preset).toBe('custom');
      expect(get.data.freeCancelHours).toBe(6);
    });
  });

  // ─── Rollover (přenos nevyčerpaných lekcí) ─────────────────────────────
  describe('Rollover nevyčerpaných lekcí', () => {
    async function makePack(totalCredits: number): Promise<string> {
      const p = await apiCall<{ data: { id: string } }>('/admin/credit-packs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: `Program ${totalCredits} lekcí`,
          mode: 'per_visit',
          totalCredits,
          validityDays: 30,
          priceHellers: 0,
        }),
      });
      return p.data.id;
    }
    async function allocate(customerId: string, packId: string, validFromIso?: string) {
      const r = await apiCall<{ data: { id: string; creditsRemaining: number } }>(
        `/admin/customers/${customerId}/credit-packs`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ creditPackId: packId, ...(validFromIso ? { validFromIso } : {}) }),
        },
      );
      return r.data;
    }
    async function listPacks(customerId: string) {
      const r = await apiCall<{
        data: Array<{ id: string; creditsRemaining: number; status: string }>;
      }>(`/admin/customers/${customerId}/credit-packs`, { token });
      return r.data;
    }

    const pastFrom = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // expirovalo

    it('Férový: 8 z 10 nevyčerpaných → přenese max 2 na nový program', async () => {
      await apiCall('/admin/settings/cancellation', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ preset: 'fair' }),
      });
      const cust = await mintCustomer('Rollover Klient', 'roll@sb.local');
      const packId = await makePack(10);

      // Starý program: vystaven v minulosti → už expiroval, plných 10 kreditů zbývá
      // (klient z něj nic nevyčerpal — modelujeme „2 nepřišel" jako zbytek).
      const old = await allocate(cust, packId, pastFrom);

      // Nový program → spustí rollover (cap 2).
      const fresh = await allocate(cust, packId);

      const packs = await listPacks(cust);
      const oldRow = packs.find((p) => p.id === old.id)!;
      const freshRow = packs.find((p) => p.id === fresh.id)!;

      expect(freshRow.creditsRemaining).toBe(12); // 10 + 2 přeneseno
      expect(oldRow.status).toBe('rolled_over');
      expect(oldRow.creditsRemaining).toBe(0);
    });

    it('Přísný: rollover vypnutý → nový program zůstane na 10', async () => {
      await apiCall('/admin/settings/cancellation', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ preset: 'strict' }),
      });
      const cust = await mintCustomer('NoRoll Klient', 'noroll@sb.local');
      const packId = await makePack(10);
      const old = await allocate(cust, packId, pastFrom);
      const fresh = await allocate(cust, packId);

      const packs = await listPacks(cust);
      const oldRow = packs.find((p) => p.id === old.id)!;
      const freshRow = packs.find((p) => p.id === fresh.id)!;

      expect(freshRow.creditsRemaining).toBe(10); // beze změny
      expect(oldRow.status).toBe('active'); // nedotčeno
    });
  });
});
