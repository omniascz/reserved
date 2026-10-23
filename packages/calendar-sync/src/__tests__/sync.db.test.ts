// Synchronizace kalendářů nad skutečnou DB (reserved_test).
//
// Google a Microsoft Graph jsou falešné HTTP servery v testu (odpovědi podle
// jejich dokumentace); CalDAV je skutečný Radicale (přeskočí se bez
// CALDAV_TEST_URL). Ověřuje se to, co se v DB opravdu stane s bloky
// dostupnosti, mapováním, kurzory a chybami.

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { nactiKlic } from '@reserved/utils';
import {
  encryptCredentials,
  markGoogleNeedsSync,
  markOutlookNeedsSync,
  pushBookingCancelled,
  pushBookingCreated,
  pushBookingRescheduled,
  pushToken,
  readCredentials,
  syncDueConnections,
  syncGenericConnection,
  syncGoogleConnection,
  ensureOutlookPush,
  type SyncDeps,
} from '../sync.js';
import type { CalendarSyncConfig } from '../types.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_test';
const client = postgres(DB_URL, { max: 4 });
const db = drizzle(client, { schema });

const key = nactiKlic('a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90', 'TEST');
const tenantId = randomUUID();
const empA = randomUUID();
const empB = randomUUID();
const branchId = randomUUID();
const serviceId = randomUUID();

// ─── Falešný Google + Graph ───────────────────────────────────────────────
interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  body: string;
  auth: string;
}
const log: Req[] = [];
let handler: (r: Req) => { status: number; json?: unknown } = () => ({ status: 404 });
let server: Server;
let base: string;

let cfg: CalendarSyncConfig;
let deps: SyncDeps;

async function blocks(employeeId: string) {
  return client<Array<{ title: string; starts_at: Date; ends_at: Date }>>`
    SELECT title, starts_at, ends_at FROM availability_blocks
    WHERE tenant_id = ${tenantId} AND employee_id = ${employeeId} ORDER BY starts_at`;
}

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://x');
      const r: Req = {
        method: req.method ?? '',
        path: u.pathname,
        query: u.searchParams,
        body,
        auth: String(req.headers.authorization ?? ''),
      };
      log.push(r);
      const out = handler(r);
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(out.json === undefined ? '' : JSON.stringify(out.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
  cfg = {
    encryptionKey: key,
    google: {
      clientId: 'g',
      clientSecret: 'gs',
      apiBase: `${base}/google`,
      tokenUrl: `${base}/google-token`,
    },
    microsoft: {
      clientId: 'm',
      clientSecret: 'ms',
      graphBase: `${base}/graph`,
      tokenUrl: `${base}/ms-token`,
    },
    publicApiUrl: 'https://api.example.cz',
    pushSecret: 'push-tajemstvi',
  };
  deps = { db, cfg };

  await client`INSERT INTO tenants (id, slug, name, timezone) VALUES (${tenantId}, ${'cal-' + tenantId.slice(0, 8)}, 'Kalendáře', 'Europe/Prague')`;
  await client`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branchId}, ${tenantId}, 'Praha', 'praha')`;
  const cat = randomUUID();
  await client`INSERT INTO service_categories (id, tenant_id, name) VALUES (${cat}, ${tenantId}, 'T')`;
  await client`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency)
    VALUES (${serviceId}, ${tenantId}, ${cat}, 'Střih', 60, 50000, 'CZK')`;
  for (const e of [empA, empB]) {
    await client`INSERT INTO employees (id, tenant_id, first_name, last_name) VALUES (${e}, ${tenantId}, 'E', ${e.slice(0, 6)})`;
  }
});

afterAll(async () => {
  await client`DELETE FROM availability_blocks WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM google_calendar_inbound_events WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM google_calendar_connections WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM calendar_connections WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM bookings WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM employees WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM services WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM service_categories WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM branches WHERE tenant_id = ${tenantId}`;
  await client`DELETE FROM tenants WHERE id = ${tenantId}`;
  await client.end();
  await new Promise<void>((r) => server.close(() => r()));
});

// ─── Google ───────────────────────────────────────────────────────────────
describe('Google → bloky dostupnosti', () => {
  let connId: string;

  beforeAll(async () => {
    const [c] = await client`INSERT INTO google_calendar_connections
      (tenant_id, employee_id, refresh_token, access_token, access_token_expires_at, inbound_sync_enabled)
      VALUES (${tenantId}, ${empA}, 'r', 'platny', now() + interval '1 hour', true) RETURNING id`;
    connId = (c as { id: string }).id;
  });

  it('úplné stažení: čas, celodenní (místní půlnoc), volno, naše a zrušená', async () => {
    handler = (r) => {
      expect(r.query.get('syncToken')).toBe(null);
      expect(r.query.get('timeMin')).toBeTruthy();
      return {
        status: 200,
        json: {
          items: [
            {
              id: 'g1',
              summary: 'Zubař',
              start: { dateTime: '2027-02-10T09:00:00Z' },
              end: { dateTime: '2027-02-10T10:00:00Z' },
            },
            {
              id: 'g2',
              summary: 'Dovolená',
              start: { date: '2027-07-01' },
              end: { date: '2027-07-03' },
            },
            {
              id: 'g3',
              summary: 'Připomínka',
              transparency: 'transparent',
              start: { dateTime: '2027-02-11T09:00:00Z' },
              end: { dateTime: '2027-02-11T10:00:00Z' },
            },
            {
              id: 'g4',
              summary: 'Rezervace',
              extendedProperties: { private: { reservedBookingId: 'x' } },
              start: { dateTime: '2027-02-12T09:00:00Z' },
              end: { dateTime: '2027-02-12T10:00:00Z' },
            },
            { id: 'g5', status: 'cancelled' },
          ],
          nextSyncToken: 'tok-1',
        },
      };
    };
    const r = await syncGoogleConnection(deps, connId);
    expect(r).toEqual({ created: 2, updated: 0, deleted: 0, skipped: 2 });
    const b = await blocks(empA);
    expect(b.map((x) => x.title)).toEqual(['Zubař', 'Dovolená']);
    // Celodenní 1.–3. 7. (SELČ) = od 30. 6. 22:00 UTC do 2. 7. 22:00 UTC.
    expect(new Date(b[1]!.starts_at).toISOString()).toBe('2027-06-30T22:00:00.000Z');
    expect(new Date(b[1]!.ends_at).toISOString()).toBe('2027-07-02T22:00:00.000Z');
    const [c] =
      await client`SELECT sync_token, needs_sync, consecutive_errors FROM google_calendar_connections WHERE id = ${connId}`;
    expect(c).toMatchObject({ sync_token: 'tok-1', needs_sync: false, consecutive_errors: '0' });
  });

  it('inkrementální: jen změny se syncToken; zrušená a „volno" blok odstraní', async () => {
    handler = (r) => {
      expect(r.query.get('syncToken')).toBe('tok-1');
      expect(r.query.get('timeMin')).toBe(null);
      return {
        status: 200,
        json: {
          items: [
            { id: 'g1', status: 'cancelled' },
            {
              id: 'g2',
              summary: 'Dovolená',
              transparency: 'transparent',
              start: { date: '2027-07-01' },
              end: { date: '2027-07-03' },
            },
            {
              id: 'g6',
              summary: 'Školení',
              start: { dateTime: '2027-03-01T08:00:00Z' },
              end: { dateTime: '2027-03-01T12:00:00Z' },
            },
          ],
          nextSyncToken: 'tok-2',
        },
      };
    };
    const r = await syncGoogleConnection(deps, connId);
    expect(r).toMatchObject({ created: 1, deleted: 2 });
    expect((await blocks(empA)).map((x) => x.title)).toEqual(['Školení']);
  });

  it('propadlý token (410) → úplné stažení; co v něm chybí, zmizí', async () => {
    let call = 0;
    handler = (r) => {
      call++;
      if (r.query.get('syncToken')) return { status: 410, json: { error: { code: 410 } } };
      return {
        status: 200,
        json: {
          items: [
            {
              id: 'g7',
              summary: 'Nová porada',
              start: { dateTime: '2027-03-02T08:00:00Z' },
              end: { dateTime: '2027-03-02T09:00:00Z' },
            },
          ],
          nextSyncToken: 'tok-3',
        },
      };
    };
    await syncGoogleConnection(deps, connId);
    expect(call).toBe(2);
    expect((await blocks(empA)).map((x) => x.title)).toEqual(['Nová porada']);
    const [c] =
      await client`SELECT sync_token FROM google_calendar_connections WHERE id = ${connId}`;
    expect(c!.sync_token).toBe('tok-3');
  });

  it('chyba API se zapíše k připojení, bloky zůstanou', async () => {
    handler = () => ({ status: 500, json: { error: 'boom' } });
    await expect(syncGoogleConnection(deps, connId)).rejects.toThrow(/Google Calendar API error/);
    const [c] =
      await client`SELECT consecutive_errors, last_sync_error, is_active FROM google_calendar_connections WHERE id = ${connId}`;
    expect(c).toMatchObject({ consecutive_errors: '1', is_active: true });
    expect(c!.last_sync_error).toContain('boom');
    expect((await blocks(empA)).map((x) => x.title)).toEqual(['Nová porada']);
  });

  it('push: platný token označí k synchronizaci, podvržený ne', async () => {
    await client`UPDATE google_calendar_connections SET push_channel_id = 'kanal-1', needs_sync = false WHERE id = ${connId}`;
    expect(await markGoogleNeedsSync(db, 'push-tajemstvi', 'kanal-1', 'podvrh')).toBe(null);
    expect(await markGoogleNeedsSync(db, 'push-tajemstvi', 'neznamy', 'x')).toBe(null);
    const ok = pushToken('push-tajemstvi', 'google', connId);
    expect(await markGoogleNeedsSync(db, 'push-tajemstvi', 'kanal-1', ok)).toBe(connId);
    const [c] =
      await client`SELECT needs_sync FROM google_calendar_connections WHERE id = ${connId}`;
    expect(c!.needs_sync).toBe(true);
  });
});

// ─── Outlook ──────────────────────────────────────────────────────────────
describe('Outlook (Microsoft Graph)', () => {
  let connId: string;
  const bookingId = randomUUID();

  beforeAll(async () => {
    const creds = encryptCredentials(cfg, {
      accessToken: 'stary',
      refreshToken: 'refresh-1',
      accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(), // propadlý
    });
    const [c] = await client`INSERT INTO calendar_connections
      (tenant_id, employee_id, provider, account_email, credentials)
      VALUES (${tenantId}, ${empB}, 'outlook', 'iva@firma.cz', ${JSON.stringify(creds)}::jsonb) RETURNING id`;
    connId = (c as { id: string }).id;
    const end = new Date('2027-04-01T10:00:00Z');
    await client`INSERT INTO bookings (id, tenant_id, branch_id, service_id, employee_id, customer_name,
        customer_email, starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, reference_code)
      VALUES (${bookingId}, ${tenantId}, ${branchId}, ${serviceId}, ${empB}, 'Jana', 'jana@test.cz',
        '2027-04-01T09:00:00Z', ${end.toISOString()}::timestamptz, '2027-04-01T09:00:00Z',
        ${end.toISOString()}::timestamptz, 'confirmed', 'B-OUT-0001')`;
  });

  const booking = (start: string, end: string) => ({
    id: bookingId,
    startsAt: new Date(start),
    endsAt: new Date(end),
    customerName: 'Jana',
    customerEmail: 'jana@test.cz',
    customerPhone: null,
    serviceName: 'Střih',
    referenceCode: 'B-OUT-0001',
  });

  it('obnoví propadlý token a uloží ho šifrovaně; zapíše rezervaci', async () => {
    handler = (r) => {
      if (r.path === '/ms-token') {
        expect(r.body).toContain('grant_type=refresh_token');
        expect(r.body).toContain('refresh_token=refresh-1');
        return {
          status: 200,
          json: { access_token: 'novy', refresh_token: 'refresh-2', expires_in: 3600 },
        };
      }
      if (r.method === 'POST' && r.path === '/graph/me/events') {
        expect(r.auth).toBe('Bearer novy');
        const ev = JSON.parse(r.body);
        expect(ev.start).toEqual({ dateTime: '2027-04-01T09:00:00', timeZone: 'UTC' });
        expect(ev.subject).toBe('Střih: Jana');
        return { status: 201, json: { id: 'ol-1' } };
      }
      return { status: 404 };
    };
    await pushBookingCreated(deps, {
      tenantId,
      employeeId: empB,
      booking: booking('2027-04-01T09:00:00Z', '2027-04-01T10:00:00Z'),
    });
    const [conn] = await db
      .select()
      .from(schema.calendarConnections)
      .where((await import('drizzle-orm')).eq(schema.calendarConnections.id, connId));
    expect(JSON.stringify(conn!.credentials)).not.toContain('refresh-2'); // šifrované
    expect(readCredentials<{ refreshToken: string }>(cfg, conn!).refreshToken).toBe('refresh-2');
    const [link] =
      await client`SELECT external_event_id FROM calendar_event_links WHERE booking_id = ${bookingId}`;
    expect(link!.external_event_id).toBe('ol-1');
  });

  it('delta: úplné stažení po stránkách; naši událost přeskočí', async () => {
    handler = (r) => {
      if (r.path === '/graph/me/calendarView/delta' && r.query.get('startDateTime')) {
        return {
          status: 200,
          json: {
            value: [
              {
                id: 'ol-x',
                subject: 'Porada',
                start: { dateTime: '2027-04-02T08:00:00.0000000', timeZone: 'UTC' },
                end: { dateTime: '2027-04-02T09:00:00.0000000', timeZone: 'UTC' },
                showAs: 'busy',
              },
            ],
            '@odata.nextLink': `${base}/graph/page2`,
          },
        };
      }
      if (r.path === '/graph/page2') {
        return {
          status: 200,
          json: {
            value: [
              {
                id: 'ol-1', // naše rezervace
                subject: 'Střih: Jana',
                start: { dateTime: '2027-04-01T09:00:00.0000000' },
                end: { dateTime: '2027-04-01T10:00:00.0000000' },
              },
              {
                id: 'ol-allday',
                subject: 'Konference',
                isAllDay: true,
                start: { dateTime: '2027-05-05T00:00:00.0000000' },
                end: { dateTime: '2027-05-06T00:00:00.0000000' },
              },
              {
                id: 'ol-free',
                subject: 'Volno',
                showAs: 'free',
                start: { dateTime: '2027-04-03T08:00:00.0000000' },
                end: { dateTime: '2027-04-03T09:00:00.0000000' },
              },
            ],
            '@odata.deltaLink': `${base}/graph/delta-1`,
          },
        };
      }
      return { status: 404 };
    };
    const r = await syncGenericConnection(deps, connId);
    expect(r).toMatchObject({ created: 2, skipped: 2 });
    expect((await blocks(empB)).map((b) => b.title)).toEqual(['Porada', 'Konference']);
    const [c] = await client`SELECT sync_cursor FROM calendar_connections WHERE id = ${connId}`;
    expect(c!.sync_cursor).toBe(`${base}/graph/delta-1`);
  });

  it('delta: další stažení jen změny (@removed smaže blok)', async () => {
    handler = (r) => {
      if (r.path === '/graph/delta-1') {
        return {
          status: 200,
          json: {
            value: [{ id: 'ol-x', '@removed': { reason: 'deleted' } }],
            '@odata.deltaLink': `${base}/graph/delta-2`,
          },
        };
      }
      return { status: 404 };
    };
    const r = await syncGenericConnection(deps, connId);
    expect(r).toMatchObject({ deleted: 1 });
    expect((await blocks(empB)).map((b) => b.title)).toEqual(['Konference']);
  });

  it('přesun a storno rezervace upraví a smažou událost', async () => {
    const seen: string[] = [];
    handler = (r) => {
      seen.push(`${r.method} ${r.path}`);
      if (r.method === 'PATCH' && r.path === '/graph/me/events/ol-1') {
        expect(JSON.parse(r.body).start.dateTime).toBe('2027-04-08T09:00:00');
        return { status: 200, json: { id: 'ol-1' } };
      }
      if (r.method === 'DELETE' && r.path === '/graph/me/events/ol-1') return { status: 204 };
      return { status: 404 };
    };
    await pushBookingRescheduled(deps, {
      tenantId,
      employeeId: empB,
      booking: booking('2027-04-08T09:00:00Z', '2027-04-08T10:00:00Z'),
    });
    await pushBookingCancelled(deps, { tenantId, bookingId });
    expect(seen).toEqual(['PATCH /graph/me/events/ol-1', 'DELETE /graph/me/events/ol-1']);
    const links = await client`SELECT id FROM calendar_event_links WHERE booking_id = ${bookingId}`;
    expect(links).toHaveLength(0);
  });

  it('push: založí subscription s ověřitelným clientState', async () => {
    let clientState = '';
    handler = (r) => {
      if (r.method === 'POST' && r.path === '/graph/subscriptions') {
        const b = JSON.parse(r.body);
        expect(b.notificationUrl).toBe(
          'https://api.example.cz/api/v1/integrations/outlook/notifications',
        );
        expect(b.resource).toBe('/me/events');
        clientState = b.clientState;
        return {
          status: 201,
          json: { id: 'sub-1', expirationDateTime: new Date(Date.now() + 3 * 864e5).toISOString() },
        };
      }
      return { status: 404 };
    };
    const [conn] = await db
      .select()
      .from(schema.calendarConnections)
      .where((await import('drizzle-orm')).eq(schema.calendarConnections.id, connId));
    expect(await ensureOutlookPush(deps, conn!)).toBe(true);
    expect(await markOutlookNeedsSync(db, 'push-tajemstvi', 'sub-1', 'podvrh')).toBe(null);
    expect(await markOutlookNeedsSync(db, 'push-tajemstvi', 'sub-1', clientState)).toBe(connId);
  });
});

// ─── Kdo je na řadě ───────────────────────────────────────────────────────
describe('syncDueConnections', () => {
  it('synchronizuje jen připojení s pushem nebo starou synchronizací', async () => {
    // DB je sdílená s jinými testy — kontroluje se jen tenant tohoto testu.
    const [g0] = await client`UPDATE google_calendar_connections
      SET needs_sync = false, last_inbound_sync_at = now() - interval '1 minute',
          consecutive_errors = '0', push_expires_at = now() + interval '5 days'
      WHERE tenant_id = ${tenantId} RETURNING last_inbound_sync_at`;
    await client`UPDATE calendar_connections
      SET needs_sync = true, subscription_expires_at = now() + interval '3 days', is_active = true
      WHERE tenant_id = ${tenantId}`;
    handler = (r) =>
      r.path.startsWith('/graph/delta')
        ? { status: 200, json: { value: [], '@odata.deltaLink': `${base}/graph/delta-3` } }
        : { status: 404 };
    await syncDueConnections(deps, { intervalMinutes: 15, limit: 1000 });

    // Outlook (přišel push) se synchronizoval…
    const [o] = await client`SELECT needs_sync, last_inbound_sync_at FROM calendar_connections
      WHERE tenant_id = ${tenantId} AND provider = 'outlook'`;
    expect(o!.needs_sync).toBe(false);
    expect(Date.now() - new Date(o!.last_inbound_sync_at as string).getTime()).toBeLessThan(30_000);
    // …Google (synchronizovaný před minutou, bez pushe) ne.
    const [g] = await client`SELECT last_inbound_sync_at FROM google_calendar_connections
      WHERE tenant_id = ${tenantId}`;
    expect(new Date(g!.last_inbound_sync_at as string).toISOString()).toBe(
      new Date(g0!.last_inbound_sync_at as string).toISOString(),
    );
  });
});

// ─── CalDAV (skutečný server) ─────────────────────────────────────────────
const CALDAV = process.env.CALDAV_TEST_URL;
describe.skipIf(!CALDAV)('CalDAV (Radicale) dovnitř i ven', () => {
  let connId: string;
  let calendarUrl: string;
  const auth = () =>
    `Basic ${Buffer.from(`${process.env.CALDAV_TEST_USER}:${process.env.CALDAV_TEST_PASSWORD}`).toString('base64')}`;

  beforeAll(async () => {
    calendarUrl = `${CALDAV!.replace(/\/$/, '')}/${process.env.CALDAV_TEST_USER}/sync-${Date.now().toString(36)}/`;
    const res = await fetch(calendarUrl, {
      method: 'MKCALENDAR',
      headers: { Authorization: auth() },
    });
    expect(res.status).toBe(201);
    const d = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');
    await fetch(new URL('obed.ics', calendarUrl), {
      method: 'PUT',
      headers: { Authorization: auth(), 'Content-Type': 'text/calendar' },
      body: [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//t//CS',
        'BEGIN:VEVENT',
        'UID:obed-1',
        'DTSTAMP:20260101T000000Z',
        `DTSTART:${d}T110000Z`,
        `DTEND:${d}T120000Z`,
        'SUMMARY:Oběd s klientem',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    });
    const creds = encryptCredentials(cfg, {
      serverUrl: CALDAV,
      username: process.env.CALDAV_TEST_USER,
      password: process.env.CALDAV_TEST_PASSWORD,
    });
    const [c] = await client`INSERT INTO calendar_connections
      (tenant_id, employee_id, provider, calendar_ref, credentials)
      VALUES (${tenantId}, ${empA}, 'caldav', ${calendarUrl}, ${JSON.stringify(creds)}::jsonb) RETURNING id`;
    connId = (c as { id: string }).id;
  });

  afterAll(async () => {
    await fetch(calendarUrl, { method: 'DELETE', headers: { Authorization: auth() } });
  });

  it('událost z kalendáře → blok; rezervace → událost (a zpět se nekopíruje)', async () => {
    const r = await syncGenericConnection(deps, connId);
    expect(r.created).toBe(1);
    expect((await blocks(empA)).map((b) => b.title)).toContain('Oběd s klientem');

    const bookingId = randomUUID();
    const start = new Date(Date.now() + 6 * 864e5);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(start.getTime() + 3600_000);
    await client`INSERT INTO bookings (id, tenant_id, branch_id, service_id, employee_id, customer_name,
        customer_email, starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, reference_code)
      VALUES (${bookingId}, ${tenantId}, ${branchId}, ${serviceId}, ${empA}, 'Petr', 'petr@test.cz',
        ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz,
        ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, 'confirmed', 'B-DAV-0001')`;
    await pushBookingCreated(deps, {
      tenantId,
      employeeId: empA,
      booking: {
        id: bookingId,
        startsAt: start,
        endsAt: end,
        customerName: 'Petr',
        customerEmail: 'petr@test.cz',
        customerPhone: null,
        serviceName: 'Střih',
        referenceCode: 'B-DAV-0001',
      },
    });
    const [link] =
      await client`SELECT external_event_id FROM calendar_event_links WHERE booking_id = ${bookingId}`;
    expect(link!.external_event_id).toBe(`reserved-${bookingId}`);

    const r2 = await syncGenericConnection(deps, connId);
    expect(r2.skipped).toBeGreaterThanOrEqual(1); // naše vlastní událost
    expect((await blocks(empA)).some((b) => b.title.includes('Petr'))).toBe(false);

    await pushBookingCancelled(deps, { tenantId, bookingId });
    const after = await client`SELECT id FROM calendar_event_links WHERE booking_id = ${bookingId}`;
    expect(after).toHaveLength(0);
  });
});
