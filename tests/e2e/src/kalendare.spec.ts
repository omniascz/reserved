// Kalendáře zaměstnanců přes API: CalDAV (skutečný Radicale), Outlook a Google
// (falešné servery Microsoftu a Googlu na pevném portu).
//
// Požadavky na běžící API (jinak se příslušné části přeskočí):
//   - CalDAV: CALDAV_TEST_URL/USER/PASSWORD (Radicale v Dockeru)
//   - Outlook + Google: API spuštěné s MICROSOFT_* a GOOGLE_* (CLIENT_ID,
//     CLIENT_SECRET, *_GRAPH_BASE / *_API_BASE, *_TOKEN_URL) mířícími na
//     http://127.0.0.1:${CALENDAR_FAKE_PORT ?? 12198}
//
// Co se ověřuje (vzor cal.com — viz packages/calendar-sync):
//   1. CalDAV: připojení, synchronizace → blok, blok zastaví robota, rezervace
//      se zapíše do kalendáře, přesun ji upraví, storno smaže, vypnutí příjmu
//      bloky odstraní
//   2. Outlook: OAuth start + návrat (tokeny uložené šifrovaně), synchronizace,
//      push handshake i notifikace
//   3. Google: ruční synchronizace (celodenní událost) a push

import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const CALDAV = process.env.CALDAV_TEST_URL;
const CALDAV_USER = process.env.CALDAV_TEST_USER ?? '';
const CALDAV_PASS = process.env.CALDAV_TEST_PASSWORD ?? '';
const FAKE_PORT = Number(process.env.CALENDAR_FAKE_PORT ?? 12198);
const FAKES = Boolean(process.env.MICROSOFT_GRAPH_BASE && process.env.GOOGLE_API_BASE);
const PUSH_SECRET = process.env.CALENDAR_PUSH_SECRET ?? process.env.PAYMENT_CONFIG_KEY ?? '';
const sql = postgres(DB_URL, { max: 2 });

async function call<T = unknown>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ status: number; body: { data?: T; error?: { code: string } }; res: Response }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, res };
}
async function ok<T>(path: string, init: RequestInit & { token?: string } = {}) {
  const r = await call<T>(path, init);
  if (r.status >= 300) throw new Error(`[${r.status}] ${path}: ${JSON.stringify(r.body)}`);
  return r.body.data as T;
}

/** Datum za N dní (UTC) — vždy uvnitř rezervačního okna 60 dní. */
const den = (plus: number) => new Date(Date.now() + plus * 864e5).toISOString().slice(0, 10);

describe('Kalendáře zaměstnanců (API)', () => {
  const slug = `kal-${Date.now().toString(36)}`.slice(0, 32);
  let token: string;
  let tenantId: string;
  let serviceId: string;
  let employeeId: string;
  let apiKey: string;

  beforeAll(async () => {
    const reg = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Kalendáře ${slug}`,
        email: `${slug}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Kal',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    const r = reg.body as unknown as { tenantId: string; tokens: { accessToken: string } };
    token = r.tokens.accessToken;
    tenantId = r.tenantId;
    serviceId = (
      await ok<{ id: string }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Konzultace', durationMinutes: 60, priceHellers: 60000 }),
      })
    ).id;
    employeeId = (
      await ok<{ id: string }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Eva', lastName: 'Poradkyně', serviceIds: [serviceId] }),
      })
    ).id;
    await ok(`/admin/employees/${employeeId}/schedule`, {
      method: 'PUT',
      token,
      body: JSON.stringify({
        schedule: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
          dayOfWeek: d,
          startTime: '06:00',
          endTime: '22:00',
        })),
      }),
    });
    apiKey = (
      await ok<{ rawKey: string }>('/admin/api-keys', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Robot', scopes: ['*'] }),
      })
    ).rawKey;
  });

  afterAll(async () => {
    await sql.end();
  });

  // ─── 1. CalDAV ──────────────────────────────────────────────────────────
  describe.skipIf(!CALDAV)('CalDAV (Radicale)', () => {
    let calendarUrl: string;
    let connId: string;
    const auth = `Basic ${Buffer.from(`${CALDAV_USER}:${CALDAV_PASS}`).toString('base64')}`;
    const lekar = { date: den(5), start: '10:00', end: '11:00' };

    beforeAll(async () => {
      calendarUrl = `${CALDAV!.replace(/\/$/, '')}/${CALDAV_USER}/e2e-${Date.now().toString(36)}/`;
      const mk = await fetch(calendarUrl, {
        method: 'MKCALENDAR',
        headers: { Authorization: auth },
      });
      expect(mk.status).toBe(201);
      const d = lekar.date.replace(/-/g, '');
      await fetch(new URL('lekar.ics', calendarUrl), {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'text/calendar' },
        body: [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//e2e//CS',
          'BEGIN:VEVENT',
          'UID:lekar-1',
          'DTSTAMP:20260101T000000Z',
          `DTSTART:${d}T100000Z`,
          `DTEND:${d}T110000Z`,
          'SUMMARY:Lékař',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      });
    });

    afterAll(async () => {
      await fetch(calendarUrl, { method: 'DELETE', headers: { Authorization: auth } });
    });

    it('připojení ověří přístup; špatné heslo odmítne', async () => {
      const bad = await call('/admin/integrations/calendars/caldav', {
        method: 'POST',
        token,
        body: JSON.stringify({
          employeeId,
          serverUrl: CALDAV,
          username: CALDAV_USER,
          password: 'spatne',
        }),
      });
      expect(bad.status).toBe(400);
      expect(bad.body.error?.code).toBe('CALDAV_CONNECT_FAILED');

      const r = await ok<{ id: string; calendarName: string }>(
        '/admin/integrations/calendars/caldav',
        {
          method: 'POST',
          token,
          body: JSON.stringify({
            employeeId,
            serverUrl: CALDAV,
            username: CALDAV_USER,
            password: CALDAV_PASS,
            calendarUrl,
          }),
        },
      );
      connId = r.id;
      const list = await call('/admin/integrations/calendars', { token });
      expect(JSON.stringify(list.body)).not.toContain(CALDAV_PASS); // přístupy se nevrací
      const [row] =
        await sql`SELECT credentials::text AS c FROM calendar_connections WHERE id = ${connId}`;
      expect(row!.c).not.toContain(CALDAV_PASS); // a v DB jsou šifrované
    });

    it('synchronizace: událost z kalendáře zablokuje termín i robotovi', async () => {
      const s = await ok<{ created: number }>(`/admin/integrations/calendars/${connId}/sync`, {
        method: 'POST',
        token,
      });
      expect(s.created).toBe(1);
      const robot = await call('/external/v1/bookings', {
        method: 'POST',
        token: apiKey,
        body: JSON.stringify({
          serviceId,
          employeeId,
          customerName: 'Robot',
          customerEmail: `robot-${slug}@e2e.local`,
          startsAt: `${lekar.date}T10:00:00.000Z`,
        }),
      });
      expect(robot.body.error?.code).toBe('BLOCKED');
    });

    it('rezervace se zapíše do kalendáře, přesun ji upraví, storno smaže', async () => {
      const b = await ok<{ id: string }>('/admin/bookings', {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId,
          employeeId,
          customerName: 'Jana Nováková',
          customerEmail: `jana-${slug}@e2e.local`,
          startsAt: `${den(6)}T09:00:00.000Z`,
          skipEmail: true,
        }),
      });
      const ics = new URL(`reserved-${b.id}.ics`, calendarUrl);
      const get = async () => fetch(ics, { headers: { Authorization: auth } });
      let res: Response | null = null;
      for (let i = 0; i < 30 && res?.status !== 200; i++) {
        res = await get();
        if (res.status !== 200) await new Promise((r) => setTimeout(r, 200));
      }
      expect(res!.status).toBe(200);
      expect(await res!.text()).toContain(`DTSTART:${den(6).replace(/-/g, '')}T090000Z`);

      await ok(`/admin/bookings/${b.id}/reschedule`, {
        method: 'POST',
        token,
        body: JSON.stringify({ newStartsAt: `${den(7)}T13:00:00.000Z`, notifyCustomer: false }),
      });
      let text = '';
      for (let i = 0; i < 30 && !text.includes(`${den(7).replace(/-/g, '')}T130000Z`); i++) {
        text = await (await get()).text();
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(text).toContain(`DTSTART:${den(7).replace(/-/g, '')}T130000Z`);

      await ok(`/admin/bookings/${b.id}/cancel`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: 'test', notifyCustomer: false }),
      });
      let status = 200;
      for (let i = 0; i < 30 && status === 200; i++) {
        status = (await get()).status;
        if (status === 200) await new Promise((r) => setTimeout(r, 200));
      }
      expect(status).toBe(404);
    });

    it('vypnutí příjmu bloky odstraní, odpojení připojení zruší', async () => {
      await ok(`/admin/integrations/calendars/${connId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ inboundSyncEnabled: false }),
      });
      const blocks =
        await sql`SELECT id FROM availability_blocks WHERE tenant_id = ${tenantId} AND title = 'Lékař'`;
      expect(blocks).toHaveLength(0);
      const del = await call(`/admin/integrations/calendars/${connId}`, {
        method: 'DELETE',
        token,
      });
      expect(del.status).toBe(204);
      const [row] =
        await sql`SELECT revoked_at, credentials::text AS c FROM calendar_connections WHERE id = ${connId}`;
      expect(row!.revoked_at).not.toBeNull();
      expect(row!.c).toBe('{}'); // přístupy po odpojení smazané
    });
  });

  // ─── 2. + 3. Outlook a Google přes falešné servery ─────────────────────
  describe.skipIf(!FAKES)('Outlook a Google (falešné servery)', () => {
    let server: Server;
    const log: Array<{ method: string; path: string; body: string }> = [];
    let outlookConnId: string;
    let googleConnId: string;

    beforeAll(async () => {
      server = createServer((req: IncomingMessage, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const u = new URL(req.url ?? '/', 'http://x');
          log.push({ method: req.method ?? '', path: u.pathname, body });
          const json = (status: number, j: unknown) => {
            res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(j));
          };
          if (u.pathname === '/ms-token') {
            return json(200, {
              access_token: 'ms-access',
              refresh_token: 'ms-refresh-tajny',
              expires_in: 3600,
            });
          }
          if (u.pathname === '/graph/me') return json(200, { mail: 'eva@firma.cz' });
          if (u.pathname === '/graph/me/calendarView/delta') {
            return json(200, {
              value: [
                {
                  id: 'ol-porada',
                  subject: 'Porada týmu',
                  start: { dateTime: `${den(8)}T08:00:00.0000000` },
                  end: { dateTime: `${den(8)}T09:00:00.0000000` },
                  showAs: 'busy',
                },
              ],
              '@odata.deltaLink': `http://127.0.0.1:${FAKE_PORT}/graph/delta-next`,
            });
          }
          if (u.pathname === '/graph/delta-next') {
            return json(200, {
              value: [],
              '@odata.deltaLink': `http://127.0.0.1:${FAKE_PORT}/graph/delta-next`,
            });
          }
          if (u.pathname.startsWith('/google/calendars/')) {
            return json(200, {
              items: [
                {
                  id: 'g-dovolena',
                  summary: 'Dovolená',
                  start: { date: den(20) },
                  end: { date: den(22) },
                },
              ],
              nextSyncToken: 'tok-e2e',
            });
          }
          if (u.pathname === '/graph/me/events') return json(201, { id: 'ol-rez' });
          return json(404, { error: u.pathname });
        });
      });
      await new Promise<void>((r) => server.listen(FAKE_PORT, '127.0.0.1', r));
    });

    afterAll(async () => {
      await new Promise<void>((r) => server.close(() => r()));
    });

    it('Outlook: OAuth start → návrat uloží připojení se šifrovanými tokeny', async () => {
      const start = await ok<{ authUrl: string }>(
        `/admin/integrations/calendars/outlook/${employeeId}/start`,
        { method: 'POST', token },
      );
      const auth = new URL(start.authUrl);
      expect(auth.hostname).toBe('login.microsoftonline.com');
      expect(auth.searchParams.get('client_id')).toBe('m-test');
      expect(auth.searchParams.get('scope')).toContain('Calendars.ReadWrite');
      const state = auth.searchParams.get('state')!;

      const cb = await fetch(
        `${API_URL}/admin/integrations/calendars/outlook/callback?code=kod-123&state=${encodeURIComponent(state)}`,
        { redirect: 'manual' },
      );
      expect(cb.status).toBe(302);
      expect(cb.headers.get('location')).toContain('outlook_success=1');

      const [row] = await sql<Array<{ id: string; account_email: string; c: string }>>`
        SELECT id, account_email, credentials::text AS c FROM calendar_connections
        WHERE tenant_id = ${tenantId} AND provider = 'outlook' AND revoked_at IS NULL`;
      outlookConnId = row!.id;
      expect(row!.account_email).toBe('eva@firma.cz');
      expect(row!.c).not.toContain('ms-refresh-tajny');

      // Podvržený state se odmítne.
      const fake = await fetch(
        `${API_URL}/admin/integrations/calendars/outlook/callback?code=x&state=podvrh.podpis`,
        { redirect: 'manual' },
      );
      expect(fake.headers.get('location')).toContain('outlook_error=');
    });

    it('Outlook: synchronizace vytvoří blok; push handshake a notifikace', async () => {
      const s = await ok<{ created: number }>(
        `/admin/integrations/calendars/${outlookConnId}/sync`,
        {
          method: 'POST',
          token,
        },
      );
      expect(s.created).toBe(1);

      const handshake = await fetch(
        `${API_URL}/integrations/outlook/notifications?validationToken=over-mne-123`,
        { method: 'POST' },
      );
      expect(handshake.status).toBe(200);
      expect(await handshake.text()).toBe('over-mne-123');

      const subId = `sub-${randomUUID()}`;
      await sql`UPDATE calendar_connections SET subscription_id = ${subId} WHERE id = ${outlookConnId}`;
      const before = log.filter((l) => l.path === '/graph/delta-next').length;
      const spatne = await fetch(`${API_URL}/integrations/outlook/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: [{ subscriptionId: subId, clientState: 'podvrh' }] }),
      });
      expect(spatne.status).toBe(202);
      const clientState = createHmac('sha256', PUSH_SECRET)
        .update(`outlook:${outlookConnId}`)
        .digest('hex');
      await fetch(`${API_URL}/integrations/outlook/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: [{ subscriptionId: subId, clientState }] }),
      });
      let after = before;
      for (let i = 0; i < 30 && after === before; i++) {
        await new Promise((r) => setTimeout(r, 200));
        after = log.filter((l) => l.path === '/graph/delta-next').length;
      }
      expect(after).toBe(before + 1); // jen platná notifikace spustila synchronizaci
    });

    it('Google: ruční synchronizace (celodenní dovolená) a push', async () => {
      const [g] = await sql<Array<{ id: string }>>`INSERT INTO google_calendar_connections
        (tenant_id, employee_id, refresh_token, access_token, access_token_expires_at, inbound_sync_enabled)
        VALUES (${tenantId}, ${employeeId}, 'r', 'a', now() + interval '1 hour', true) RETURNING id`;
      googleConnId = g!.id;
      const s = await ok<{ created: number }>(
        `/admin/integrations/google/connections/${employeeId}/sync-inbound`,
        { method: 'POST', token },
      );
      expect(s.created).toBe(1);
      const [blok] =
        await sql`SELECT starts_at FROM availability_blocks WHERE tenant_id = ${tenantId} AND title = 'Dovolená'`;
      // Celodenní = od místní půlnoci (Praha = UTC+1/+2, tedy 22:00 / 23:00 předchozího dne UTC).
      expect([22, 23]).toContain(new Date(blok!.starts_at as string).getUTCHours());

      await sql`UPDATE google_calendar_connections SET push_channel_id = ${'kanal-' + randomUUID()} WHERE id = ${googleConnId}`;
      const [c] =
        await sql`SELECT push_channel_id FROM google_calendar_connections WHERE id = ${googleConnId}`;
      const before = log.filter((l) => l.path.startsWith('/google/calendars/')).length;
      await fetch(`${API_URL}/integrations/google/push`, {
        method: 'POST',
        headers: {
          'X-Goog-Channel-Id': c!.push_channel_id as string,
          'X-Goog-Channel-Token': createHmac('sha256', PUSH_SECRET)
            .update(`google:${googleConnId}`)
            .digest('hex'),
          'X-Goog-Resource-State': 'exists',
        },
      });
      let after = before;
      for (let i = 0; i < 30 && after === before; i++) {
        await new Promise((r) => setTimeout(r, 200));
        after = log.filter((l) => l.path.startsWith('/google/calendars/')).length;
      }
      expect(after).toBe(before + 1);
    });
  });
});
