// Odchozí webhooky: událost o přesunu + doručování přes frontu v DB.
//
//   1. přesun rezervace → příjemce dostane 'booking.rescheduled' s platným podpisem
//   2. příjemce vrací 500 → doručení zůstane 'pending' s dalším pokusem za ~1 min
//      (dřív se po 3 pokusech v paměti API označilo 'failed' a ztratilo)
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4010 + DB)

import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const sql = postgres(DB_URL, { max: 2 });

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `whk-${ts}-${rand}`.slice(0, 32);
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

interface Prijato {
  path: string;
  body: string;
  signature: string;
  event: string;
}

async function cekej<T>(fn: () => Promise<T | undefined>, ms = 8000): Promise<T> {
  const konec = Date.now() + ms;
  while (Date.now() < konec) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Nedočkal jsem se');
}

describe('Webhook o přesunu a fronta doručení', () => {
  const slug = uniqueSlug();
  let token: string;
  let serviceId: string;
  let employeeId: string;
  let server: Server;
  let base: string;
  const prijato: Prijato[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        prijato.push({
          path: req.url ?? '',
          body,
          signature: String(req.headers['x-reserved-signature'] ?? ''),
          event: String(req.headers['x-reserved-event-type'] ?? ''),
        });
        res.writeHead(req.url === '/ok' ? 200 : 500).end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

    const reg = await apiCall<{ tokens: { accessToken: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Webhooky ${slug}`,
        email: `${slug}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Web',
        lastName: 'Hook',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    token = reg.tokens.accessToken;
    serviceId = (
      await apiCall<{ data: { id: string } }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Masáž', durationMinutes: 60, priceHellers: 90000 }),
      })
    ).data.id;
    employeeId = (
      await apiCall<{ data: { id: string } }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Ola', lastName: 'Masérka' }),
      })
    ).data.id;
  });

  afterAll(async () => {
    await sql.end();
    await new Promise<void>((r) => server.close(() => r()));
  });

  async function rezervaceAPresun(start: string, novy: string): Promise<string> {
    const b = await apiCall<{ data: { id: string } }>('/admin/bookings', {
      method: 'POST',
      token,
      body: JSON.stringify({
        serviceId,
        employeeId,
        customerName: 'Jana Nováková',
        customerEmail: `jana-${slug}@e2e.local`,
        startsAt: start,
      }),
    });
    await apiCall(`/admin/bookings/${b.data.id}/reschedule`, {
      method: 'POST',
      token,
      body: JSON.stringify({ newStartsAt: novy, notifyCustomer: false }),
    });
    return b.data.id;
  }

  it('přesun pošle booking.rescheduled s platným podpisem', async () => {
    const wh = await apiCall<{ data: { id: string; secret: string } }>('/admin/webhooks', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'OK', url: `${base}/ok`, eventTypes: ['booking.rescheduled'] }),
    });

    const bookingId = await rezervaceAPresun(
      '2027-08-02T08:00:00.000Z',
      '2027-08-03T08:00:00.000Z',
    );

    const req = await cekej(async () => prijato.find((p) => p.path === '/ok'));
    expect(req.event).toBe('booking.rescheduled');
    const ocekavany = createHmac('sha256', wh.data.secret).update(req.body).digest('hex');
    expect(req.signature).toBe(`sha256=${ocekavany}`);
    const body = JSON.parse(req.body) as { payload: { bookingId: string }; version: string };
    expect(body.payload.bookingId).toBe(bookingId);
    expect(body.version).toBe('1');

    const [d] = await cekej(async () => {
      const r = await sql`SELECT status, attempts FROM webhook_deliveries
        WHERE webhook_id = ${wh.data.id} AND status <> 'pending'`;
      return r.length > 0 ? r : undefined;
    });
    expect(d).toMatchObject({ status: 'sent', attempts: 1 });

    await apiCall(`/admin/webhooks/${wh.data.id}`, { method: 'DELETE', token });
  });

  it('nedostupný příjemce → doručení čeká ve frontě, neztratí se', async () => {
    const wh = await apiCall<{ data: { id: string } }>('/admin/webhooks', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Chyba',
        url: `${base}/chyba`,
        eventTypes: ['booking.rescheduled'],
      }),
    });

    await rezervaceAPresun('2027-08-09T08:00:00.000Z', '2027-08-10T08:00:00.000Z');

    const [d] = await cekej(async () => {
      const r = await sql<Array<{ status: string; attempts: number; next_attempt_at: string }>>`
        SELECT status, attempts, next_attempt_at FROM webhook_deliveries
        WHERE webhook_id = ${wh.data.id} AND attempts >= 1`;
      return r.length > 0 ? r : undefined;
    });
    expect(d).toMatchObject({ status: 'pending', attempts: 1 });
    const zaSekund = (new Date(d!.next_attempt_at).getTime() - Date.now()) / 1000;
    expect(zaSekund).toBeGreaterThan(30);
    expect(zaSekund).toBeLessThan(70);

    // Webhook se kvůli jedné odložené události nepozastavil.
    const [w] = await sql`SELECT is_active, consecutive_errors FROM outgoing_webhooks
      WHERE id = ${wh.data.id}`;
    expect(w).toMatchObject({ is_active: true, consecutive_errors: 0 });
  });
});
