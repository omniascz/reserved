// Komplexní E2E test reálného fitness provozu proti běžícímu API (:4000 + DB).
//
// Pokrývá scénáře, které musí Reserved zvládnout pro „jakýkoliv fitness provoz":
//   1. Jeden sport (1:1 + skupina)
//   2. Spousta sportů, každý s vlastním 1:1 trenérem (paralelní rezervace)
//   3. Stejná služba — každou lekci vede JINÝ trenér
//   4. Skupinové lekce s kapacitou (archetyp volný trenér)
//   5. Storno (admin zruší rezervaci, uvolněný slot lze znovu obsadit)
//   6. Přeložení lekce (reschedule + reassign na jiného trenéra + ochrana proti kolizi)
//   7. Veřejný self-service 1:1 přes celý web flow: availability → hold → booking
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4000 + DB)

import { describe, it, expect, beforeAll } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api/v1';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `kp-${ts}-${rand}`.slice(0, 32);
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

describe('Komplexní fitness provoz E2E', () => {
  const slug = uniqueSlug();
  const email = `${slug}@e2e.local`;
  const password = 'SecureTestPwd123!';

  let token: string;
  let branchId: string;

  // Trenéři
  let empA: string; // box / osobní
  let empB: string; // plavání / osobní
  let empC: string; // náhradník

  // Služby (různé sporty / archetypy)
  let svcBox: string; // osobni_1_1
  let svcPlav: string; // osobni_1_1
  let svcSpin: string; // skupinova_lekce
  let svcVolny: string; // volny_trener

  // Datum pro veřejný self-service flow (v rámci max-days-ahead okna)
  const publicDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const reg = await apiCall<{ tenantId: string; tokens: { accessToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Komplet Studio ${slug}`,
          email,
          password,
          firstName: 'Komplet',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;

    const branches = await apiCall<{ data: Array<{ id: string }> }>(`/public/${slug}/branches`);
    branchId = branches.data[0]!.id;

    // Služby (4 různé sporty / archetypy)
    const mkService = async (name: string, archetype: string, duration: number) => {
      const r = await apiCall<{ data: { id: string } }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name,
          durationMinutes: duration,
          priceHellers: 50000,
          archetype,
        }),
      });
      return r.data.id;
    };
    svcBox = await mkService('Box (osobní)', 'osobni_1_1', 60);
    svcPlav = await mkService('Plavání (osobní)', 'osobni_1_1', 60);
    svcSpin = await mkService('Spinning (skupina)', 'skupinova_lekce', 45);
    svcVolny = await mkService('Posilovna (volný trenér)', 'volny_trener', 60);

    // Trenéři — každý umí příslušné služby (employee↔service link)
    const mkEmployee = async (first: string, last: string, serviceIds: string[]) => {
      const r = await apiCall<{ data: { id: string } }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({
          firstName: first,
          lastName: last,
          isPublic: true,
          acceptsOnlineBookings: true,
          branchIds: [branchId],
          serviceIds,
        }),
      });
      return r.data.id;
    };
    empA = await mkEmployee('Adam', 'Box', [svcBox, svcSpin, svcVolny]);
    empB = await mkEmployee('Bára', 'Plavec', [svcPlav, svcSpin, svcVolny]);
    empC = await mkEmployee('Cyril', 'Náhrada', [svcBox, svcPlav, svcSpin, svcVolny]);

    // Pracovní doba pro Adama (po-ne 08:00–20:00) — nutné pro VEŘEJNÝ self-service flow.
    await apiCall(`/admin/employees/${empA}/schedule`, {
      method: 'PUT',
      token,
      body: JSON.stringify({
        schedule: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: '08:00',
          endTime: '20:00',
          branchId,
        })),
      }),
    });
  });

  // ─── 1. Jeden sport: 1:1 admin rezervace ─────────────────────────────
  describe('1) Jeden sport — 1:1 rezervace', () => {
    let bookingId: string;

    it('admin vytvoří 1:1 rezervaci (box / Adam)', async () => {
      const r = await apiCall<{ data: { id: string; status: string; employeeId: string } }>(
        '/admin/bookings',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            serviceId: svcBox,
            employeeId: empA,
            startsAt: '2031-09-15T08:00:00.000Z',
            customerName: 'Klient Jednosport',
            customerEmail: 'jeden@kp.local',
          }),
        },
      );
      expect(r.data.status).toBe('confirmed');
      expect(r.data.employeeId).toBe(empA);
      bookingId = r.data.id;
    });

    it('dvojí rezervace stejného trenéra na stejný čas → kolize', async () => {
      const fail = await expectFail('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcBox,
          employeeId: empA,
          startsAt: '2031-09-15T08:00:00.000Z',
          customerName: 'Kolize',
          customerEmail: 'kolize@kp.local',
        }),
      });
      expect(fail).toMatch(/CONFLICT|SLOT|OVERLAP|23P01|409|400/i);
      expect(bookingId).toBeTruthy();
    });
  });

  // ─── 2. Spousta sportů, každý s vlastním 1:1 trenérem ────────────────
  describe('2) Více sportů — vlastní 1:1 trenér na každý', () => {
    it('Adam (box) a Bára (plavání) trénují PARALELNĚ ve stejný čas', async () => {
      const a = await apiCall<{ data: { id: string; employeeId: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcBox,
          employeeId: empA,
          startsAt: '2031-09-16T09:00:00.000Z',
          customerName: 'Box klient',
          customerEmail: 'box@kp.local',
        }),
      });
      const b = await apiCall<{ data: { id: string; employeeId: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcPlav,
          employeeId: empB,
          startsAt: '2031-09-16T09:00:00.000Z',
          customerName: 'Plavec klient',
          customerEmail: 'plav@kp.local',
        }),
      });
      expect(a.data.employeeId).toBe(empA);
      expect(b.data.employeeId).toBe(empB);
      expect(a.data.id).not.toBe(b.data.id);
    });
  });

  // ─── 3. Stejná služba — každou lekci vede jiný trenér ────────────────
  describe('3) Stejná služba, jiný trenér na každou lekci', () => {
    it('3 spinning lekce, každá s jiným trenérem (A, B, C)', async () => {
      const mk = async (emp: string, hour: string) => {
        const r = await apiCall<{ data: { id: string; employeeId: string } }>(
          '/admin/class-sessions',
          {
            method: 'POST',
            token,
            body: JSON.stringify({
              serviceId: svcSpin,
              employeeId: emp,
              startsAt: `2031-09-17T${hour}:00:00.000Z`,
              capacity: 10,
            }),
          },
        );
        return r.data;
      };
      const s1 = await mk(empA, '08');
      const s2 = await mk(empB, '10');
      const s3 = await mk(empC, '12');
      expect(s1.employeeId).toBe(empA);
      expect(s2.employeeId).toBe(empB);
      expect(s3.employeeId).toBe(empC);
      expect(new Set([s1.id, s2.id, s3.id]).size).toBe(3);
    });
  });

  // ─── 4. Skupinové lekce s kapacitou (volný trenér) ───────────────────
  describe('4) Skupinová lekce — kapacita', () => {
    let sessionId: string;
    it('volný trenér: lekce kapacita 2 → 2 se vejdou, 3. plno', async () => {
      const s = await apiCall<{ data: { id: string; capacity: number } }>('/admin/class-sessions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcVolny,
          employeeId: empA,
          startsAt: '2031-09-18T17:00:00.000Z',
          capacity: 2,
        }),
      });
      sessionId = s.data.id;
      expect(s.data.capacity).toBe(2);

      await apiCall(`/public/${slug}/class-sessions/${sessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'V1', customerEmail: 'v1@kp.local' }),
      });
      await apiCall(`/public/${slug}/class-sessions/${sessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'V2', customerEmail: 'v2@kp.local' }),
      });
      const full = await expectFail(`/public/${slug}/class-sessions/${sessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ customerName: 'V3', customerEmail: 'v3@kp.local' }),
      });
      expect(full).toMatch(/SESSION_FULL|400/);
    });
  });

  // ─── 5. Storno ───────────────────────────────────────────────────────
  describe('5) Storno rezervace', () => {
    let bId: string;
    it('admin zruší 1:1 rezervaci → status cancelled', async () => {
      const r = await apiCall<{ data: { id: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcBox,
          employeeId: empA,
          startsAt: '2031-09-19T10:00:00.000Z',
          customerName: 'Stornista',
          customerEmail: 'storno@kp.local',
        }),
      });
      bId = r.data.id;

      const c = await apiCall<{ data: { status: string } }>(`/admin/bookings/${bId}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: 'Klient se omluvil', notifyCustomer: false }),
      });
      expect(c.data.status).toBe('cancelled');
    });

    it('uvolněný slot lze po stornu znovu obsadit', async () => {
      const r = await apiCall<{ data: { id: string; status: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcBox,
          employeeId: empA,
          startsAt: '2031-09-19T10:00:00.000Z',
          customerName: 'Náhradník',
          customerEmail: 'nahrada@kp.local',
        }),
      });
      expect(r.data.status).toBe('confirmed');
      expect(r.data.id).not.toBe(bId);
    });
  });

  // ─── 6. Přeložení (reschedule) ───────────────────────────────────────
  describe('6) Přeložení lekce', () => {
    let bId: string;
    it('admin přeloží rezervaci na nový čas', async () => {
      const r = await apiCall<{ data: { id: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcBox,
          employeeId: empA,
          startsAt: '2031-09-20T08:00:00.000Z',
          customerName: 'Přesouvač',
          customerEmail: 'presun@kp.local',
        }),
      });
      bId = r.data.id;

      const moved = await apiCall<{ data: { startsAt: string } }>(
        `/admin/bookings/${bId}/reschedule`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            newStartsAt: '2031-09-20T14:00:00.000Z',
            notifyCustomer: false,
          }),
        },
      );
      expect(new Date(moved.data.startsAt).toISOString()).toBe('2031-09-20T14:00:00.000Z');
    });

    it('přeložení + přeřazení na jiného trenéra (Cyril)', async () => {
      const moved = await apiCall<{ data: { employeeId: string } }>(
        `/admin/bookings/${bId}/reschedule`,
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            newStartsAt: '2031-09-20T16:00:00.000Z',
            newEmployeeId: empC,
            notifyCustomer: false,
          }),
        },
      );
      expect(moved.data.employeeId).toBe(empC);
    });

    it('přeložení do kolize s jinou rezervací stejného trenéra → kolize', async () => {
      // Adam má 2031-09-15T08:00 obsazeno (scénář 1). Vytvoř novou a zkus ji na ten čas.
      const r = await apiCall<{ data: { id: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: svcBox,
          employeeId: empA,
          startsAt: '2031-09-21T08:00:00.000Z',
          customerName: 'Kolizní přesun',
          customerEmail: 'kolizepresun@kp.local',
        }),
      });
      const fail = await expectFail(`/admin/bookings/${r.data.id}/reschedule`, {
        method: 'POST',
        token,
        body: JSON.stringify({ newStartsAt: '2031-09-15T08:00:00.000Z', notifyCustomer: false }),
      });
      expect(fail).toMatch(/CONFLICT|SLOT|OVERLAP|23P01|409|400/i);
    });
  });

  // ─── 7. Veřejný self-service 1:1 (celý web flow) ─────────────────────
  describe('7) Veřejný self-service 1:1 (availability → hold → booking)', () => {
    let slotStart: string;
    let sessionToken: string;

    it('availability vrací volné sloty pro Adama (box)', async () => {
      const res = await apiCall<{
        data?: Array<{ employeeId: string; slots: Array<{ startsAt: string }> }>;
      }>(`/public/${slug}/availability?serviceId=${svcBox}&employeeId=${empA}&date=${publicDate}`);
      const list = (res as { data?: unknown }).data ?? res;
      const employees = list as Array<{ employeeId: string; slots: Array<{ startsAt: string }> }>;
      const adam = employees.find((e) => e.employeeId === empA);
      expect(adam).toBeDefined();
      expect(adam!.slots.length).toBeGreaterThan(0);
      slotStart = adam!.slots[0]!.startsAt;
    });

    it('vytvoření holdu na slot', async () => {
      const res = await apiCall<{ data: { sessionToken: string } }>(`/public/${slug}/holds`, {
        method: 'POST',
        body: JSON.stringify({ serviceId: svcBox, employeeId: empA, startsAt: slotStart }),
      });
      sessionToken = res.data.sessionToken;
      expect(sessionToken).toBeTruthy();
    });

    it('potvrzení rezervace z holdu → confirmed', async () => {
      const res = await apiCall<{ data: { status: string } }>(`/public/${slug}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          sessionToken,
          customerName: 'Web Samoobsluha',
          customerEmail: 'web@kp.local',
        }),
      });
      expect(res.data.status).toBe('confirmed');
    });

    it('dvojí rezervace obsazeného slotu se chytí při potvrzení (ne při holdu)', async () => {
      // Hold je měkký zámek — nekontroluje existující rezervace, jen jiné aktivní
      // holdy. Druhý hold na již obsazený slot tedy projde...
      const second = await apiCall<{ data: { sessionToken: string } }>(`/public/${slug}/holds`, {
        method: 'POST',
        body: JSON.stringify({ serviceId: svcBox, employeeId: empA, startsAt: slotStart }),
      });
      // ...ale potvrzení rezervace už narazí na reálnou rezervaci (DB EXCLUDE) → kolize.
      const fail = await expectFail(`/public/${slug}/bookings`, {
        method: 'POST',
        body: JSON.stringify({
          sessionToken: second.data.sessionToken,
          customerName: 'Pozdní klient',
          customerEmail: 'pozdni@kp.local',
        }),
      });
      expect(fail).toMatch(/CONFLICT|SLOT|OVERLAP|TAKEN|23P01|409|400/i);
    });
  });
});
