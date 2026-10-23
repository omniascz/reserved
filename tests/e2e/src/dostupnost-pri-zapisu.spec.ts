// Kontrola dostupnosti v okamžiku zápisu (vzor cal.com `ensureAvailableUsers`).
//
// Dřív hlídala jen DB proti překryvu — přes externí API (telefonní robot),
// zámek termínu widgetu i přesun v portálu šlo zarezervovat i termín mimo
// pracovní dobu, o svátku nebo přes blok. Admin (ruční zápis personálu) smí
// dál cokoli — to je záměrné přepsání pravidel.
//
// Navíc: rezervace z API se propíše do Google kalendáře (dřív jen z widgetu).
// Ověřeno tím, že API Googlu opravdu zavolá — s neplatným tokenem to Google
// odmítne a chyba se zapíše k připojení kalendáře.
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4010 + DB)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const sql = postgres(DB_URL, { max: 2 });
const TZ = 'Europe/Prague';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `dost-${ts}-${rand}`.slice(0, 32);
}

async function call(
  path: string,
  init: RequestInit & { token?: string; tenantId?: string } = {},
): Promise<{ status: number; body: { data?: unknown; error?: { code: string } } }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.token) headers['Authorization'] = `Bearer ${init.token}`;
  if (init.tenantId) headers['X-Tenant-ID'] = init.tenantId;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

async function ok<T>(path: string, init: RequestInit & { token?: string; tenantId?: string } = {}) {
  const r = await call(path, init);
  if (r.status >= 300) throw new Error(`[${r.status}] ${path}: ${JSON.stringify(r.body)}`);
  return r.body as { data: T };
}

/** Místní pražský čas → ISO UTC (zkusí SEČ i SELČ a vezme ten, co sedí). */
function praha(date: string, time: string): string {
  for (const off of ['+01:00', '+02:00']) {
    const d = new Date(`${date}T${time}:00${off}`);
    const back = new Intl.DateTimeFormat('sv-SE', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
    if (back === time) return d.toISOString();
  }
  throw new Error(`Neexistující místní čas ${date} ${time}`);
}

/** Nejbližší středa aspoň 7 dní od dneška (uvnitř výchozího okna 60 dní). */
function pristiStreda(plusTydnu = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 7 * plusTydnu);
  return d.toISOString().slice(0, 10);
}

describe('Dostupnost při zápisu rezervace', () => {
  const slug = uniqueSlug();
  let token: string;
  let tenantId: string;
  let apiKey: string;
  let serviceId: string;
  let employeeId: string;
  const streda = pristiStreda();
  const dalsiStreda = pristiStreda(1);

  beforeAll(async () => {
    const reg = (await (
      await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug: slug,
          tenantName: `Dostupnost ${slug}`,
          email: `${slug}@e2e.local`,
          password: 'SecureTestPwd123!',
          firstName: 'Dost',
          lastName: 'Owner',
          currency: 'CZK',
          locale: 'cs-CZ',
        }),
      })
    ).json()) as { tenantId: string; tokens: { accessToken: string } };
    token = reg.tokens.accessToken;
    tenantId = reg.tenantId;
    // Widget přijímá rezervace až po ověření e-mailu provozovny.
    await sql`UPDATE users SET email_verified_at = now() WHERE tenant_id = ${tenantId}`;

    serviceId = (
      await ok<{ id: string }>('/admin/services', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Střih', durationMinutes: 60, priceHellers: 50000 }),
      })
    ).data.id;
    employeeId = (
      await ok<{ id: string }>('/admin/employees', {
        method: 'POST',
        token,
        body: JSON.stringify({ firstName: 'Iva', lastName: 'Kadeřnice', serviceIds: [serviceId] }),
      })
    ).data.id;
    // Po–Pá 9–17, pauza 12–13.
    await ok(`/admin/employees/${employeeId}/schedule`, {
      method: 'PUT',
      token,
      body: JSON.stringify({
        schedule: [1, 2, 3, 4, 5].map((d) => ({
          dayOfWeek: d,
          startTime: '09:00',
          endTime: '17:00',
          breakStartTime: '12:00',
          breakEndTime: '13:00',
        })),
      }),
    });
    apiKey = (
      await ok<{ rawKey: string }>('/admin/api-keys', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: 'Robot', scopes: ['*'] }),
      })
    ).data.rawKey;
  });

  afterAll(async () => {
    await sql.end();
  });

  const external = (body: Record<string, unknown>) =>
    call('/external/v1/bookings', {
      method: 'POST',
      token: apiKey,
      body: JSON.stringify({
        serviceId,
        employeeId,
        customerName: 'Robot Volající',
        customerEmail: `robot-${slug}@e2e.local`,
        ...body,
      }),
    });

  it('externí API: mimo pracovní dobu / v pauze → 400 s důvodem', async () => {
    const noc = await external({ startsAt: praha(streda, '03:00') });
    expect(noc.status).toBe(400);
    expect(noc.body.error?.code).toBe('OUTSIDE_WORKING_HOURS');

    const pauza = await external({ startsAt: praha(streda, '11:30') });
    expect(pauza.body.error?.code).toBe('OUTSIDE_WORKING_HOURS');

    const tooFar = await external({ startsAt: praha('2027-12-01', '10:00') });
    expect(tooFar.body.error?.code).toBe('TOO_FAR_AHEAD');
  });

  it('externí API: volný termín projde, obsazený ne', async () => {
    const r = await external({ startsAt: praha(streda, '09:00') });
    expect(r.status).toBe(201);
    const druhy = await external({ startsAt: praha(streda, '09:30') });
    expect(druhy.body.error?.code).toBe('SLOT_TAKEN');
  });

  it('externí API: svátek a blok', async () => {
    await ok('/admin/holidays', {
      method: 'POST',
      token,
      body: JSON.stringify({ date: dalsiStreda, name: 'Zavřeno' }),
    });
    const svatek = await external({ startsAt: praha(dalsiStreda, '10:00') });
    expect(svatek.body.error?.code).toBe('HOLIDAY');

    await ok('/admin/blocks', {
      method: 'POST',
      token,
      body: JSON.stringify({
        employeeId,
        startsAt: praha(streda, '14:00'),
        endsAt: praha(streda, '15:00'),
        title: 'Školení',
      }),
    });
    const blok = await external({ startsAt: praha(streda, '14:30') });
    expect(blok.body.error?.code).toBe('BLOCKED');
  });

  it('externí API: přesun — na noc ne, o půl hodiny (přes vlastní termín) ano', async () => {
    const vytvor = await external({ startsAt: praha(streda, '15:00') });
    expect(vytvor.status).toBe(201);
    const id = (vytvor.body.data as { id: string }).id;

    const noc = await call(`/external/v1/bookings/${id}/reschedule`, {
      method: 'POST',
      token: apiKey,
      body: JSON.stringify({ newStartsAt: praha(streda, '22:00'), notifyCustomer: false }),
    });
    expect(noc.body.error?.code).toBe('OUTSIDE_WORKING_HOURS');

    // 15:30 se překrývá s vlastním původním 15:00 — to konflikt není.
    const posun = await call(`/external/v1/bookings/${id}/reschedule`, {
      method: 'POST',
      token: apiKey,
      body: JSON.stringify({ newStartsAt: praha(streda, '15:30'), notifyCustomer: false }),
    });
    expect(posun.status).toBe(201);
  });

  it('widget: zámek termínu mimo pracovní dobu → 400', async () => {
    const noc = await call(`/public/${slug}/holds`, {
      method: 'POST',
      body: JSON.stringify({ serviceId, employeeId, startsAt: praha(streda, '03:00') }),
    });
    expect(noc.status).toBe(400);
    expect(noc.body.error?.code).toBe('OUTSIDE_WORKING_HOURS');

    // Odpoledne středy už je obsazené z předchozích kroků → SLOT_TAKEN.
    const obsazeno = await call(`/public/${slug}/holds`, {
      method: 'POST',
      body: JSON.stringify({ serviceId, employeeId, startsAt: praha(streda, '16:00') }),
    });
    expect(obsazeno.body.error?.code).toBe('SLOT_TAKEN');

    // Čtvrtek je volný → zámek projde.
    const ctvrtek = new Date(`${streda}T12:00:00Z`);
    ctvrtek.setUTCDate(ctvrtek.getUTCDate() + 1);
    const den = await call(`/public/${slug}/holds`, {
      method: 'POST',
      body: JSON.stringify({
        serviceId,
        employeeId,
        startsAt: praha(ctvrtek.toISOString().slice(0, 10), '10:00'),
      }),
    });
    expect(den.status).toBe(201);
  });

  it('portál: přesun na noc → 400', async () => {
    const email = `portal-${slug}@e2e.local`;
    const b = await ok<{ id: string }>('/admin/bookings', {
      method: 'POST',
      token,
      body: JSON.stringify({
        serviceId,
        employeeId,
        customerName: 'Petr Portál',
        customerEmail: email,
        startsAt: praha(streda, '11:00'),
      }),
    });
    const raw = randomBytes(32).toString('hex');
    await sql`INSERT INTO customer_magic_links (tenant_id, email, token_hash, purpose, expires_at)
      VALUES (${tenantId}, ${email}, ${createHash('sha256').update(raw).digest('hex')}, 'login',
        now() + interval '10 minutes')`;
    const v = (await ok<{ accessToken: string }>(`/portal/auth/verify?token=${raw}`, {
      tenantId,
    })) as unknown as { accessToken?: string; data?: { accessToken: string } };
    const portalToken = v.accessToken ?? v.data!.accessToken;

    const noc = await call(`/portal/me/bookings/${b.data.id}/reschedule`, {
      method: 'POST',
      token: portalToken,
      tenantId,
      body: JSON.stringify({ newStartsAt: praha(streda, '23:00') }),
    });
    expect(noc.status).toBe(400);
    expect(noc.body.error?.code).toBe('OUTSIDE_WORKING_HOURS');
  });

  it('admin (ruční zápis personálu) smí i mimo pracovní dobu', async () => {
    const r = await call('/admin/bookings', {
      method: 'POST',
      token,
      body: JSON.stringify({
        serviceId,
        employeeId,
        customerName: 'Mimo Dobu',
        customerEmail: `mimo-${slug}@e2e.local`,
        startsAt: praha(streda, '19:00'),
        skipEmail: true,
      }),
    });
    expect(r.status).toBe(201);
  });

  it('rezervace z API i přesun volají Google kalendář', async () => {
    // Připojení s neplatným tokenem: Google volání odmítne a chyba se zapíše
    // k připojení — důkaz, že synchronizace opravdu proběhla.
    await sql`INSERT INTO google_calendar_connections (tenant_id, employee_id, refresh_token,
        access_token, access_token_expires_at, calendar_id)
      VALUES (${tenantId}, ${employeeId}, 'neplatny', 'neplatny', now() + interval '1 hour', 'primary')`;
    const stav = async () => {
      const [c] = await sql<Array<{ last_sync_error: string | null; consecutive_errors: string }>>`
        SELECT last_sync_error, consecutive_errors FROM google_calendar_connections
        WHERE tenant_id = ${tenantId}`;
      return c!;
    };
    const cekej = async (pocet: string) => {
      for (let i = 0; i < 50; i++) {
        if ((await stav()).consecutive_errors === pocet) return;
        await new Promise((r) => setTimeout(r, 200));
      }
    };

    const r = await external({ startsAt: praha(streda, '10:00') });
    expect(r.status).toBe(201);
    await cekej('1');
    expect((await stav()).last_sync_error).toMatch(/Google Calendar API error/);

    const id = (r.body.data as { id: string }).id;
    const p = await call(`/external/v1/bookings/${id}/reschedule`, {
      method: 'POST',
      token: apiKey,
      body: JSON.stringify({ newStartsAt: praha(streda, '13:00'), notifyCustomer: false }),
    });
    expect(p.status).toBe(201);
    await cekej('2');
    expect((await stav()).consecutive_errors).toBe('2');
  });
});
