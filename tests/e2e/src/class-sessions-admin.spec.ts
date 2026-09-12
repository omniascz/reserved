// Fáze UI 1 — admin správa skupinových lekcí proti běžícímu API.
//
// Pokrývá tři doplněné endpointy:
//   1. GET  /admin/class-sessions?status=&recurrenceId=
//   2. PATCH /admin/class-sessions/:id (vč. všech odmítnutí a posunu účastníků)
//   3. GET  /admin/class-sessions/recurrences
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4010 + DB)

import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `cls-${ts}-${rand}`.slice(0, 32);
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

/** Očekává selhání; vrátí text chyby pro asserci kódu. */
async function expectFail(path: string, init?: RequestInit & { token?: string }): Promise<string> {
  try {
    await apiCall(path, init);
    throw new Error(`Očekáváno selhání pro ${path}, ale prošlo`);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

interface SessionRow {
  id: string;
  capacity: number;
  bookedCount: number;
  status: string;
  startsAt: string;
  endsAt: string;
  employeeId: string | null;
  resourceId: string | null;
  minAge: number | null;
  recurrenceId: string | null;
}

describe('Admin správa skupinových lekcí (UI 1)', () => {
  const slug = uniqueSlug();
  const email = `${slug}@e2e.local`;
  const password = 'SecureTestPwd123!';

  let token: string;
  let branchId: string;
  let groupServiceId: string;
  let emsServiceId: string;
  let employeeId: string;
  let resourceA: string;
  let resourceB: string;

  beforeAll(async () => {
    const reg = await apiCall<{ tenantId: string; tokens: { accessToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Class Studio ${slug}`,
          email,
          password,
          firstName: 'Class',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;

    const branches = await apiCall<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    branchId = branches.data[0]!.id;

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

    const ems = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'EMS trénink',
        durationMinutes: 20,
        priceHellers: 50000,
        archetype: 'ems_pristrojovy',
      }),
    });
    emsServiceId = ems.data.id;

    const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({ firstName: 'Marek', lastName: 'Trenér' }),
    });
    employeeId = emp.data.id;

    const rA = await apiCall<{ data: { id: string } }>('/admin/resources', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'EMS #1', branchId, type: 'ems_machine' }),
    });
    resourceA = rA.data.id;
    const rB = await apiCall<{ data: { id: string } }>('/admin/resources', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'EMS #2', branchId, type: 'ems_machine' }),
    });
    resourceB = rB.data.id;
  });

  async function createSession(body: Record<string, unknown>): Promise<SessionRow> {
    const res = await apiCall<{ data: SessionRow }>('/admin/class-sessions', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
    return res.data;
  }

  async function listSessions(qs: string): Promise<SessionRow[]> {
    const res = await apiCall<{ data: SessionRow[] }>(`/admin/class-sessions${qs}`, { token });
    return res.data;
  }

  // ─── 1. Filtr status + recurrenceId ──────────────────────────────────

  describe('GET /admin/class-sessions — status a recurrenceId', () => {
    let openSession: string;
    let fullSession: string;
    let cancelledSession: string;

    it('výchozí chování zůstává: otevřené a nezaplněné', async () => {
      const s = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-03-01T09:00:00.000Z',
        capacity: 3,
      });
      openSession = s.id;

      const list = await listSessions(`?serviceId=${groupServiceId}`);
      expect(list.some((x) => x.id === openSession)).toBe(true);
    });

    it('plná lekce z výchozího výpisu zmizí, ale status=full ji vrátí', async () => {
      const s = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-03-01T12:00:00.000Z',
        capacity: 2,
      });
      fullSession = s.id;

      for (const [n, mail] of [
        ['Anna A', 'anna@cls.local'],
        ['Bára B', 'bara@cls.local'],
      ] as const) {
        await apiCall(`/admin/class-sessions/${fullSession}/join`, {
          method: 'POST',
          token,
          body: JSON.stringify({ customerName: n, customerEmail: mail }),
        });
      }

      const def = await listSessions(`?serviceId=${groupServiceId}`);
      expect(def.some((x) => x.id === fullSession)).toBe(false);

      const full = await listSessions(`?serviceId=${groupServiceId}&status=full`);
      const row = full.find((x) => x.id === fullSession);
      expect(row).toBeDefined();
      expect(row?.bookedCount).toBe(row?.capacity);

      // status=full nesmí vracet lekce s volným místem
      expect(full.some((x) => x.id === openSession)).toBe(false);
    });

    it('status=cancelled vrací zrušenou lekci, status=all vrací všechno', async () => {
      const s = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-03-02T09:00:00.000Z',
        capacity: 4,
      });
      cancelledSession = s.id;
      await apiCall(`/admin/class-sessions/${cancelledSession}/cancel`, { method: 'POST', token });

      const cancelled = await listSessions(`?serviceId=${groupServiceId}&status=cancelled`);
      expect(cancelled.some((x) => x.id === cancelledSession)).toBe(true);
      expect(cancelled.every((x) => x.status === 'cancelled')).toBe(true);

      const all = await listSessions(`?serviceId=${groupServiceId}&status=all`);
      const ids = all.map((x) => x.id);
      expect(ids).toContain(openSession);
      expect(ids).toContain(fullSession);
      expect(ids).toContain(cancelledSession);
    });

    it('neplatný status odmítne Zod', async () => {
      const err = await expectFail(`/admin/class-sessions?status=nonsense`, { token });
      expect(err).toMatch(/VALIDATION_FAILED|400/);
    });
  });

  // ─── 2. PATCH ────────────────────────────────────────────────────────

  describe('PATCH /admin/class-sessions/:id', () => {
    it('posune čas lekce a s ním i rezervace účastníků', async () => {
      const session = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-04-05T09:00:00.000Z',
        capacity: 3,
      });
      const join = await apiCall<{ data: { id: string; startsAt: string } }>(
        `/admin/class-sessions/${session.id}/join`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({ customerName: 'Cyril C', customerEmail: 'cyril@cls.local' }),
        },
      );
      expect(new Date(join.data.startsAt).toISOString()).toBe('2032-04-05T09:00:00.000Z');

      const patched = await apiCall<{ data: SessionRow }>(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ startsAt: '2032-04-05T17:30:00.000Z' }),
      });
      expect(new Date(patched.data.startsAt).toISOString()).toBe('2032-04-05T17:30:00.000Z');
      // konec se přepočítal z délky služby (60 min)
      expect(new Date(patched.data.endsAt).toISOString()).toBe('2032-04-05T18:30:00.000Z');

      // klíčová kontrola: rezervace účastníka se posunula taky
      const booking = await apiCall<{ data: { startsAt: string; endsAt: string } }>(
        `/admin/bookings/${join.data.id}`,
        { token },
      );
      expect(new Date(booking.data.startsAt).toISOString()).toBe('2032-04-05T17:30:00.000Z');
      expect(new Date(booking.data.endsAt).toISOString()).toBe('2032-04-05T18:30:00.000Z');
    });

    it('změní kapacitu, věkové omezení a trenéra', async () => {
      const session = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-04-06T09:00:00.000Z',
        capacity: 3,
      });
      const res = await apiCall<{ data: SessionRow }>(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ capacity: 8, minAge: 15, employeeId }),
      });
      expect(res.data.capacity).toBe(8);
      expect(res.data.minAge).toBe(15);
      expect(res.data.employeeId).toBe(employeeId);
    });

    it('ODMÍTNE snížení kapacity pod počet přihlášených', async () => {
      const session = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-04-07T09:00:00.000Z',
        capacity: 5,
      });
      for (const [n, mail] of [
        ['Dana D', 'dana@cls.local'],
        ['Eva E', 'eva@cls.local'],
      ] as const) {
        await apiCall(`/admin/class-sessions/${session.id}/join`, {
          method: 'POST',
          token,
          body: JSON.stringify({ customerName: n, customerEmail: mail }),
        });
      }
      const err = await expectFail(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ capacity: 1 }),
      });
      expect(err).toMatch(/CAPACITY_BELOW_BOOKED/);

      // na počet přihlášených to jít musí
      const ok = await apiCall<{ data: SessionRow }>(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ capacity: 2 }),
      });
      expect(ok.data.capacity).toBe(2);
    });

    it('ODMÍTNE kapacitu 1 bez přístroje (CAPACITY_TOO_LOW)', async () => {
      const session = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-04-08T09:00:00.000Z',
        capacity: 4,
      });
      const err = await expectFail(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ capacity: 1 }),
      });
      expect(err).toMatch(/CAPACITY_TOO_LOW/);
    });

    it('ODMÍTNE kolizi trenéra (TRAINER_BUSY)', async () => {
      const first = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-05-10T09:00:00.000Z',
        capacity: 3,
        employeeId,
      });
      const second = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-05-10T15:00:00.000Z',
        capacity: 3,
        employeeId,
      });
      expect(first.id).not.toBe(second.id);

      const err = await expectFail(`/admin/class-sessions/${second.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ startsAt: '2032-05-10T09:30:00.000Z' }),
      });
      expect(err).toMatch(/TRAINER_BUSY/);

      // posun na volný čas projde (a nesmí kolidovat sám se sebou)
      const ok = await apiCall<{ data: SessionRow }>(`/admin/class-sessions/${second.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ startsAt: '2032-05-10T15:00:00.000Z' }),
      });
      expect(new Date(ok.data.startsAt).toISOString()).toBe('2032-05-10T15:00:00.000Z');
    });

    it('ODMÍTNE kolizi přístroje (MACHINE_TAKEN)', async () => {
      const emsA = await createSession({
        serviceId: emsServiceId,
        startsAt: '2032-06-01T09:00:00.000Z',
        capacity: 1,
        resourceId: resourceA,
      });
      const emsB = await createSession({
        serviceId: emsServiceId,
        startsAt: '2032-06-01T12:00:00.000Z',
        capacity: 1,
        resourceId: resourceB,
      });
      expect(emsA.resourceId).toBe(resourceA);

      // přehodit emsB na přístroj A v čase, kdy na něm běží emsA
      const err = await expectFail(`/admin/class-sessions/${emsB.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ resourceId: resourceA, startsAt: '2032-06-01T09:10:00.000Z' }),
      });
      expect(err).toMatch(/MACHINE_TAKEN/);
    });

    it('ODMÍTNE editaci zrušené lekce (SESSION_NOT_EDITABLE)', async () => {
      const session = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-07-01T09:00:00.000Z',
        capacity: 3,
      });
      await apiCall(`/admin/class-sessions/${session.id}/cancel`, { method: 'POST', token });
      const err = await expectFail(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ capacity: 6 }),
      });
      expect(err).toMatch(/SESSION_NOT_EDITABLE/);
    });

    it('ODMÍTNE prázdné tělo a neexistující přístroj', async () => {
      const session = await createSession({
        serviceId: groupServiceId,
        startsAt: '2032-07-02T09:00:00.000Z',
        capacity: 3,
      });
      const empty = await expectFail(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({}),
      });
      expect(empty).toMatch(/VALIDATION_FAILED|400/);

      const badResource = await expectFail(`/admin/class-sessions/${session.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ resourceId: '00000000-0000-4000-8000-000000000000' }),
      });
      expect(badResource).toMatch(/RESOURCE_NOT_FOUND|404/);
    });
  });

  // ─── 3. Výpis rozvrhů ────────────────────────────────────────────────

  describe('GET /admin/class-sessions/recurrences', () => {
    let recurrenceId: string;

    it('vrátí rozvrh s počtem vygenerovaných lekcí', async () => {
      const created = await apiCall<{ data: { recurrenceId: string; created: number } }>(
        '/admin/class-sessions/recurrences',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            serviceId: groupServiceId,
            capacity: 10,
            daysOfWeek: [1, 3],
            time: '18:00',
            startDate: '2032-09-06',
            endDate: '2032-09-20',
          }),
        },
      );
      recurrenceId = created.data.recurrenceId;
      expect(created.data.created).toBeGreaterThan(0);

      const list = await apiCall<{
        data: Array<{
          id: string;
          status: string;
          time: string;
          daysOfWeek: number[];
          startDate: string;
          endDate: string;
          sessionCount: number;
          openCount: number;
        }>;
      }>('/admin/class-sessions/recurrences', { token });

      const row = list.data.find((r) => r.id === recurrenceId);
      expect(row).toBeDefined();
      expect(row?.status).toBe('active');
      expect(row?.time).toBe('18:00');
      expect(row?.daysOfWeek).toEqual([1, 3]);
      expect(row?.sessionCount).toBe(created.data.created);
      expect(row?.openCount).toBe(created.data.created);
    });

    it('lekce rozvrhu jdou vyfiltrovat přes recurrenceId', async () => {
      const sessions = await listSessions(`?recurrenceId=${recurrenceId}&status=all`);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.recurrenceId === recurrenceId)).toBe(true);
    });

    it('po zrušení má rozvrh stav cancelled a filtr status funguje', async () => {
      await apiCall(`/admin/class-sessions/recurrences/${recurrenceId}/cancel`, {
        method: 'POST',
        token,
      });

      const active = await apiCall<{ data: Array<{ id: string }> }>(
        '/admin/class-sessions/recurrences?status=active',
        { token },
      );
      expect(active.data.some((r) => r.id === recurrenceId)).toBe(false);

      const cancelled = await apiCall<{
        data: Array<{ id: string; status: string; cancelledCount: number }>;
      }>('/admin/class-sessions/recurrences?status=cancelled', { token });
      const row = cancelled.data.find((r) => r.id === recurrenceId);
      expect(row?.status).toBe('cancelled');
      expect(row?.cancelledCount).toBeGreaterThan(0);
    });

    it('neplatný status rozvrhů odmítne Zod', async () => {
      const err = await expectFail('/admin/class-sessions/recurrences?status=nope', { token });
      expect(err).toMatch(/VALIDATION_FAILED|400/);
    });
  });
});
