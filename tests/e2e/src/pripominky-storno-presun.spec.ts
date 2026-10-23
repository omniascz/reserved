// Připomínky se při přesunu a stornu rezervace ruší (vzor `cancelWithReference`
// z cal.com — viz apps/api/src/email/booking-notifications.ts).
//
//   1. nová rezervace       → ve frontě čeká připomínka (protikontrola, že vůbec je)
//   2. přesun               → stará připomínka 'cancelled', nová 'pending' na nový čas
//   3. storno               → čekající připomínka 'cancelled'
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4010 + DB)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const sql = postgres(DB_URL, { max: 2 });

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `pripom-${ts}-${rand}`.slice(0, 32);
}

async function apiCall<T>(
  path: string,
  init?: RequestInit & { token?: string; tenantId?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init?.tenantId) headers['X-Tenant-ID'] = init.tenantId;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error(`[${res.status}] ${path}: ${text}`);
  return body as T;
}

interface Pripominka {
  status: string;
  scheduled_at: Date;
  metadata: { bookingStartsAt?: string };
  last_error: string | null;
}

async function pripominky(bookingId: string): Promise<Pripominka[]> {
  return sql<Pripominka[]>`
    SELECT status, scheduled_at, metadata, last_error FROM notifications
    WHERE related_booking_id = ${bookingId} AND template_code = 'booking_reminder'
    ORDER BY created_at`;
}

describe('Připomínky při přesunu a stornu', () => {
  const slug = uniqueSlug();
  let token: string;
  let tenantId: string;
  let serviceId: string;
  let employeeId: string;
  let bookingId: string;

  // Daleko v budoucnu, aby připomínka (24 h předem) nebyla v minulosti.
  const puvodni = '2027-06-15T08:00:00.000Z';
  const novy = '2027-06-17T12:00:00.000Z';

  beforeAll(async () => {
    const reg = await apiCall<{ tenantId: string; tokens: { accessToken: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Připomínky ${slug}`,
          email: `${slug}@e2e.local`,
          password: 'SecureTestPwd123!',
          firstName: 'Prip',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      },
    );
    token = reg.tokens.accessToken;
    tenantId = reg.tenantId;
    const svc = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'Střih', durationMinutes: 60, priceHellers: 50000 }),
    });
    serviceId = svc.data.id;
    const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({ firstName: 'Iva', lastName: 'Kadeřnice' }),
    });
    employeeId = emp.data.id;
  });

  afterAll(async () => {
    await sql.end();
  });

  it('nová rezervace naplánuje připomínku s časem termínu', async () => {
    const res = await apiCall<{ data: { id: string } }>('/admin/bookings', {
      method: 'POST',
      token,
      body: JSON.stringify({
        serviceId,
        employeeId,
        customerName: 'Jana Nováková',
        customerEmail: `jana-${slug}@e2e.local`,
        startsAt: puvodni,
      }),
    });
    bookingId = res.data.id;

    const p = await pripominky(bookingId);
    expect(p).toHaveLength(1);
    expect(p[0]!.status).toBe('pending');
    expect(p[0]!.metadata.bookingStartsAt).toBe(puvodni);
    expect(p[0]!.scheduled_at.toISOString()).toBe('2027-06-14T08:00:00.000Z');

    // Rezervace od admina visí na zákazníkovi (jinak ji v portálu nevidí).
    const [b] = await sql<Array<{ email: string | null }>>`
      SELECT c.email FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id
      WHERE b.id = ${bookingId}`;
    expect(b?.email).toBe(`jana-${slug}@e2e.local`);
  });

  it('přesun zruší starou připomínku a naplánuje novou', async () => {
    await apiCall(`/admin/bookings/${bookingId}/reschedule`, {
      method: 'POST',
      token,
      body: JSON.stringify({ newStartsAt: novy, notifyCustomer: false }),
    });

    const p = await pripominky(bookingId);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ status: 'cancelled', last_error: 'booking_rescheduled' });
    expect(p[1]!.status).toBe('pending');
    expect(p[1]!.metadata.bookingStartsAt).toBe(novy);
    expect(p[1]!.scheduled_at.toISOString()).toBe('2027-06-16T12:00:00.000Z');
  });

  it('storno zruší čekající připomínku', async () => {
    await apiCall(`/admin/bookings/${bookingId}/cancel`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason: 'test', notifyCustomer: false }),
    });

    const p = await pripominky(bookingId);
    expect(p.map((x) => x.status)).toEqual(['cancelled', 'cancelled']);
    expect(p[1]!.last_error).toBe('booking_cancelled');
  });

  // ─── Totéž přes zákaznický portál (běží pod právy zákazníka) ───────────
  describe('zákaznický portál', () => {
    const email = `portal-${slug}@e2e.local`;
    let portalBookingId: string;
    let portalToken: string;
    // Portál pouští přesun jen na termín, který by nabídla dostupnost:
    // v rezervačním okně (výchozí 60 dní) a v pracovní době zaměstnance.
    const den = (plusDni: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + plusDni);
      return d.toISOString().slice(0, 10);
    };
    const puvodniPortal = `${den(10)}T08:00:00.000Z`;
    const novyPortal = `${den(11)}T09:00:00.000Z`;

    beforeAll(async () => {
      await apiCall(`/admin/employees/${employeeId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ serviceIds: [serviceId] }),
      });
      await apiCall(`/admin/employees/${employeeId}/schedule`, {
        method: 'PUT',
        token,
        body: JSON.stringify({
          schedule: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
            dayOfWeek: d,
            startTime: '06:00',
            endTime: '20:00',
          })),
        }),
      });
      const res = await apiCall<{ data: { id: string } }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId,
          employeeId,
          customerName: 'Petr Portálový',
          customerEmail: email,
          startsAt: puvodniPortal,
        }),
      });
      portalBookingId = res.data.id;

      // Přihlášení zákazníka: magic-link se známým tokenem → verify.
      const raw = randomBytes(32).toString('hex');
      const hash = createHash('sha256').update(raw).digest('hex');
      await sql`INSERT INTO customer_magic_links (tenant_id, email, token_hash, purpose, expires_at)
        VALUES (${tenantId}, ${email}, ${hash}, 'login', now() + interval '10 minutes')`;
      const v = await apiCall<{ accessToken?: string; data?: { accessToken: string } }>(
        `/portal/auth/verify?token=${raw}`,
        { tenantId },
      );
      portalToken = v.accessToken ?? v.data!.accessToken;
    });

    it('přesun z portálu nahradí připomínku', async () => {
      await apiCall(`/portal/me/bookings/${portalBookingId}/reschedule`, {
        method: 'POST',
        token: portalToken,
        tenantId,
        body: JSON.stringify({ newStartsAt: novyPortal }),
      });
      const p = await pripominky(portalBookingId);
      expect(p.map((x) => x.status)).toEqual(['cancelled', 'pending']);
      expect(p[1]!.metadata.bookingStartsAt).toBe(novyPortal);
    });

    it('storno z portálu zruší čekající připomínku', async () => {
      await apiCall(`/portal/me/bookings/${portalBookingId}/cancel`, {
        method: 'POST',
        token: portalToken,
        tenantId,
        body: JSON.stringify({ reason: 'nemoc' }),
      });
      const p = await pripominky(portalBookingId);
      expect(p.map((x) => x.status)).toEqual(['cancelled', 'cancelled']);
    });
  });
});
