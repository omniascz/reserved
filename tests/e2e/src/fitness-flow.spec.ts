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

  // ─── 10.9 Dárkové vouchery ────────────────────────────────────────────

  describe('Dárkové vouchery (10.9)', () => {
    let code: string;

    it('vydání poukazu + veřejné ověření', async () => {
      const v = await apiCall<{ data: { id: string; code: string } }>('/admin/vouchers', {
        method: 'POST',
        token,
        body: JSON.stringify({ valueHellers: 50000 }),
      });
      code = v.data.code;

      const look = await apiCall<{
        data: { remainingValueHellers: number; status: string; expired: boolean };
      }>(`/public/${slug}/vouchers/${code}`);
      expect(look.data.remainingValueHellers).toBe(50000);
      expect(look.data.status).toBe('active');
      expect(look.data.expired).toBe(false);
    });

    it('částečné uplatnění + nedostatek + vyčerpání', async () => {
      const r1 = await apiCall<{ data: { remainingValueHellers: number } }>(
        '/admin/vouchers/redeem',
        { method: 'POST', token, body: JSON.stringify({ code, amountHellers: 20000 }) },
      );
      expect(r1.data.remainingValueHellers).toBe(30000);

      const fail = await expectFail('/admin/vouchers/redeem', {
        method: 'POST',
        token,
        body: JSON.stringify({ code, amountHellers: 40000 }),
      });
      expect(fail).toMatch(/INSUFFICIENT_VALUE|400/);

      const r2 = await apiCall<{ data: { remainingValueHellers: number; status: string } }>(
        '/admin/vouchers/redeem',
        { method: 'POST', token, body: JSON.stringify({ code, amountHellers: 30000 }) },
      );
      expect(r2.data.remainingValueHellers).toBe(0);
      expect(r2.data.status).toBe('redeemed');

      const after = await expectFail('/admin/vouchers/redeem', {
        method: 'POST',
        token,
        body: JSON.stringify({ code, amountHellers: 1 }),
      });
      expect(after).toMatch(/VOUCHER_NOT_ACTIVE|400/);
    });

    it('expirovaný poukaz nelze uplatnit', async () => {
      const v = await apiCall<{ data: { code: string } }>('/admin/vouchers', {
        method: 'POST',
        token,
        body: JSON.stringify({ valueHellers: 10000, validUntilIso: '2020-01-01T00:00:00.000Z' }),
      });
      const fail = await expectFail('/admin/vouchers/redeem', {
        method: 'POST',
        token,
        body: JSON.stringify({ code: v.data.code, amountHellers: 100 }),
      });
      expect(fail).toMatch(/VOUCHER_EXPIRED|400/);
    });
  });

  // ─── 10.10 Intake / consent formuláře ─────────────────────────────────

  describe('Intake formuláře (10.10)', () => {
    let formId: string;

    it('vytvoření formuláře + veřejný výpis pro službu', async () => {
      const f = await apiCall<{ data: { id: string } }>('/admin/intake-forms', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Zdravotní dotazník',
          serviceId: groupServiceId,
          fields: [
            { key: 'health', label: 'Zdravotní stav', type: 'textarea', required: true },
            { key: 'consent', label: 'Souhlas s podmínkami', type: 'checkbox', required: true },
          ],
        }),
      });
      formId = f.data.id;

      const list = await apiCall<{ data: Array<{ id: string; fields: unknown[] }> }>(
        `/public/${slug}/intake-forms?serviceId=${groupServiceId}`,
      );
      const form = list.data.find((x) => x.id === formId);
      expect(form).toBeDefined();
      expect(form?.fields.length).toBe(2);
    });

    it('chybějící povinné pole → VALIDATION_ERROR', async () => {
      const fail = await expectFail(`/public/${slug}/intake-forms/${formId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ customerEmail: 'i@fit.local', answers: { health: 'ok' } }),
      });
      expect(fail).toMatch(/VALIDATION_ERROR|400/);
    });

    it('kompletní vyplnění → uloženo a admin vidí odpověď', async () => {
      await apiCall(`/public/${slug}/intake-forms/${formId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          customerEmail: 'i@fit.local',
          answers: { health: 'v pořádku', consent: true },
        }),
      });
      const subs = await apiCall<{ data: unknown[] }>(`/admin/intake-forms/${formId}/submissions`, {
        token,
      });
      expect(subs.data.length).toBe(1);
    });
  });

  // ─── 10.11 Vertikálové presety ────────────────────────────────────────

  describe('Vertikálové presety (10.11)', () => {
    it('katalog presetů obsahuje obory', async () => {
      const res = await apiCall<{ data: Array<{ id: string }> }>('/admin/vertical-presets', {
        token,
      });
      const ids = res.data.map((p) => p.id);
      expect(res.data.length).toBe(5);
      expect(ids).toContain('tennis_courts');
      expect(ids).toContain('medical_clinic');
    });

    it('aplikace presetu vytvoří služby + zdroje, podruhé je přeskočí (idempotence)', async () => {
      const r1 = await apiCall<{ data: { servicesCreated: number; resourcesCreated: number } }>(
        '/admin/vertical-presets/tennis_courts/apply',
        { method: 'POST', token },
      );
      expect(r1.data.servicesCreated).toBe(1);
      expect(r1.data.resourcesCreated).toBe(3);

      const svcs = await apiCall<{ data: Array<{ name: string }> }>('/admin/services', { token });
      expect(svcs.data.some((s) => s.name === 'Rezervace kurtu')).toBe(true);
      const res = await apiCall<{ data: Array<{ name: string }> }>('/admin/resources', { token });
      expect(res.data.some((r) => r.name === 'Kurt 1')).toBe(true);

      const r2 = await apiCall<{
        data: { servicesCreated: number; servicesSkipped: number; resourcesCreated: number };
      }>('/admin/vertical-presets/tennis_courts/apply', { method: 'POST', token });
      expect(r2.data.servicesCreated).toBe(0);
      expect(r2.data.servicesSkipped).toBe(1);
      expect(r2.data.resourcesCreated).toBe(0);
    });

    it('medical preset vytvoří i intake formulář', async () => {
      const r = await apiCall<{ data: { formsCreated: number } }>(
        '/admin/vertical-presets/medical_clinic/apply',
        { method: 'POST', token },
      );
      expect(r.data.formsCreated).toBe(1);
      const forms = await apiCall<{ data: Array<{ name: string }> }>('/admin/intake-forms', {
        token,
      });
      expect(forms.data.some((f) => f.name === 'Vstupní zdravotní dotazník')).toBe(true);
    });
  });

  // ─── 10.12 Permanentky na lekcích ─────────────────────────────────────
  describe('Permanentky na lekcích (10.12)', () => {
    const packEmail = 'pack-tester@fit.local';
    let packId: string;
    let allocId: string;
    let custId: string;
    let sessionA: string;
    let bookingA: string;

    it('založí kreditovou permanentku (per_visit) pro skupinovou službu', async () => {
      const pack = await apiCall<{ data: { id: string } }>('/admin/credit-packs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: '5× skupinová lekce',
          mode: 'per_visit',
          totalCredits: 5,
          priceHellers: 200000,
          allowedServiceIds: [groupServiceId],
        }),
      });
      packId = pack.data.id;
      expect(packId).toBeTruthy();
    });

    it('po přihlášení vznikne klient; přidělení permanentky dá plný kredit', async () => {
      // Přihlášení vytvoří zákazníka (zatím bez permanentky → bez odečtu).
      const seed = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          startsAt: '2032-01-05T10:00:00.000Z',
          capacity: 5,
        }),
      });
      await apiCall(`/public/${slug}/class-sessions/${seed.data.id}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'Pack Tester', customerEmail: packEmail }),
      });

      const custs = await apiCall<{ data: Array<{ id: string; email: string }> }>(
        '/admin/customers',
        { token },
      );
      custId = custs.data.find((c) => c.email.toLowerCase() === packEmail)!.id;

      const alloc = await apiCall<{ data: { id: string; creditsRemaining: number } }>(
        `/admin/customers/${custId}/credit-packs`,
        { method: 'POST', token, body: JSON.stringify({ creditPackId: packId }) },
      );
      allocId = alloc.data.id;
      expect(alloc.data.creditsRemaining).toBe(5);
    });

    it('přihlášení na lekci odečte 1 kredit z permanentky', async () => {
      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          startsAt: '2032-01-06T10:00:00.000Z',
          capacity: 5,
        }),
      });
      sessionA = s.data.id;
      const j = await apiCall<{ data: { id: string } }>(
        `/public/${slug}/class-sessions/${sessionA}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ customerName: 'Pack Tester', customerEmail: packEmail }),
        },
      );
      bookingA = j.data.id;

      const list = await apiCall<{ data: Array<{ id: string; creditsRemaining: number }> }>(
        `/admin/customers/${custId}/credit-packs`,
        { token },
      );
      expect(list.data.find((x) => x.id === allocId)?.creditsRemaining).toBe(4);
    });

    it('odhlášení z lekce vrátí kredit zpět', async () => {
      await apiCall(`/admin/class-sessions/${sessionA}/participants/${bookingA}/leave`, {
        method: 'POST',
        token,
      });
      const list = await apiCall<{ data: Array<{ id: string; creditsRemaining: number }> }>(
        `/admin/customers/${custId}/credit-packs`,
        { token },
      );
      expect(list.data.find((x) => x.id === allocId)?.creditsRemaining).toBe(5);
    });
  });

  // ─── 10.13 Smart vrstva — potvrzení účasti ────────────────────────────
  describe('Smart vrstva — potvrzení účasti (10.13)', () => {
    // Blízká budoucnost (v hodinách od teď) — kvůli oknu withinHours.
    const hin = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let confirmBookingId: string;
    let confirmToken: string;
    let declineSessionId: string;
    let declineToken: string;
    let riskyUpcomingBookingId: string;

    async function newSession(startsAt: string, capacity: number): Promise<string> {
      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({ serviceId: groupServiceId, startsAt, capacity }),
      });
      return s.data.id;
    }
    async function join(sessionId: string, name: string, emailAddr: string): Promise<string> {
      const j = await apiCall<{ data: { id: string } }>(
        `/public/${slug}/class-sessions/${sessionId}/join`,
        { method: 'POST', body: JSON.stringify({ customerName: name, customerEmail: emailAddr }) },
      );
      return j.data.id;
    }

    it('admin vyžádá potvrzení účasti → vznikne jednorázový token', async () => {
      const sessionId = await newSession(hin(3), 5);
      confirmBookingId = await join(sessionId, 'Smart Confirm', 'smart-confirm@fit.local');
      const r = await apiCall<{ data: { confirmationToken: string; scheduledAt: string } }>(
        `/admin/smart/bookings/${confirmBookingId}/request-confirmation`,
        { method: 'POST', token, body: JSON.stringify({ channel: 'email' }) },
      );
      confirmToken = r.data.confirmationToken;
      expect(confirmToken).toMatch(UUID_RE);
      expect(new Date(r.data.scheduledAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('klient potvrdí účast přes veřejný odkaz; token je jednorázový', async () => {
      const r = await apiCall<{ data: { status: string; freedSpot: boolean } }>(
        `/public/${slug}/confirm/${confirmToken}`,
        { method: 'POST', body: JSON.stringify({ action: 'confirm' }) },
      );
      expect(r.data.status).toBe('confirmed');
      expect(r.data.freedSpot).toBe(false);

      const reuse = await expectFail(`/public/${slug}/confirm/${confirmToken}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'confirm' }),
      });
      expect(reuse).toMatch(/INVALID_OR_USED_TOKEN|404/);
    });

    it('odmítnutí účasti uvolní místo v lekci', async () => {
      // Skupinová lekce musí mít kapacitu ≥ 2 → naplníme ji dvěma účastníky.
      declineSessionId = await newSession(hin(4), 2);
      const bookingId = await join(declineSessionId, 'Decliner', 'decliner@fit.local');
      await join(declineSessionId, 'Filler', 'filler@fit.local');

      // Lekce je plná (2/2) → zmizí z veřejného výpisu volných.
      const before = await apiCall<{ data: Array<{ id: string }> }>(
        `/public/${slug}/class-sessions?serviceId=${groupServiceId}`,
      );
      expect(before.data.some((x) => x.id === declineSessionId)).toBe(false);

      const req = await apiCall<{ data: { confirmationToken: string } }>(
        `/admin/smart/bookings/${bookingId}/request-confirmation`,
        { method: 'POST', token, body: JSON.stringify({ channel: 'email' }) },
      );
      declineToken = req.data.confirmationToken;

      const resp = await apiCall<{ data: { status: string; freedSpot: boolean } }>(
        `/public/${slug}/confirm/${declineToken}`,
        { method: 'POST', body: JSON.stringify({ action: 'decline' }) },
      );
      expect(resp.data.status).toBe('declined');
      expect(resp.data.freedSpot).toBe(true);

      // Místo se uvolnilo → lekce je zase ve výpisu s 1 volným místem (1/2).
      const after = await apiCall<{ data: Array<{ id: string; freeSpots: number }> }>(
        `/public/${slug}/class-sessions?serviceId=${groupServiceId}`,
      );
      expect(after.data.find((x) => x.id === declineSessionId)?.freeSpots).toBe(1);
    });

    it('rizikový klient (no-show historie) se objeví v at-risk a dostane hromadnou výzvu', async () => {
      // Vytvoř no-show historii: klient se přihlásí a admin ho označí jako no-show.
      const pastish = await newSession(hin(1), 5);
      const b1 = await join(pastish, 'Risky One', 'risky@fit.local');
      await apiCall(`/admin/bookings/${b1}/mark-no-show`, { method: 'POST', token });

      // Nadcházející rezervace stejného klienta → vysoké riziko.
      const future = await newSession(hin(6), 5);
      riskyUpcomingBookingId = await join(future, 'Risky One', 'risky@fit.local');

      const at = await apiCall<{
        data: Array<{ bookingId: string; risk: { level: string } }>;
      }>('/admin/smart/at-risk?withinHours=24', { token });
      const found = at.data.find((x) => x.bookingId === riskyUpcomingBookingId);
      expect(found).toBeDefined();
      expect(found?.risk.level).toBe('high');

      // Hromadná výzva jen pro vysoké riziko → zachytí naši nadcházející rezervaci.
      const bulk = await apiCall<{ data: { requested: number; scanned: number } }>(
        '/admin/smart/request-confirmations',
        {
          method: 'POST',
          token,
          body: JSON.stringify({ withinHours: 24, minLevel: 'high', channel: 'email' }),
        },
      );
      expect(bulk.data.requested).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 10.14 Série opakovaných 1:1 + auto-video + iCal feed ─────────────
  describe('Série + iCal (10.14)', () => {
    let oneOnOneServiceId: string;
    let employeeId: string;
    let seriesAId: string;
    // Blízká budoucnost (do 180denního okna iCal feedu), ať feed termíny obsahuje.
    const SERIES_START = new Date(Date.now() + 3 * 86_400_000).toISOString();

    it('příprava: online 1:1 služba + zaměstnanec + provider Jitsi', async () => {
      const svc = await apiCall<{ data: { id: string; capacity: number } }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Online konzultace 1:1',
          durationMinutes: 50,
          priceHellers: 80000,
          archetype: 'osobni_1_1',
          isOnline: true,
        }),
      });
      expect(svc.data.capacity).toBe(1);
      oneOnOneServiceId = svc.data.id;

      const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Tomáš', lastName: 'Trenér' }),
      });
      employeeId = emp.data.id;

      const meeting = await apiCall<{ data: { provider: string } }>('/admin/settings/meeting', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ provider: 'jitsi' }),
      });
      expect(meeting.data.provider).toBe('jitsi');
    });

    it('vytvoří týdenní sérii 4 termínů s automatickým video odkazem (Jitsi)', async () => {
      const r = await apiCall<{
        data: {
          seriesId: string;
          created: number;
          skipped: number;
          bookings: Array<{ id: string; onlineMeetingUrl: string | null }>;
        };
      }>('/admin/booking-series', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: oneOnOneServiceId,
          employeeId,
          customerName: 'Klient Série',
          customerEmail: 'serie@fit.local',
          startsAt: SERIES_START,
          frequency: 'weekly',
          occurrences: 4,
        }),
      });
      expect(r.data.created).toBe(4);
      expect(r.data.skipped).toBe(0);
      seriesAId = r.data.seriesId;
      // Každý termín online služby dostal vlastní Jitsi místnost.
      for (const b of r.data.bookings) {
        expect(b.onlineMeetingUrl).toMatch(/^https:\/\/meet\.jit\.si\//);
      }
    });

    it('detail série vrátí všechny termíny', async () => {
      const r = await apiCall<{ data: { bookings: Array<{ id: string; status: string }> } }>(
        `/admin/booking-series/${seriesAId}`,
        { token },
      );
      expect(r.data.bookings).toHaveLength(4);
      expect(r.data.bookings.every((b) => b.status === 'confirmed')).toBe(true);
    });

    it('kolizní termíny stejného trenéra se přeskočí', async () => {
      // Stejný trenér + stejné časy jako série A → všechny výskyty kolidují.
      const r = await apiCall<{ data: { created: number; skipped: number } }>(
        '/admin/booking-series',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            serviceId: oneOnOneServiceId,
            employeeId,
            customerName: 'Klient Kolize',
            customerEmail: 'kolize@fit.local',
            startsAt: SERIES_START,
            frequency: 'weekly',
            occurrences: 3,
          }),
        },
      );
      expect(r.data.created).toBe(0);
      expect(r.data.skipped).toBe(3);
    });

    it('iCal feed vrací termíny zaměstnance (Outlook/Apple/Google)', async () => {
      const urlRes = await apiCall<{ data: { url: string; token: string } }>(
        `/admin/ical/url?employeeId=${employeeId}`,
        { token },
      );
      expect(urlRes.data.url).toContain('/ical/');

      // Stáhni feed přímo (text/calendar, ne JSON).
      const feed = await fetch(urlRes.data.url);
      expect(feed.headers.get('content-type')).toMatch(/text\/calendar/);
      const ics = await feed.text();
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toMatch(/meet\.jit\.si/);

      // Neplatný token → 404.
      const bad = await fetch(`${API_URL}/public/${slug}/ical/invalid.token`);
      expect(bad.status).toBe(404);
    });

    it('zrušení série zruší všechny budoucí termíny', async () => {
      const cancel = await apiCall<{ data: { cancelledBookings: number } }>(
        `/admin/booking-series/${seriesAId}/cancel`,
        { method: 'POST', token },
      );
      expect(cancel.data.cancelledBookings).toBe(4);

      const after = await apiCall<{
        data: { status: string; bookings: Array<{ status: string }> };
      }>(`/admin/booking-series/${seriesAId}`, { token });
      expect(after.data.status).toBe('cancelled');
      expect(after.data.bookings.every((b) => b.status === 'cancelled')).toBe(true);
    });
  });

  // ─── 10.15 Provize / výplaty zaměstnanců (payroll) ────────────────────
  describe('Provize / výplaty (10.15)', () => {
    let payServiceId: string;
    let payEmployeeId: string;
    const FROM = '2034-01-01T00:00:00.000Z';
    const TO = '2034-02-01T00:00:00.000Z';

    async function createCompletedBooking(startsAt: string): Promise<void> {
      const b = await apiCall<{ data: { id: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: payServiceId,
          employeeId: payEmployeeId,
          customerName: 'Klient Masáž',
          customerEmail: 'masaz@fit.local',
          startsAt,
          skipEmail: true,
        }),
      });
      await apiCall(`/admin/bookings/${b.data.id}/mark-completed`, { method: 'POST', token });
    }

    it('příprava: 1:1 služba (1000 Kč) + zaměstnanec + výchozí provize 40 %', async () => {
      const svc = await apiCall<{ data: { id: string } }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Masáž 1:1',
          durationMinutes: 60,
          priceHellers: 100000, // 1000 Kč
          archetype: 'osobni_1_1',
        }),
      });
      payServiceId = svc.data.id;

      const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Pavla', lastName: 'Masérka' }),
      });
      payEmployeeId = emp.data.id;

      const rule = await apiCall<{ data: { commissionPercent: number } }>(
        `/admin/payroll/employees/${payEmployeeId}/commissions`,
        { method: 'POST', token, body: JSON.stringify({ commissionPercent: 40 }) },
      );
      expect(rule.data.commissionPercent).toBe(40);
    });

    it('report sečte provizi z dokončených rezervací (2× 1000 Kč × 40 % = 800 Kč)', async () => {
      await createCompletedBooking('2034-01-10T10:00:00.000Z');
      await createCompletedBooking('2034-01-11T10:00:00.000Z');

      const r = await apiCall<{
        data: {
          lines: Array<{
            employeeId: string;
            bookingsCount: number;
            grossHellers: number;
            commissionHellers: number;
          }>;
          totals: { commissionHellers: number; grossHellers: number };
        };
      }>(`/admin/payroll/report?from=${FROM}&to=${TO}&employeeId=${payEmployeeId}`, { token });

      const line = r.data.lines.find((l) => l.employeeId === payEmployeeId);
      expect(line?.bookingsCount).toBe(2);
      expect(line?.grossHellers).toBe(200000);
      expect(line?.commissionHellers).toBe(80000); // 40 % z 2000 Kč
      expect(r.data.totals.commissionHellers).toBe(80000);
    });

    it('override provize pro službu má přednost (50 %)', async () => {
      await apiCall(`/admin/payroll/employees/${payEmployeeId}/commissions`, {
        method: 'POST',
        token,
        body: JSON.stringify({ serviceId: payServiceId, commissionPercent: 50 }),
      });

      const r = await apiCall<{
        data: { lines: Array<{ employeeId: string; commissionHellers: number }> };
      }>(`/admin/payroll/report?from=${FROM}&to=${TO}&employeeId=${payEmployeeId}`, { token });
      const line = r.data.lines.find((l) => l.employeeId === payEmployeeId);
      expect(line?.commissionHellers).toBe(100000); // 50 % z 2000 Kč
    });
  });

  // ─── 10.16 On-demand video / knihovna obsahu ──────────────────────────
  describe('Knihovna obsahu (10.16)', () => {
    let publicItemId: string;
    let subItemId: string;

    it('admin založí obsah s různou úrovní přístupu', async () => {
      const pub = await apiCall<{ data: { id: string } }>('/admin/content', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: 'Ukázková lekce zdarma',
          videoUrl: 'https://example.com/free.mp4',
          accessLevel: 'public',
        }),
      });
      publicItemId = pub.data.id;

      await apiCall('/admin/content', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: 'Lekce pro registrované',
          videoUrl: 'https://example.com/members.mp4',
          accessLevel: 'members',
        }),
      });

      const sub = await apiCall<{ data: { id: string } }>('/admin/content', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: 'Prémiová série',
          videoUrl: 'https://example.com/premium.mp4',
          accessLevel: 'subscription',
        }),
      });
      subItemId = sub.data.id;

      const list = await apiCall<{ data: unknown[] }>('/admin/content', { token });
      expect(list.data.length).toBe(3);
    });

    it('veřejný výpis odemkne jen public, ostatní zamkne (skryje URL)', async () => {
      const r = await apiCall<{
        data: Array<{ id: string; accessLevel: string; locked: boolean; videoUrl: string | null }>;
      }>(`/public/${slug}/content`);
      expect(r.data.length).toBe(3);

      const pub = r.data.find((x) => x.id === publicItemId);
      expect(pub?.locked).toBe(false);
      expect(pub?.videoUrl).toBe('https://example.com/free.mp4');

      const sub = r.data.find((x) => x.id === subItemId);
      expect(sub?.locked).toBe(true);
      expect(sub?.videoUrl).toBeNull(); // odkaz skrytý pro neoprávněné

      // members je taky zamčený pro anonymního návštěvníka
      expect(r.data.filter((x) => x.locked).length).toBe(2);
    });

    it('nepublikovaný obsah zmizí z veřejného výpisu', async () => {
      await apiCall(`/admin/content/${subItemId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ isPublished: false }),
      });
      const r = await apiCall<{ data: Array<{ id: string }> }>(`/public/${slug}/content`);
      expect(r.data.some((x) => x.id === subItemId)).toBe(false);
      expect(r.data.length).toBe(2);
    });

    it('smazaný obsah zmizí i z admin výpisu', async () => {
      await apiCall(`/admin/content/${publicItemId}`, { method: 'DELETE', token });
      const list = await apiCall<{ data: Array<{ id: string }> }>('/admin/content', { token });
      expect(list.data.some((x) => x.id === publicItemId)).toBe(false);
    });
  });

  // ─── 10.19 Lehký POS (pultový prodej) ─────────────────────────────────
  describe('Lehký POS (10.19)', () => {
    let productId: string;
    let packTemplateId: string;
    let custId: string;

    it('admin založí produkt se skladem', async () => {
      const p = await apiCall<{ data: { id: string; stock: number } }>('/admin/pos/products', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'Šampon',
          priceHellers: 25000,
          vatRate: 21,
          tracksStock: true,
          stock: 10,
        }),
      });
      productId = p.data.id;
      expect(p.data.stock).toBe(10);
    });

    it('prodej 2 ks za hotovost → účtenka, součet, odečet skladu', async () => {
      const sale = await apiCall<{
        data: { receiptNumber: string; totalHellers: number; paymentMethod: string };
      }>('/admin/pos/sales', {
        method: 'POST',
        token,
        body: JSON.stringify({
          paymentMethod: 'cash',
          items: [{ itemType: 'product', refId: productId, quantity: 2 }],
        }),
      });
      expect(sale.data.receiptNumber).toMatch(/^R-\d{4}-\d{4}$/);
      expect(sale.data.totalHellers).toBe(50000);
      expect(sale.data.paymentMethod).toBe('cash');

      const list = await apiCall<{ data: Array<{ id: string; stock: number }> }>(
        '/admin/pos/products',
        { token },
      );
      expect(list.data.find((x) => x.id === productId)?.stock).toBe(8);
    });

    it('ruční položka (karta ručně)', async () => {
      const sale = await apiCall<{ data: { totalHellers: number } }>('/admin/pos/sales', {
        method: 'POST',
        token,
        body: JSON.stringify({
          paymentMethod: 'card_manual',
          items: [
            {
              itemType: 'manual',
              name: 'Konzultace na míru',
              unitPriceHellers: 30000,
              vatRate: 21,
              quantity: 1,
            },
          ],
        }),
      });
      expect(sale.data.totalHellers).toBe(30000);
    });

    it('prodej nad sklad selže (atomicky, sklad se nemění)', async () => {
      const fail = await expectFail('/admin/pos/sales', {
        method: 'POST',
        token,
        body: JSON.stringify({
          paymentMethod: 'cash',
          items: [{ itemType: 'product', refId: productId, quantity: 100 }],
        }),
      });
      expect(fail).toMatch(/INSUFFICIENT_STOCK|400/);
      const list = await apiCall<{ data: Array<{ id: string; stock: number }> }>(
        '/admin/pos/products',
        { token },
      );
      expect(list.data.find((x) => x.id === productId)?.stock).toBe(8); // beze změny
    });

    it('prodej permanentky → alokace zákazníkovi', async () => {
      const pack = await apiCall<{ data: { id: string } }>('/admin/credit-packs', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: 'POS permanentka 5×',
          mode: 'per_visit',
          totalCredits: 5,
          priceHellers: 150000,
        }),
      });
      packTemplateId = pack.data.id;

      const custs = await apiCall<{ data: Array<{ id: string }> }>('/admin/customers', { token });
      custId = custs.data[0]!.id;

      const sale = await apiCall<{
        data: { totalHellers: number; packAllocationIds: string[] };
      }>('/admin/pos/sales', {
        method: 'POST',
        token,
        body: JSON.stringify({
          paymentMethod: 'voucher',
          customerId: custId,
          items: [{ itemType: 'pack', refId: packTemplateId, quantity: 1 }],
        }),
      });
      expect(sale.data.totalHellers).toBe(150000);
      expect(sale.data.packAllocationIds).toHaveLength(1);

      // Zákazník má novou permanentku.
      const allocs = await apiCall<{ data: Array<{ id: string; creditsRemaining: number }> }>(
        `/admin/customers/${custId}/credit-packs`,
        { token },
      );
      expect(allocs.data.some((a) => a.id === sale.data.packAllocationIds[0])).toBe(true);
    });

    it('uzávěrka sečte tržby dle způsobu platby', async () => {
      const r = await apiCall<{
        data: {
          byMethod: Array<{ paymentMethod: string; count: number; totalHellers: number }>;
          totals: { count: number; totalHellers: number };
        };
      }>('/admin/pos/report?from=2020-01-01T00:00:00.000Z&to=2030-01-01T00:00:00.000Z', { token });
      expect(r.data.totals.count).toBeGreaterThanOrEqual(3);
      const cash = r.data.byMethod.find((m) => m.paymentMethod === 'cash');
      expect(cash?.totalHellers).toBe(50000);
      const voucher = r.data.byMethod.find((m) => m.paymentMethod === 'voucher');
      expect(voucher?.totalHellers).toBe(150000);
    });
  });

  // ─── 10.20 Ochrana proti překryvu lekcí (trenér + pobočka) ────────────
  describe('Překryv lekcí (10.20)', () => {
    let trA: string;
    let trB: string;
    let svc60: string;
    let svc30: string;
    let machineA: string;
    let machineB: string;

    async function mkSession(body: Record<string, unknown>): Promise<string> {
      const s = await apiCall<{ data: { id: string } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      });
      return s.data.id;
    }

    it('příprava: 2 trenéři, 60/30min služby, 2 přístroje', async () => {
      trA = (
        await apiCall<{ data: { id: string } }>('/admin/employees', {
          method: 'POST',
          token,
          body: JSON.stringify({ firstName: 'Trenér', lastName: 'Alfa', branchIds: [branchId] }),
        })
      ).data.id;
      trB = (
        await apiCall<{ data: { id: string } }>('/admin/employees', {
          method: 'POST',
          token,
          body: JSON.stringify({ firstName: 'Trenér', lastName: 'Beta', branchIds: [branchId] }),
        })
      ).data.id;
      svc60 = (
        await apiCall<{ data: { id: string } }>('/admin/services', {
          method: 'POST',
          token,
          body: JSON.stringify({
            name: 'EMS 60 min',
            durationMinutes: 60,
            priceHellers: 70000,
            archetype: 'skupinova_lekce',
          }),
        })
      ).data.id;
      svc30 = (
        await apiCall<{ data: { id: string } }>('/admin/services', {
          method: 'POST',
          token,
          body: JSON.stringify({
            name: 'EMS 30 min',
            durationMinutes: 30,
            priceHellers: 50000,
            archetype: 'skupinova_lekce',
          }),
        })
      ).data.id;
      machineA = (
        await apiCall<{ data: { id: string } }>('/admin/resources', {
          method: 'POST',
          token,
          body: JSON.stringify({ branchId, name: 'Stroj A', type: 'ems_machine' }),
        })
      ).data.id;
      machineB = (
        await apiCall<{ data: { id: string } }>('/admin/resources', {
          method: 'POST',
          token,
          body: JSON.stringify({ branchId, name: 'Stroj B', type: 'ems_machine' }),
        })
      ).data.id;
      expect(trA).toBeTruthy();
    });

    it('jeden trenér nemůže vést dvě překrývající se lekce (TRAINER_BUSY)', async () => {
      await mkSession({
        serviceId: svc60,
        employeeId: trA,
        capacity: 4,
        startsAt: '2032-05-03T08:00:00.000Z',
      });
      const clash = await expectFail('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc30,
          employeeId: trA,
          capacity: 4,
          startsAt: '2032-05-03T08:30:00.000Z', // překrývá 08:00–09:00
        }),
      });
      expect(clash).toMatch(/TRAINER_BUSY|400/);
    });

    it('jiný trenér smí jet souběžně (dokud není zapnut přepínač pobočky)', async () => {
      const id = await mkSession({
        serviceId: svc30,
        employeeId: trB,
        capacity: 4,
        startsAt: '2032-05-03T08:30:00.000Z',
      });
      expect(id).toBeTruthy();
    });

    it('přepínač pobočky ON → ani jiný trenér nesmí souběžně (BRANCH_BUSY)', async () => {
      await apiCall('/admin/settings/booking', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ oneTrainingPerBranch: true }),
      });
      await mkSession({
        serviceId: svc60,
        employeeId: trA,
        capacity: 4,
        startsAt: '2032-05-03T12:00:00.000Z',
      });
      const clash = await expectFail('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc30,
          employeeId: trB, // jiný trenér, ale stejná pobočka a překryv
          capacity: 4,
          startsAt: '2032-05-03T12:15:00.000Z',
        }),
      });
      expect(clash).toMatch(/BRANCH_BUSY|400/);
    });

    it('regrese: per-přístroj lekce běží paralelně i s přepínačem ON', async () => {
      // EMS na 2 různých strojích ve stejný čas = OK (stroje jedou paralelně).
      const a = await mkSession({
        serviceId: emsServiceId,
        resourceId: machineA,
        startsAt: '2032-05-03T14:00:00.000Z',
      });
      const b = await mkSession({
        serviceId: emsServiceId,
        resourceId: machineB,
        startsAt: '2032-05-03T14:00:00.000Z',
      });
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      // ...ale stejný stroj ve stejný čas znovu = MACHINE_TAKEN.
      const clash = await expectFail('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: emsServiceId,
          resourceId: machineA,
          startsAt: '2032-05-03T14:00:00.000Z',
        }),
      });
      expect(clash).toMatch(/MACHINE_TAKEN|400/);
    });
  });

  // ─── 10.21 Motor 1: více zdrojů na jednu rezervaci ────────────────────
  describe('Více zdrojů na rezervaci (10.21)', () => {
    let svc1: string;
    let e1: string;
    let e2: string;
    let room: string;
    let projector: string;
    let room2: string;
    let bookingA: string;
    const T = '2033-07-01T09:00:00.000Z';
    const T_OVERLAP = '2033-07-01T09:30:00.000Z';

    async function mkEmployee(last: string): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Os', lastName: last, branchIds: [branchId] }),
      });
      return r.data.id;
    }
    async function mkResource(name: string, type: string): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/resources', {
        method: 'POST',
        token,
        body: JSON.stringify({ branchId, name, type }),
      });
      return r.data.id;
    }
    async function book(
      employeeId: string,
      startsAt: string,
      resourceIds: string[],
    ): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc1,
          employeeId,
          customerName: 'Klient Jednání',
          customerEmail: 'jednani@ems.local',
          startsAt,
          skipEmail: true,
          resourceIds,
        }),
      });
      return r.data.id;
    }

    it('příprava: služba, 2 pracovníci, místnost + projektor + 2. místnost', async () => {
      svc1 = (
        await apiCall<{ data: { id: string } }>('/admin/services', {
          method: 'POST',
          token,
          body: JSON.stringify({
            name: 'Jednání 60 min',
            durationMinutes: 60,
            priceHellers: 0,
            archetype: 'osobni_1_1',
          }),
        })
      ).data.id;
      e1 = await mkEmployee('Jedna');
      e2 = await mkEmployee('Dva');
      room = await mkResource('Zasedačka A', 'room');
      projector = await mkResource('Projektor', 'equipment');
      room2 = await mkResource('Zasedačka B', 'room');
      expect(room).toBeTruthy();
    });

    it('rezervace zamkne víc zdrojů naráz (místnost + projektor)', async () => {
      bookingA = await book(e1, T, [room, projector]);
      const res = await apiCall<{ data: Array<{ resourceId: string; status: string }> }>(
        `/admin/bookings/${bookingA}/resources`,
        { token },
      );
      expect(res.data.filter((r) => r.status === 'active')).toHaveLength(2);
    });

    it('jiná rezervace nemůže vzít obsazený zdroj (RESOURCE_BUSY)', async () => {
      // jiný pracovník (žádná kolize osoby), ale stejná místnost v překryvu
      const clashRoom = await expectFail('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc1,
          employeeId: e2,
          customerName: 'X',
          customerEmail: 'x@ems.local',
          startsAt: T_OVERLAP,
          skipEmail: true,
          resourceIds: [room],
        }),
      });
      expect(clashRoom).toMatch(/RESOURCE_BUSY|400/);

      // i samotný projektor je obsazený
      const clashProj = await expectFail('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc1,
          employeeId: e2,
          customerName: 'X',
          customerEmail: 'x@ems.local',
          startsAt: T_OVERLAP,
          skipEmail: true,
          resourceIds: [projector],
        }),
      });
      expect(clashProj).toMatch(/RESOURCE_BUSY|400/);
    });

    it('rezervace s jinými (volnými) zdroji ve stejný čas projde', async () => {
      const id = await book(e2, T_OVERLAP, [room2]); // jiná místnost, jiný pracovník
      expect(id).toBeTruthy();
    });

    it('zrušení rezervace uvolní zdroje → lze je zarezervovat znovu', async () => {
      await apiCall(`/admin/bookings/${bookingA}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: 'test' }),
      });
      // teď je místnost A i projektor volný → nová rezervace projde
      const id = await book(e1, T, [room, projector]);
      expect(id).toBeTruthy();
    });
  });

  // ─── 10.22 Motor 2: pobyt na dny (hotel / půjčovna) ───────────────────
  describe('Pobyt na dny (10.22)', () => {
    let r1: string;
    let r2: string;
    let stay1: string;

    async function mkRoom(name: string): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/resources', {
        method: 'POST',
        token,
        body: JSON.stringify({ branchId, name, type: 'room' }),
      });
      return r.data.id;
    }

    it('příprava: 2 pokoje', async () => {
      r1 = await mkRoom('Pokoj 101');
      r2 = await mkRoom('Pokoj 102');
      expect(r1).toBeTruthy();
    });

    it('rezervace pobytu spočítá noci a cenu', async () => {
      const s = await apiCall<{ data: { id: string; nights: number; totalHellers: number } }>(
        '/admin/stays',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            resourceId: r1,
            customerName: 'Host Novák',
            checkIn: '2033-08-01',
            checkOut: '2033-08-04',
            guests: 2,
            pricePerNightHellers: 200000,
          }),
        },
      );
      expect(s.data.nights).toBe(3);
      expect(s.data.totalHellers).toBe(600000); // 3× 2000 Kč
      stay1 = s.data.id;
    });

    it('dostupnost: obsazený pokoj zmizí, volný zůstane', async () => {
      const av = await apiCall<{ data: Array<{ id: string }> }>(
        '/admin/stays/available?checkIn=2033-08-02&checkOut=2033-08-03',
        { token },
      );
      expect(av.data.some((u) => u.id === r1)).toBe(false); // obsazený
      expect(av.data.some((u) => u.id === r2)).toBe(true); // volný
    });

    it('překrývající se pobyt na stejném pokoji selže (STAY_CONFLICT)', async () => {
      const clash = await expectFail('/admin/stays', {
        method: 'POST',
        token,
        body: JSON.stringify({
          resourceId: r1,
          customerName: 'X',
          checkIn: '2033-08-03',
          checkOut: '2033-08-06',
          pricePerNightHellers: 200000,
        }),
      });
      expect(clash).toMatch(/STAY_CONFLICT|400/);
    });

    it('navazující pobyt (odjezd = příjezd) projde — půlotevřený interval', async () => {
      const s = await apiCall<{ data: { id: string } }>('/admin/stays', {
        method: 'POST',
        token,
        body: JSON.stringify({
          resourceId: r1,
          customerName: 'Host Dva',
          checkIn: '2033-08-04', // = checkout prvního
          checkOut: '2033-08-06',
          pricePerNightHellers: 200000,
        }),
      });
      expect(s.data.id).toBeTruthy();
    });

    it('odjezd před příjezdem → INVALID_DATES', async () => {
      const bad = await expectFail('/admin/stays', {
        method: 'POST',
        token,
        body: JSON.stringify({
          resourceId: r2,
          customerName: 'X',
          checkIn: '2033-08-10',
          checkOut: '2033-08-09',
          pricePerNightHellers: 100000,
        }),
      });
      expect(bad).toMatch(/INVALID_DATES|400/);
    });

    it('zrušení pobytu uvolní pokoj', async () => {
      await apiCall(`/admin/stays/${stay1}/cancel`, { method: 'POST', token });
      const av = await apiCall<{ data: Array<{ id: string }> }>(
        '/admin/stays/available?checkIn=2033-08-02&checkOut=2033-08-03',
        { token },
      );
      expect(av.data.some((u) => u.id === r1)).toBe(true); // zase volný
    });
  });

  // ─── 10.23 Motor 3: řetězená rezervace s uvolnitelnou pauzou ──────────
  describe('Řetězená rezervace (10.23)', () => {
    let svc: string;
    let chair: string;
    let washbasin: string;

    async function mkRes(name: string): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/resources', {
        method: 'POST',
        token,
        body: JSON.stringify({ branchId, name, type: 'equipment' }),
      });
      return r.data.id;
    }
    function chained(startsAt: string, segments: unknown[]) {
      return apiCall<{ data: { id: string } }>('/admin/chained-bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc,
          customerName: 'Klient Barva',
          customerEmail: 'barva@salon.local',
          startsAt,
          segments,
        }),
      });
    }

    it('příprava: služba barvení + křeslo + umyvadlo', async () => {
      svc = (
        await apiCall<{ data: { id: string } }>('/admin/services', {
          method: 'POST',
          token,
          body: JSON.stringify({
            name: 'Barvení vlasů',
            durationMinutes: 90,
            priceHellers: 120000,
            archetype: 'osobni_1_1',
          }),
        })
      ).data.id;
      chair = await mkRes('Křeslo 1');
      washbasin = await mkRes('Umyvadlo 1');
      expect(chair).toBeTruthy();
    });

    it('barvení: křeslo 9:00–9:30, pauza, umyvadlo 9:50–10:05 (každý zdroj jen svůj čas)', async () => {
      const r = await chained('2034-09-01T09:00:00.000Z', [
        { label: 'Aplikace barvy', resourceId: chair, startOffsetMinutes: 0, durationMinutes: 30 },
        { label: 'Mytí', resourceId: washbasin, startOffsetMinutes: 50, durationMinutes: 15 },
      ]);
      const res = await apiCall<{
        data: Array<{ role: string; resourceId: string; startsAt: string; endsAt: string }>;
      }>(`/admin/bookings/${r.data.id}/resources`, { token });
      expect(res.data).toHaveLength(2);
      const chairSeg = res.data.find((x) => x.resourceId === chair)!;
      expect(chairSeg.startsAt).toContain('09:00');
      expect(chairSeg.endsAt).toContain('09:30');
    });

    it('jiný klient vezme křeslo BĚHEM pauzy (9:35) — pauza zdroj uvolnila', async () => {
      const r = await chained('2034-09-01T09:35:00.000Z', [
        { label: 'Aplikace barvy', resourceId: chair, startOffsetMinutes: 0, durationMinutes: 30 },
      ]);
      expect(r.data.id).toBeTruthy(); // křeslo bylo po 9:30 volné → projde
    });

    it('křeslo během 1. fáze (9:15) je obsazené → SEGMENT_CONFLICT', async () => {
      const clash = await expectFail('/admin/chained-bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svc,
          customerName: 'X',
          customerEmail: 'x@salon.local',
          startsAt: '2034-09-01T09:15:00.000Z',
          segments: [
            { label: 'Aplikace', resourceId: chair, startOffsetMinutes: 0, durationMinutes: 30 },
          ],
        }),
      });
      expect(clash).toMatch(/SEGMENT_CONFLICT|400/);
    });
  });

  // ─── 10.24 Motor 4: dispečink zakázek (logistika) ─────────────────────
  describe('Dispečink zakázek (10.24)', () => {
    let van1: string;
    let van2: string;
    let d1: string;
    let d2: string;
    let job1: string;

    async function mkVehicle(name: string): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/resources', {
        method: 'POST',
        token,
        body: JSON.stringify({ branchId, name, type: 'vehicle' }),
      });
      return r.data.id;
    }
    async function mkDriver(last: string): Promise<string> {
      const r = await apiCall<{ data: { id: string } }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Řidič', lastName: last, branchIds: [branchId] }),
      });
      return r.data.id;
    }
    function job(vehicleId: string, driverId: string, startsAt: string) {
      return {
        vehicleId,
        driverId,
        pickupAddress: 'Sklad, Brno',
        dropoffAddress: 'Náměstí, Praha',
        startsAt,
        durationMinutes: 60,
      };
    }

    it('příprava: 2 dodávky, 2 řidiči', async () => {
      van1 = await mkVehicle('Dodávka 1A');
      van2 = await mkVehicle('Dodávka 2B');
      d1 = await mkDriver('Alfa');
      d2 = await mkDriver('Beta');
      expect(van1).toBeTruthy();
    });

    it('naplánuje zakázku (vůz + řidič v okně)', async () => {
      const r = await apiCall<{ data: { id: string; status: string } }>('/admin/dispatch/jobs', {
        method: 'POST',
        token,
        body: JSON.stringify(job(van1, d1, '2034-10-01T09:00:00.000Z')),
      });
      expect(r.data.status).toBe('scheduled');
      job1 = r.data.id;
    });

    it('obsazený vůz → VEHICLE_BUSY (i s jiným řidičem)', async () => {
      const clash = await expectFail('/admin/dispatch/jobs', {
        method: 'POST',
        token,
        body: JSON.stringify(job(van1, d2, '2034-10-01T09:30:00.000Z')),
      });
      expect(clash).toMatch(/VEHICLE_BUSY|400/);
    });

    it('obsazený řidič → DRIVER_BUSY (i s jiným vozem)', async () => {
      const clash = await expectFail('/admin/dispatch/jobs', {
        method: 'POST',
        token,
        body: JSON.stringify(job(van2, d1, '2034-10-01T09:30:00.000Z')),
      });
      expect(clash).toMatch(/DRIVER_BUSY|400/);
    });

    it('nepřekrývající se zakázka projde; po zrušení se vůz uvolní', async () => {
      const later = await apiCall<{ data: { id: string } }>('/admin/dispatch/jobs', {
        method: 'POST',
        token,
        body: JSON.stringify(job(van1, d1, '2034-10-01T11:00:00.000Z')),
      });
      expect(later.data.id).toBeTruthy();

      await apiCall(`/admin/dispatch/jobs/${job1}/cancel`, { method: 'POST', token });
      // teď je vůz v 9:00 volný
      const reuse = await apiCall<{ data: { id: string } }>('/admin/dispatch/jobs', {
        method: 'POST',
        token,
        body: JSON.stringify(job(van1, d2, '2034-10-01T09:00:00.000Z')),
      });
      expect(reuse.data.id).toBeTruthy();
    });
  });
});
