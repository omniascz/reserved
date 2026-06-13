// Sprint 10.0–10.2: E2E full-stack test fitness flow proti běžícímu API.
//
// Ověří kompletní cestu nového tenanta přes reálné HTTP API:
//   1. Registrace tenanta + owner (JWT)
//   2. Archetypy služeb (10.1) — katalog + odvození kapacity
//   3. Skupinová lekce (10.0): vytvoření class_session, veřejný výpis, self-service
//      přihlášení, kapacita, dvojí přihlášení
//   4. EMS (10.2): služba na přístroj, zdroj, EMS lekce, kapacita 1, zámek přístroje
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4000 + DB)

import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api/v1';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `fit-${ts}-${rand}`.slice(0, 32);
}

async function apiCall<T>(
  path: string,
  init?: RequestInit & { token?: string; tenantHeader?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init?.tenantHeader) headers['X-Tenant-ID'] = init.tenantHeader;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(`[${res.status}] ${path}: ${text}`);
  }
  return body as T;
}

/** Očekává, že volání selže; vrátí (status + tělo) chyby pro asserci kódu. */
async function expectFail(
  path: string,
  init?: RequestInit & { token?: string; tenantHeader?: string },
): Promise<string> {
  try {
    await apiCall(path, init);
    throw new Error(`Očekáváno selhání pro ${path}, ale prošlo`);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe('Fitness flow E2E (10.0–10.2)', () => {
  const slug = uniqueSlug();
  const email = `${slug}@e2e.local`;
  const password = 'SecureTestPwd123!';

  let token: string;
  let tenantId: string;
  let branchId: string;
  let groupServiceId: string;
  let groupSessionId: string;
  let emsServiceId: string;
  let resourceId: string;
  let emsSessionId: string;

  beforeAll(async () => {
    const reg = await apiCall<{ tenantId: string; tokens: { accessToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Fit Studio ${slug}`,
          email,
          password,
          firstName: 'Fit',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;
    tenantId = reg.tenantId;

    // Default pobočka (vytvořená při registraci) — pro EMS přístroj.
    const branches = await apiCall<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    branchId = branches.data[0]!.id;
  });

  // ─── 10.1 Archetypy ──────────────────────────────────────────────────

  describe('Archetypy služeb (10.1)', () => {
    it('katalog vrací 5 archetypů', async () => {
      const res = await apiCall<{ data: Array<{ id: string; defaultCapacity: number }> }>(
        '/admin/services/archetypes',
        { token },
      );
      expect(res.data).toHaveLength(5);
      const ids = res.data.map((a) => a.id);
      expect(ids).toContain('skupinova_lekce');
      expect(ids).toContain('ems_pristrojovy');
    });

    it('skupinová služba bez kapacity → odvodí kapacitu z archetypu (>1)', async () => {
      const res = await apiCall<{ data: { id: string; capacity: number; archetype: string } }>(
        '/admin/services',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            name: 'Jóga (skupina)',
            durationMinutes: 60,
            priceHellers: 25000,
            archetype: 'skupinova_lekce',
          }),
        },
      );
      expect(res.data.archetype).toBe('skupinova_lekce');
      expect(res.data.capacity).toBeGreaterThan(1);
      groupServiceId = res.data.id;
    });
  });

  // ─── 10.0 Skupinové lekce ────────────────────────────────────────────

  describe('Skupinové lekce (10.0)', () => {
    it('admin vypíše lekci s kapacitou', async () => {
      const res = await apiCall<{ data: { id: string; capacity: number } }>(
        '/admin/class-sessions',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            serviceId: groupServiceId,
            startsAt: '2031-09-01T10:00:00.000Z',
            capacity: 2, // malá kapacita kvůli testu plnosti
          }),
        },
      );
      expect(res.data.capacity).toBe(2);
      groupSessionId = res.data.id;
    });

    it('veřejný výpis vrací otevřenou lekci s volnými místy', async () => {
      const res = await apiCall<{ data: Array<{ id: string; freeSpots: number }> }>(
        `/public/${slug}/class-sessions?serviceId=${groupServiceId}`,
      );
      const s = res.data.find((x) => x.id === groupSessionId);
      expect(s).toBeDefined();
      expect(s?.freeSpots).toBe(2);
    });

    it('self-service přihlášení (public) funguje a hlídá kapacitu i duplicitu', async () => {
      // 1. místo
      await apiCall(`/public/${slug}/class-sessions/${groupSessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'Anna N', customerEmail: 'anna@fit.local' }),
      });
      // duplicita (i jiná velikost písmen) → ALREADY_JOINED
      const dup = await expectFail(`/public/${slug}/class-sessions/${groupSessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'Anna N', customerEmail: 'ANNA@fit.local' }),
      });
      expect(dup).toMatch(/ALREADY_JOINED|400/);
      // 2. místo
      await apiCall(`/public/${slug}/class-sessions/${groupSessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'Bára D', customerEmail: 'bara@fit.local' }),
      });
      // 3. nad kapacitu → SESSION_FULL
      const full = await expectFail(`/public/${slug}/class-sessions/${groupSessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'Cyril T', customerEmail: 'cyril@fit.local' }),
      });
      expect(full).toMatch(/SESSION_FULL|400/);
    });

    it('plná lekce zmizí z veřejného výpisu', async () => {
      const res = await apiCall<{ data: Array<{ id: string }> }>(
        `/public/${slug}/class-sessions?serviceId=${groupServiceId}`,
      );
      expect(res.data.some((x) => x.id === groupSessionId)).toBe(false);
    });
  });

  // ─── 10.2 EMS ────────────────────────────────────────────────────────

  describe('EMS režim (10.2)', () => {
    it('EMS služba (archetyp ems_pristrojovy) → kapacita 1', async () => {
      const res = await apiCall<{ data: { id: string; capacity: number } }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'EMS trénink',
          durationMinutes: 20,
          priceHellers: 50000,
          archetype: 'ems_pristrojovy',
        }),
      });
      expect(res.data.capacity).toBe(1);
      emsServiceId = res.data.id;
    });

    it('vytvoření přístroje (resource)', async () => {
      const res = await apiCall<{ data: { id: string } }>('/admin/resources', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'EMS přístroj #1', branchId, type: 'ems_machine' }),
      });
      expect(res.data.id).toBeTruthy();
      resourceId = res.data.id;
    });

    it('EMS lekce na přístroji (capacity 1) + zámek přístroje', async () => {
      const res = await apiCall<{ data: { id: string; capacity: number; resourceId: string } }>(
        '/admin/class-sessions',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            serviceId: emsServiceId,
            resourceId,
            startsAt: '2031-09-02T10:00:00.000Z',
          }),
        },
      );
      expect(res.data.capacity).toBe(1);
      expect(res.data.resourceId).toBe(resourceId);
      emsSessionId = res.data.id;

      // Druhá lekce na STEJNÝ přístroj/čas → MACHINE_TAKEN
      const taken = await expectFail('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: emsServiceId,
          resourceId,
          startsAt: '2031-09-02T10:00:00.000Z',
        }),
      });
      expect(taken).toMatch(/MACHINE_TAKEN|400/);
    });

    it('EMS lekce: 1 klient se vejde, druhý ne (kapacita 1)', async () => {
      await apiCall(`/public/${slug}/class-sessions/${emsSessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'EMS Klient', customerEmail: 'ems@fit.local' }),
      });
      const full = await expectFail(`/public/${slug}/class-sessions/${emsSessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'EMS Druhý', customerEmail: 'ems2@fit.local' }),
      });
      expect(full).toMatch(/SESSION_FULL|400/);
    });
  });

  // ─── 10.5 Pořadník / waitlist ─────────────────────────────────────────

  describe('Pořadník / waitlist (10.5)', () => {
    let wlSession: string;
    let p1BookingId: string;

    it('plná lekce → klient se zařadí do pořadníku (pozice 1)', async () => {
      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          startsAt: '2031-11-01T10:00:00.000Z',
          capacity: 2,
        }),
      });
      wlSession = s.data.id;

      const j1 = await apiCall<{ data: { id: string } }>(
        `/public/${slug}/class-sessions/${wlSession}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ customerName: 'P1', customerEmail: 'p1@fit.local' }),
        },
      );
      p1BookingId = j1.data.id;
      await apiCall(`/public/${slug}/class-sessions/${wlSession}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'P2', customerEmail: 'p2@fit.local' }),
      });

      // 3. přímé přihlášení → plno
      const full = await expectFail(`/public/${slug}/class-sessions/${wlSession}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'W3', customerEmail: 'w3@fit.local' }),
      });
      expect(full).toMatch(/SESSION_FULL|400/);

      // pořadník → pozice 1
      const wl = await apiCall<{ data: { position: number; status: string } }>(
        `/public/${slug}/class-sessions/${wlSession}/waitlist`,
        {
          method: 'POST',
          body: JSON.stringify({ customerName: 'W3', customerEmail: 'w3@fit.local' }),
        },
      );
      expect(wl.data.position).toBe(1);
      expect(wl.data.status).toBe('waiting');
    });

    it('pořadník na lekci s volným místem → SESSION_HAS_SPACE', async () => {
      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          startsAt: '2031-11-02T10:00:00.000Z',
          capacity: 2,
        }),
      });
      const r = await expectFail(`/public/${slug}/class-sessions/${s.data.id}/waitlist`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'X', customerEmail: 'x@fit.local' }),
      });
      expect(r).toMatch(/SESSION_HAS_SPACE|400/);
    });

    it('odhlášení účastníka → auto-promote prvního z pořadníku', async () => {
      // P1 odejde → uvolní se místo
      await apiCall(`/admin/class-sessions/${wlSession}/participants/${p1BookingId}/leave`, {
        method: 'POST',
        token,
      });

      // W3 byl povýšen: pořadník je prázdný (status už není 'waiting')
      const wlist = await apiCall<{ data: unknown[] }>(
        `/admin/class-sessions/${wlSession}/waitlist`,
        { token },
      );
      expect(wlist.data.length).toBe(0);

      // lekce je zase plná (W3 zabral uvolněné místo) → není v seznamu volných
      const open = await apiCall<{ data: Array<{ id: string }> }>(
        `/public/${slug}/class-sessions?serviceId=${groupServiceId}`,
      );
      expect(open.data.some((x) => x.id === wlSession)).toBe(false);

      // W3 je teď účastník → další přihlášení = ALREADY_JOINED
      const dup = await expectFail(`/public/${slug}/class-sessions/${wlSession}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'W3', customerEmail: 'w3@fit.local' }),
      });
      expect(dup).toMatch(/ALREADY_JOINED|400/);
    });
  });

  // ─── 10.6 Recenze ─────────────────────────────────────────────────────

  describe('Recenze (10.6)', () => {
    let revBookingId: string;
    let reviewId: string;
    const revEmail = 'rev@fit.local';

    it('odeslání recenze k rezervaci (ověřené e-mailem)', async () => {
      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          startsAt: '2031-12-01T10:00:00.000Z',
          capacity: 5,
        }),
      });
      const j = await apiCall<{ data: { id: string } }>(
        `/public/${slug}/class-sessions/${s.data.id}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ customerName: 'Rev Klient', customerEmail: revEmail }),
        },
      );
      revBookingId = j.data.id;

      const rev = await apiCall<{ data: { id: string; rating: number } }>(
        `/public/${slug}/reviews`,
        {
          method: 'POST',
          body: JSON.stringify({
            bookingId: revBookingId,
            customerEmail: revEmail,
            rating: 5,
            comment: 'Super!',
          }),
        },
      );
      expect(rev.data.rating).toBe(5);
      reviewId = rev.data.id;
    });

    it('špatný e-mail → EMAIL_MISMATCH; duplicita → ALREADY_REVIEWED', async () => {
      const wrong = await expectFail(`/public/${slug}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          bookingId: revBookingId,
          customerEmail: 'kdokoli@fit.local',
          rating: 1,
        }),
      });
      expect(wrong).toMatch(/EMAIL_MISMATCH|403|400/);

      const dupe = await expectFail(`/public/${slug}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ bookingId: revBookingId, customerEmail: revEmail, rating: 4 }),
      });
      expect(dupe).toMatch(/ALREADY_REVIEWED|400/);
    });

    it('veřejný průměr služby zahrnuje publikovanou recenzi', async () => {
      const res = await apiCall<{ data: { aggregate: { count: number; avg: number } } }>(
        `/public/${slug}/reviews?serviceId=${groupServiceId}`,
      );
      expect(res.data.aggregate.count).toBeGreaterThanOrEqual(1);
      expect(res.data.aggregate.avg).toBeGreaterThanOrEqual(1);
    });

    it('admin skryje recenzi → zmizí z veřejného průměru', async () => {
      await apiCall(`/admin/reviews/${reviewId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status: 'hidden' }),
      });
      const res = await apiCall<{ data: { aggregate: { count: number }; items: unknown[] } }>(
        `/public/${slug}/reviews?serviceId=${groupServiceId}`,
      );
      expect(res.data.aggregate.count).toBe(0);
      expect(res.data.items.length).toBe(0);
    });
  });

  // ─── 10.7 Marketingové kampaně + win-back ─────────────────────────────

  describe('Marketingové kampaně (10.7)', () => {
    async function customerIdByEmail(emailAddr: string): Promise<string> {
      const res = await apiCall<{ data: Array<{ id: string; email: string }> }>(
        '/admin/customers',
        { token },
      );
      const c = res.data.find((x) => x.email.toLowerCase() === emailAddr.toLowerCase());
      if (!c) throw new Error(`zákazník ${emailAddr} nenalezen`);
      return c.id;
    }

    it('cílí jen na zákazníky s marketingovým souhlasem (GDPR)', async () => {
      // Souhlas dáme 2 zákazníkům: Anna (má aktivní rezervaci) + P1 (jen zrušenou → neaktivní).
      const annaId = await customerIdByEmail('anna@fit.local');
      const p1Id = await customerIdByEmail('p1@fit.local');
      await apiCall(`/admin/customers/${annaId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ marketingOptIn: true }),
      });
      await apiCall(`/admin/customers/${p1Id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ marketingOptIn: true }),
      });

      const camp = await apiCall<{ data: { id: string } }>('/admin/campaigns', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Jarní akce',
          channel: 'email',
          subject: 'Sleva 20 %',
          body: 'Přijď na lekci se slevou!',
          audience: { type: 'all_optin' },
        }),
      });

      const aud = await apiCall<{ data: { count: number } }>(
        `/admin/campaigns/${camp.data.id}/audience`,
        { token },
      );
      expect(aud.data.count).toBe(2); // jen 2 s opt-in (ne ostatní zákazníci)

      const sent = await apiCall<{ data: { sentCount: number } }>(
        `/admin/campaigns/${camp.data.id}/send`,
        { method: 'POST', token },
      );
      expect(sent.data.sentCount).toBe(2);
    });

    it('win-back (inactive_days) cílí jen na klienty bez aktivní rezervace', async () => {
      // P1 má jen zrušenou rezervaci → je „neaktivní"; Anna má aktivní → vynechána.
      const camp = await apiCall<{ data: { id: string } }>('/admin/campaigns', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Chybíš nám',
          channel: 'email',
          subject: 'Dlouho jsme tě neviděli',
          body: 'Vrať se k nám :)',
          audience: { type: 'inactive_days', days: 3650 },
        }),
      });
      const aud = await apiCall<{ data: { count: number; sample: Array<{ contact: string }> } }>(
        `/admin/campaigns/${camp.data.id}/audience`,
        { token },
      );
      expect(aud.data.count).toBe(1);
      expect(aud.data.sample[0]?.contact).toBe('p1@fit.local');
    });
  });

  // ─── 10.8 Věrnostní body ──────────────────────────────────────────────

  describe('Věrnostní body (10.8)', () => {
    let loyCustomerId: string;
    let loyBookingId: string;

    it('body se připíšou za dokončenou rezervaci dle nastavení', async () => {
      await apiCall('/admin/settings/loyalty', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enabled: true, pointsPerCompletedBooking: 10 }),
      });

      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          startsAt: '2032-01-01T10:00:00.000Z',
          capacity: 5,
        }),
      });
      const j = await apiCall<{ data: { id: string } }>(
        `/public/${slug}/class-sessions/${s.data.id}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ customerName: 'Loy Klient', customerEmail: 'loy@fit.local' }),
        },
      );
      loyBookingId = j.data.id;

      const custs = await apiCall<{ data: Array<{ id: string; email: string }> }>(
        '/admin/customers',
        { token },
      );
      loyCustomerId = custs.data.find((c) => c.email.toLowerCase() === 'loy@fit.local')!.id;

      await apiCall(`/admin/bookings/${loyBookingId}/mark-completed`, { method: 'POST', token });

      const loy = await apiCall<{ data: { balance: number } }>(
        `/admin/customers/${loyCustomerId}/loyalty`,
        { token },
      );
      expect(loy.data.balance).toBe(10);
    });

    it('uplatnění bodů + kontrola nedostatku', async () => {
      const r = await apiCall<{ data: { balance: number } }>(
        `/admin/customers/${loyCustomerId}/loyalty/redeem`,
        { method: 'POST', token, body: JSON.stringify({ points: 5 }) },
      );
      expect(r.data.balance).toBe(5);

      const fail = await expectFail(`/admin/customers/${loyCustomerId}/loyalty/redeem`, {
        method: 'POST',
        token,
        body: JSON.stringify({ points: 100 }),
      });
      expect(fail).toMatch(/INSUFFICIENT_POINTS|400/);
    });

    it('ruční korekce bodů adminem', async () => {
      const r = await apiCall<{ data: { balance: number } }>(
        `/admin/customers/${loyCustomerId}/loyalty/adjust`,
        { method: 'POST', token, body: JSON.stringify({ points: 20, note: 'bonus' }) },
      );
      expect(r.data.balance).toBe(25);
    });
  });
});
