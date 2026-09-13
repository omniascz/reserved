// Fáze UI 2 část 1 — provozní správa vydaných permanentek proti běžícímu API.
//
// Pokrývá:
//   1. GET  /admin/passes (filtry, stránkování, vypočtený stav vs. uložený)
//   2. GET  /admin/passes/:type/:id (detail se snapshotem)
//   3. POST /admin/passes/:type/:id/suspend | resume
//      + KLÍČOVÉ: pozastavená permanentka se při rezervaci NESMÍ čerpat
//   4. Prodloužení platnosti u kreditové i bundle permanentky
//   + regrese bodu 8: dobití časového balíčku platného na všechny služby
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4010 + DB)

import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `pass-${ts}-${rand}`.slice(0, 32);
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

async function expectFail(path: string, init?: RequestInit & { token?: string }): Promise<string> {
  try {
    await apiCall(path, init);
    throw new Error(`Očekáváno selhání pro ${path}, ale prošlo`);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

interface PassItem {
  id: string;
  type: 'credit' | 'bundle' | 'time';
  customerId: string | null;
  customerEmail: string | null;
  packName: string | null;
  balanceRemaining: number | null;
  balanceTotal: number | null;
  balanceLabel: string;
  validUntil: string | null;
  storedStatus: string;
  effectiveStatus: string;
  pricePaidHellers: number;
}

interface PassList {
  items: PassItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

describe('Admin správa vydaných permanentek (UI 2)', () => {
  const slug = uniqueSlug();
  const email = `${slug}@e2e.local`;
  const password = 'SecureTestPwd123!';
  const clientEmail = `klient-${slug}@e2e.local`;

  let token: string;
  let groupServiceId: string;
  let secondServiceId: string;
  let customerId: string;
  let creditPackId: string;
  let creditAllocationId: string;

  async function createSession(startsAt: string): Promise<string> {
    const res = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
      method: 'POST',
      token,
      body: JSON.stringify({ serviceId: groupServiceId, startsAt, capacity: 5 }),
    });
    return res.data.id;
  }

  /** Přihlásí klienta do lekce — tohle je cesta, která permanentku reálně čerpá. */
  async function joinSession(sessionId: string): Promise<void> {
    await apiCall(`/admin/class-sessions/${sessionId}/join`, {
      method: 'POST',
      token,
      body: JSON.stringify({ customerName: 'Pavel Permanentka', customerEmail: clientEmail }),
    });
  }

  async function creditBalance(): Promise<number> {
    const res = await apiCall<{ data: PassItem }>(`/admin/passes/credit/${creditAllocationId}`, {
      token,
    });
    return res.data.balanceRemaining ?? -1;
  }

  beforeAll(async () => {
    const reg = await apiCall<{ tokens: { accessToken: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Pass Studio ${slug}`,
        email,
        password,
        firstName: 'Pass',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    token = reg.tokens.accessToken;

    const group = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Skupinová lekce',
        durationMinutes: 60,
        priceHellers: 25000,
        archetype: 'skupinova_lekce',
      }),
    });
    groupServiceId = group.data.id;

    const second = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'Masáž', durationMinutes: 60, priceHellers: 70000 }),
    });
    secondServiceId = second.data.id;

    // Klienta v tomto repu zakládá až přihlášení do lekce (findOrCreate).
    const bootstrapSession = await createSession('2034-01-10T09:00:00.000Z');
    await joinSession(bootstrapSession);
    const customers = await apiCall<{ data: Array<{ id: string; email: string }> }>(
      `/admin/customers?search=${encodeURIComponent(clientEmail)}`,
      { token },
    );
    customerId = customers.data[0]!.id;

    const tpl = await apiCall<{ data: { id: string } }>('/admin/credit-packs', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: '5× vstup',
        totalCredits: 5,
        validityDays: 30,
        priceHellers: 150000,
      }),
    });
    creditPackId = tpl.data.id;

    const alloc = await apiCall<{ data: { id: string } }>(
      `/admin/customers/${customerId}/credit-packs`,
      { method: 'POST', token, body: JSON.stringify({ creditPackId }) },
    );
    creditAllocationId = alloc.data.id;
  });

  // ─── 1. Výpis ─────────────────────────────────────────────────────────

  describe('GET /admin/passes', () => {
    it('vypíše vydanou permanentku se zůstatkem i popiskem', async () => {
      const res = await apiCall<{ data: PassList }>('/admin/passes', { token });
      const row = res.data.items.find((p) => p.id === creditAllocationId);
      expect(row).toBeDefined();
      expect(row?.type).toBe('credit');
      expect(row?.customerEmail).toBe(clientEmail);
      expect(row?.packName).toBe('5× vstup');
      expect(row?.balanceRemaining).toBe(5);
      expect(row?.balanceTotal).toBe(5);
      expect(row?.balanceLabel).toBe('5 z 5 kreditů');
      expect(row?.effectiveStatus).toBe('active');
      expect(res.data.total).toBeGreaterThan(0);
    });

    it('filtruje podle typu, klienta a hledání v e-mailu', async () => {
      const byType = await apiCall<{ data: PassList }>('/admin/passes?type=credit', { token });
      expect(byType.data.items.every((p) => p.type === 'credit')).toBe(true);

      const byCustomer = await apiCall<{ data: PassList }>(
        `/admin/passes?customerId=${customerId}`,
        { token },
      );
      expect(byCustomer.data.items.every((p) => p.customerId === customerId)).toBe(true);

      const bySearch = await apiCall<{ data: PassList }>(
        `/admin/passes?search=${encodeURIComponent(clientEmail.slice(0, 12))}`,
        { token },
      );
      expect(bySearch.data.items.some((p) => p.id === creditAllocationId)).toBe(true);

      const noMatch = await apiCall<{ data: PassList }>('/admin/passes?search=neexistuje-xyz', {
        token,
      });
      expect(noMatch.data.items).toHaveLength(0);
    });

    it('propadlá permanentka s uloženým stavem active se vypíše jako propadlá', async () => {
      // validFrom 10 dní zpět + platnost 1 den → propadla, ale sloupec zůstane 'active'.
      const tpl = await apiCall<{ data: { id: string } }>('/admin/credit-packs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Propadlá',
          totalCredits: 3,
          validityDays: 1,
          priceHellers: 10000,
        }),
      });
      const past = new Date(Date.now() - 10 * 86400_000).toISOString();
      const alloc = await apiCall<{ data: { id: string; status: string } }>(
        `/admin/customers/${customerId}/credit-packs`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ creditPackId: tpl.data.id, validFromIso: past }),
        },
      );
      expect(alloc.data.status).toBe('active'); // uložený stav lže

      const res = await apiCall<{ data: PassList }>('/admin/passes?status=expired', { token });
      const row = res.data.items.find((p) => p.id === alloc.data.id);
      expect(row).toBeDefined();
      expect(row?.storedStatus).toBe('active');
      expect(row?.effectiveStatus).toBe('expired');

      // a ve filtru na aktivní se neobjeví
      const active = await apiCall<{ data: PassList }>('/admin/passes?status=active', { token });
      expect(active.data.items.some((p) => p.id === alloc.data.id)).toBe(false);
    });

    it('umí stránkovat a hlásí hasMore', async () => {
      const page = await apiCall<{ data: PassList }>('/admin/passes?limit=1&offset=0', { token });
      expect(page.data.items).toHaveLength(1);
      expect(page.data.limit).toBe(1);
      expect(page.data.hasMore).toBe(true);
    });

    it('expiringWithinDays vybere jen permanentky, které teprve propadnou', async () => {
      const soon = await apiCall<{ data: PassList }>('/admin/passes?expiringWithinDays=60', {
        token,
      });
      expect(soon.data.items.some((p) => p.id === creditAllocationId)).toBe(true);
      expect(soon.data.items.every((p) => p.validUntil !== null)).toBe(true);
      // propadlé se do okna nepočítají
      expect(soon.data.items.every((p) => p.effectiveStatus !== 'expired')).toBe(true);
    });

    it('neplatný typ i stav odmítne Zod', async () => {
      expect(await expectFail('/admin/passes?type=nonsense', { token })).toMatch(
        /VALIDATION_FAILED|400/,
      );
      expect(await expectFail('/admin/passes?status=nonsense', { token })).toMatch(
        /VALIDATION_FAILED|400/,
      );
      expect(await expectFail('/admin/passes?limit=9999', { token })).toMatch(
        /VALIDATION_FAILED|400/,
      );
    });
  });

  // ─── 2. Detail ────────────────────────────────────────────────────────

  describe('GET /admin/passes/:type/:id', () => {
    it('vrátí detail se snapshotem, platností a cenou', async () => {
      const res = await apiCall<{
        data: PassItem & { snapshot: { mode: string; allowedServiceIds: string[] } };
      }>(`/admin/passes/credit/${creditAllocationId}`, { token });
      expect(res.data.id).toBe(creditAllocationId);
      expect(res.data.pricePaidHellers).toBe(150000);
      expect(res.data.validUntil).toBeTruthy();
      expect(res.data.snapshot.mode).toBe('per_visit');
      expect(Array.isArray(res.data.snapshot.allowedServiceIds)).toBe(true);
    });

    it('neznámý typ v cestě odmítne Zod', async () => {
      const err = await expectFail(`/admin/passes/nonsense/${creditAllocationId}`, { token });
      expect(err).toMatch(/VALIDATION_FAILED|400/);
    });
  });

  // ─── 3. Pozastavení a obnovení ────────────────────────────────────────

  describe('POST /admin/passes/credit/:id/suspend | resume', () => {
    it('nejdřív ověří, že aktivní permanentka se při rezervaci čerpá', async () => {
      expect(await creditBalance()).toBe(5);
      const session = await createSession('2034-01-11T09:00:00.000Z');
      await joinSession(session);
      expect(await creditBalance()).toBe(4);
    });

    it('pozastavení vyžaduje poznámku', async () => {
      const err = await expectFail(`/admin/passes/credit/${creditAllocationId}/suspend`, {
        method: 'POST',
        token,
        body: JSON.stringify({}),
      });
      expect(err).toMatch(/VALIDATION_FAILED|400/);
    });

    it('pozastaví permanentku a ukáže ji jako suspended', async () => {
      await apiCall(`/admin/passes/credit/${creditAllocationId}/suspend`, {
        method: 'POST',
        token,
        body: JSON.stringify({ note: 'Klient na 2 měsíce odjíždí.' }),
      });
      const res = await apiCall<{ data: PassItem }>(`/admin/passes/credit/${creditAllocationId}`, {
        token,
      });
      expect(res.data.storedStatus).toBe('suspended');
      expect(res.data.effectiveStatus).toBe('suspended');
    });

    it('POZASTAVENÁ permanentka se při rezervaci NEČERPÁ', async () => {
      const before = await creditBalance();
      const session = await createSession('2034-01-12T09:00:00.000Z');
      await joinSession(session);
      expect(await creditBalance()).toBe(before);
    });

    it('dvojí pozastavení odmítne (PASS_NOT_SUSPENDABLE)', async () => {
      const err = await expectFail(`/admin/passes/credit/${creditAllocationId}/suspend`, {
        method: 'POST',
        token,
        body: JSON.stringify({ note: 'ještě jednou' }),
      });
      expect(err).toMatch(/PASS_NOT_SUSPENDABLE/);
    });

    it('obnovení vrátí čerpání do hry', async () => {
      await apiCall(`/admin/passes/credit/${creditAllocationId}/resume`, {
        method: 'POST',
        token,
        body: JSON.stringify({ note: 'Klient je zpátky.' }),
      });
      const res = await apiCall<{ data: PassItem }>(`/admin/passes/credit/${creditAllocationId}`, {
        token,
      });
      expect(res.data.effectiveStatus).toBe('active');

      const before = await creditBalance();
      const session = await createSession('2034-01-13T09:00:00.000Z');
      await joinSession(session);
      expect(await creditBalance()).toBe(before - 1);
    });

    it('obnovení neposzastavené odmítne (PASS_NOT_SUSPENDED)', async () => {
      const err = await expectFail(`/admin/passes/credit/${creditAllocationId}/resume`, {
        method: 'POST',
        token,
        body: JSON.stringify({ note: 'znovu' }),
      });
      expect(err).toMatch(/PASS_NOT_SUSPENDED/);
    });

    it('pozastavení se zapíše do historie čerpání', async () => {
      const uses = await apiCall<{
        data: Array<{ action: string; note: string | null; creditsDeducted: number }>;
      }>(`/admin/credit-packs/allocation/${creditAllocationId}/uses`, { token });
      const suspendRow = uses.data.find((u) => (u.note ?? '').startsWith('Pozastaveno:'));
      expect(suspendRow).toBeDefined();
      expect(suspendRow?.action).toBe('admin_adjustment');
      expect(suspendRow?.creditsDeducted).toBe(0);
      expect(uses.data.some((u) => (u.note ?? '').startsWith('Obnoveno:'))).toBe(true);
    });
  });

  // ─── 4. Prodloužení platnosti ─────────────────────────────────────────

  describe('Prodloužení platnosti', () => {
    it('kreditové permanentce posune platnost o zadané dny', async () => {
      const before = await apiCall<{ data: PassItem }>(
        `/admin/passes/credit/${creditAllocationId}`,
        { token },
      );
      const beforeUntil = new Date(before.data.validUntil!).getTime();

      await apiCall(`/admin/credit-packs/allocation/${creditAllocationId}/adjust`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ extendDays: 14, note: 'Kompenzace za zrušené lekce.' }),
      });

      const after = await apiCall<{ data: PassItem }>(
        `/admin/passes/credit/${creditAllocationId}`,
        {
          token,
        },
      );
      const afterUntil = new Date(after.data.validUntil!).getTime();
      expect(afterUntil - beforeUntil).toBe(14 * 86400_000);
      // zůstatek se prodloužením nezměnil
      expect(after.data.balanceRemaining).toBe(before.data.balanceRemaining);
    });

    it('permanentka bez expirace prodloužit nejde (NO_EXPIRY_TO_EXTEND)', async () => {
      const tpl = await apiCall<{ data: { id: string } }>('/admin/credit-packs', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Bez expirace', totalCredits: 2, priceHellers: 5000 }),
      });
      const alloc = await apiCall<{ data: { id: string } }>(
        `/admin/customers/${customerId}/credit-packs`,
        { method: 'POST', token, body: JSON.stringify({ creditPackId: tpl.data.id }) },
      );
      const err = await expectFail(`/admin/credit-packs/allocation/${alloc.data.id}/adjust`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ extendDays: 7, note: 'zkouška' }),
      });
      expect(err).toMatch(/NO_EXPIRY_TO_EXTEND/);
    });

    it('bundle permanentce posune platnost i bez změny položky', async () => {
      const tpl = await apiCall<{ data: { id: string } }>('/admin/bundle-packs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Balíček dvou služeb',
          items: [{ serviceId: secondServiceId, quantity: 2 }],
          validityDays: 30,
          priceHellers: 200000,
        }),
      });
      const alloc = await apiCall<{ data: { id: string } }>(
        `/admin/customers/${customerId}/bundle-packs`,
        { method: 'POST', token, body: JSON.stringify({ bundlePackId: tpl.data.id }) },
      );

      const before = await apiCall<{ data: PassItem }>(`/admin/passes/bundle/${alloc.data.id}`, {
        token,
      });
      await apiCall(`/admin/bundle-packs/allocation/${alloc.data.id}/adjust`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ extendDays: 10, note: 'Dárek k narozeninám.' }),
      });
      const after = await apiCall<{ data: PassItem }>(`/admin/passes/bundle/${alloc.data.id}`, {
        token,
      });
      expect(
        new Date(after.data.validUntil!).getTime() - new Date(before.data.validUntil!).getTime(),
      ).toBe(10 * 86400_000);
      // položky zůstaly nedotčené
      expect(after.data.balanceRemaining).toBe(2);
      expect(after.data.balanceLabel).toBe('2 ks z 2');
    });
  });

  // ─── Regrese bodu 8 ───────────────────────────────────────────────────

  describe('Regrese: dobití časového balíčku platného na všechny služby', () => {
    it('adjust projde a do auditu zapíše NULL místo id balíčku', async () => {
      const tpl = await apiCall<{ data: { id: string; allowedServiceIds: string[] } }>(
        '/admin/time-packs',
        {
          method: 'POST',
          token,
          body: JSON.stringify({ name: 'Měsíc neomezeně', durationDays: 30, priceHellers: 120000 }),
        },
      );
      expect(tpl.data.allowedServiceIds).toEqual([]); // platí na všechny služby

      const alloc = await apiCall<{ data: { id: string } }>(
        `/admin/customers/${customerId}/time-packs`,
        { method: 'POST', token, body: JSON.stringify({ timePackId: tpl.data.id }) },
      );

      // Dřív tohle vracelo HTTP 500 (FK violation na time_pack_uses.service_id).
      await apiCall(`/admin/time-packs/allocation/${alloc.data.id}/adjust`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ extendDays: 7, note: 'prodloužení' }),
      });

      const uses = await apiCall<{
        data: Array<{ action: string; serviceId: string | null; note: string | null }>;
      }>(`/admin/time-packs/allocation/${alloc.data.id}/uses`, { token });
      const row = uses.data.find((u) => u.action === 'admin_adjustment');
      expect(row).toBeDefined();
      expect(row?.serviceId).toBeNull();
    });
  });
});
