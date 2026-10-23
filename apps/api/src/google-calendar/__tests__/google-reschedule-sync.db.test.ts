// Přesun rezervace se propíše do Google kalendáře.
//
// Google API je nahrazené podstrčeným `fetch` (zaznamená volání a vrátí
// odpověď); databáze je skutečná. Scénáře:
//   1. stejný zaměstnanec → PATCH existující události (nový čas), odkaz zůstane
//   2. jiný zaměstnanec   → DELETE ze starého kalendáře + POST do nového
//   3. událost v Google mezitím smazaná (PATCH → 404) → vytvoří se znovu

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { DbConfig } from '../../db/db.config.js';
import { DbService } from '../../db/db.service.js';
import { GoogleCalendarService } from '../google-calendar.service.js';
import { nactiKlic } from '@reserved/utils';
import type { CalendarConfig } from '../../calendars/calendar.config.js';
import type { schema } from '@reserved/db';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_test';
const sql = postgres(DB_URL, { max: 2 });

const tenantId = randomUUID();
const branchId = randomUUID();
const serviceId = randomUUID();
const empA = randomUUID();
const empB = randomUUID();
const connA = randomUUID();
const connB = randomUUID();

let dbService: DbService;
let svc: GoogleCalendarService;
const volani: Array<{ method: string; url: string; body: unknown }> = [];
let patchStatus = 200;

function fakeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const u = String(url);
  const method = init?.method ?? 'GET';
  volani.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (method === 'POST') {
    return Promise.resolve(
      new Response(JSON.stringify({ id: `evt-${volani.length}` }), { status: 200 }),
    );
  }
  if (method === 'PATCH') {
    return Promise.resolve(new Response('{}', { status: patchStatus }));
  }
  return Promise.resolve(new Response(null, { status: 204 }));
}

async function bookingRow(id: string): Promise<typeof schema.bookings.$inferSelect> {
  const [r] = await sql`SELECT * FROM bookings WHERE id = ${id}`;
  if (!r) throw new Error('booking chybí');
  return {
    ...(r as Record<string, unknown>),
    id: r.id,
    serviceId: r.service_id,
    employeeId: r.employee_id,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    referenceCode: r.reference_code,
  } as unknown as typeof schema.bookings.$inferSelect;
}

async function zalozRezervaci(employeeId: string, start: string, ref: string): Promise<string> {
  const id = randomUUID();
  const end = new Date(new Date(start).getTime() + 3600_000).toISOString();
  await sql`INSERT INTO bookings (id, tenant_id, branch_id, service_id, employee_id, customer_name,
      customer_email, starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, reference_code)
    VALUES (${id}, ${tenantId}, ${branchId}, ${serviceId}, ${employeeId}, 'Jana', 'jana@test.cz',
      ${start}::timestamptz, ${end}::timestamptz, ${start}::timestamptz, ${end}::timestamptz,
      'confirmed', ${ref})`;
  return id;
}

async function presun(id: string, start: string, employeeId: string): Promise<void> {
  const end = new Date(new Date(start).getTime() + 3600_000).toISOString();
  await sql`UPDATE bookings SET starts_at = ${start}::timestamptz, ends_at = ${end}::timestamptz,
      buffer_starts_at = ${start}::timestamptz, buffer_ends_at = ${end}::timestamptz,
      employee_id = ${employeeId} WHERE id = ${id}`;
}

async function odkazy(bookingId: string) {
  return sql<Array<{ connection_id: string; google_event_id: string }>>`
    SELECT connection_id, google_event_id FROM google_calendar_event_links
    WHERE booking_id = ${bookingId}`;
}

describe('Google kalendář — přesun rezervace', () => {
  beforeAll(async () => {
    await sql`INSERT INTO tenants (id, slug, name) VALUES (${tenantId}, ${'gcal-' + tenantId.slice(0, 8)}, 'GCal Test')`;
    await sql`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branchId}, ${tenantId}, 'Praha', 'praha')`;
    const catId = randomUUID();
    await sql`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenantId}, 'T')`;
    await sql`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency)
      VALUES (${serviceId}, ${tenantId}, ${catId}, 'Střih', 60, 50000, 'CZK')`;
    for (const [emp, conn, cal] of [
      [empA, connA, 'kalendar-a'],
      [empB, connB, 'kalendar-b'],
    ] as const) {
      await sql`INSERT INTO employees (id, tenant_id, first_name, last_name) VALUES (${emp}, ${tenantId}, 'E', ${cal})`;
      await sql`INSERT INTO google_calendar_connections (id, tenant_id, employee_id, refresh_token,
          access_token, access_token_expires_at, calendar_id)
        VALUES (${conn}, ${tenantId}, ${emp}, 'refresh', 'access', now() + interval '1 hour', ${cal})`;
    }

    dbService = new DbService(new DbConfig());
    dbService.onModuleInit();
    // Konfigurace jen s klíčem — test nezávisí na proměnných prostředí.
    const calendarConfig = {
      sync: { encryptionKey: nactiKlic('ab'.repeat(32), 'TEST') },
    } as unknown as CalendarConfig;
    svc = new GoogleCalendarService(dbService, calendarConfig);
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await sql`DELETE FROM google_calendar_event_links WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM google_calendar_connections WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM bookings WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM employees WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM services WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM service_categories WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM branches WHERE tenant_id = ${tenantId}`;
    await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await dbService.onModuleDestroy();
    await sql.end();
  });

  it('stejný zaměstnanec → PATCH události na nový čas', async () => {
    const id = await zalozRezervaci(empA, '2027-09-01T08:00:00.000Z', 'G-PATCH-1');
    await svc.syncBookingCreated({
      tenantId,
      bookingId: id,
      employeeId: empA,
      booking: await bookingRow(id),
    });
    const [puvodni] = await odkazy(id);
    expect(puvodni?.connection_id).toBe(connA);

    volani.length = 0;
    await presun(id, '2027-09-02T10:00:00.000Z', empA);
    await svc.syncRescheduledBooking(tenantId, await bookingRow(id));

    expect(volani.map((v) => v.method)).toEqual(['PATCH']);
    expect(volani[0]!.url).toContain(`/calendars/kalendar-a/events/${puvodni!.google_event_id}`);
    expect(volani[0]!.body).toEqual({
      start: { dateTime: '2027-09-02T10:00:00.000Z' },
      end: { dateTime: '2027-09-02T11:00:00.000Z' },
    });
    expect(await odkazy(id)).toEqual([puvodni]);
  });

  it('jiný zaměstnanec → smazat ze starého kalendáře, vytvořit v novém', async () => {
    const id = await zalozRezervaci(empA, '2027-09-03T08:00:00.000Z', 'G-MOVE-1');
    await svc.syncBookingCreated({
      tenantId,
      bookingId: id,
      employeeId: empA,
      booking: await bookingRow(id),
    });

    volani.length = 0;
    await presun(id, '2027-09-03T12:00:00.000Z', empB);
    await svc.syncRescheduledBooking(tenantId, await bookingRow(id));

    expect(volani.map((v) => v.method)).toEqual(['DELETE', 'POST']);
    expect(volani[0]!.url).toContain('/calendars/kalendar-a/events/');
    expect(volani[1]!.url).toContain('/calendars/kalendar-b/events');
    const nove = await odkazy(id);
    expect(nove).toHaveLength(1);
    expect(nove[0]!.connection_id).toBe(connB);
  });

  it('událost v Google mezitím smazaná (404) → vytvoří se znovu', async () => {
    const id = await zalozRezervaci(empA, '2027-09-05T08:00:00.000Z', 'G-404-1');
    await svc.syncBookingCreated({
      tenantId,
      bookingId: id,
      employeeId: empA,
      booking: await bookingRow(id),
    });

    volani.length = 0;
    patchStatus = 404;
    await presun(id, '2027-09-05T09:00:00.000Z', empA);
    await svc.syncRescheduledBooking(tenantId, await bookingRow(id));
    patchStatus = 200;

    expect(volani.map((v) => v.method)).toEqual(['PATCH', 'POST']);
    const nove = await odkazy(id);
    expect(nove).toHaveLength(1);
    expect(nove[0]!.connection_id).toBe(connA);
  });
});
