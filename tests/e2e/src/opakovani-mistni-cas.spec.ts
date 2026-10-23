// Opakované termíny drží MÍSTNÍ čas i přes změnu letního času (převzato
// z cal.com — viz apps/api/src/common/local-time.ts).
//
// Pokrývá oba generátory:
//   1. POST /admin/booking-series         — série 1:1 rezervací
//   2. POST /admin/class-sessions/recurrences — opakovaný rozvrh lekcí
//
// Run: pnpm --filter @reserved/e2e test   (API musí běžet na :4010 + DB)

import { beforeAll, describe, expect, it } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4010/api/v1';
const TZ = 'Europe/Prague';

function uniqueSlug(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `opak-${ts}-${rand}`.slice(0, 32);
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

/** Místní „YYYY-MM-DD HH:MM" v Praze. */
function prague(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

describe('Opakované termíny v místním čase', () => {
  const slug = uniqueSlug();
  let token: string;
  let oneOnOneServiceId: string;
  let groupServiceId: string;
  let employeeId: string;

  beforeAll(async () => {
    const reg = await apiCall<{ tokens: { accessToken: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        tenantSlug: slug,
        tenantName: `Opakování ${slug}`,
        email: `${slug}@e2e.local`,
        password: 'SecureTestPwd123!',
        firstName: 'Opak',
        lastName: 'Owner',
        currency: 'CZK',
        locale: 'cs-CZ',
      }),
    });
    token = reg.tokens.accessToken;

    const svc = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: 'Masáž', durationMinutes: 60, priceHellers: 80000 }),
    });
    oneOnOneServiceId = svc.data.id;

    const group = await apiCall<{ data: { id: string } }>('/admin/services', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: 'Jóga',
        durationMinutes: 60,
        priceHellers: 20000,
        archetype: 'skupinova_lekce',
      }),
    });
    groupServiceId = group.data.id;

    const emp = await apiCall<{ data: { id: string } }>('/admin/employees', {
      method: 'POST',
      token,
      body: JSON.stringify({ firstName: 'Eva', lastName: 'Masérka' }),
    });
    employeeId = emp.data.id;
  });

  it('týdenní série přes 28. 3. 2027 drží 10:00', async () => {
    const res = await apiCall<{ data: { seriesId: string; created: number } }>(
      '/admin/booking-series',
      {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: oneOnOneServiceId,
          employeeId,
          customerName: 'Jana Nováková',
          customerEmail: `jana-${slug}@e2e.local`,
          startsAt: '2027-03-18T09:00:00.000Z', // 18. 3. 2027 10:00 SEČ
          frequency: 'weekly',
          occurrences: 4,
        }),
      },
    );
    expect(res.data.created).toBe(4);

    const detail = await apiCall<{ data: { bookings: Array<{ startsAt: string }> } }>(
      `/admin/booking-series/${res.data.seriesId}`,
      { token },
    );
    expect(detail.data.bookings.map((b) => prague(b.startsAt))).toEqual([
      '2027-03-18 10:00',
      '2027-03-25 10:00',
      '2027-04-01 10:00',
      '2027-04-08 10:00',
    ]);
  });

  it('měsíční série z 31. 1. 2027 nevynechá únor', async () => {
    const res = await apiCall<{ data: { seriesId: string; created: number } }>(
      '/admin/booking-series',
      {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: oneOnOneServiceId,
          employeeId,
          customerName: 'Petr Svoboda',
          customerEmail: `petr-${slug}@e2e.local`,
          startsAt: '2027-01-31T13:00:00.000Z', // 31. 1. 2027 14:00
          frequency: 'monthly',
          occurrences: 3,
        }),
      },
    );
    expect(res.data.created).toBe(3);

    const detail = await apiCall<{ data: { bookings: Array<{ startsAt: string }> } }>(
      `/admin/booking-series/${res.data.seriesId}`,
      { token },
    );
    expect(detail.data.bookings.map((b) => prague(b.startsAt))).toEqual([
      '2027-01-31 14:00',
      '2027-02-28 14:00',
      '2027-03-31 14:00',
    ]);
  });

  it('rozvrh lekcí: „18:00" je 18:00 pražského času v létě i v zimě', async () => {
    const res = await apiCall<{ data: { recurrenceId: string; created: number } }>(
      '/admin/class-sessions/recurrences',
      {
        method: 'POST',
        token,
        body: JSON.stringify({
          serviceId: groupServiceId,
          employeeId,
          capacity: 10,
          daysOfWeek: [2], // úterý
          time: '18:00',
          startDate: '2027-10-19',
          endDate: '2027-11-02',
        }),
      },
    );
    expect(res.data.created).toBe(3);

    const list = await apiCall<{ data: Array<{ startsAt: string }> }>(
      `/admin/class-sessions?recurrenceId=${res.data.recurrenceId}`,
      { token },
    );
    const times = list.data.map((s) => prague(s.startsAt)).sort();
    expect(times).toEqual(['2027-10-19 18:00', '2027-10-26 18:00', '2027-11-02 18:00']);
  });
});
