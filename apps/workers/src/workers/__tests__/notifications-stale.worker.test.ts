// Worker nesmí poslat připomínku zrušeného nebo přesunutého termínu.
//
// Test si založí tři rezervace a k nim zralé připomínky:
//   - platná rezervace          → připomínka se POŠLE (protikontrola),
//   - zrušená rezervace         → 'cancelled', nic se neodešle,
//   - přesunutá rezervace       → 'cancelled' (metadata nesedí na nový čas).
// Kdyby se kontrolovalo jen „nic neodešlo", prošel by i worker, který
// neposílá vůbec nic.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from '@reserved/db';
import { NotificationsWorker } from '../notifications.worker.js';
import type { EmailProvider } from '../../providers/email.provider.js';
import type { SmsProvider } from '../../providers/sms/index.js';
import type { WhatsAppProvider } from '../../providers/whatsapp/index.js';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5433/reserved_dev';
const client = postgres(DB_URL, { max: 3 });
const db = drizzle(client, { schema });

const znacka = `ns-${Date.now().toString(36)}`;
let tenantId: string;
const sent: string[] = [];

const email = {
  send: async (input: { to: string }) => {
    sent.push(input.to);
    return { messageId: `test-${sent.length}` };
  },
} as unknown as EmailProvider;
const sms = { name: 'test', send: async () => ({ messageId: 'x' }) } as unknown as SmsProvider;
const whatsapp = {
  name: 'test',
  send: async () => ({ messageId: 'x' }),
} as unknown as WhatsAppProvider;

async function stav(recipient: string): Promise<{ status: string; lastError: string | null }> {
  const [r] = await client`
    SELECT status, last_error FROM notifications
    WHERE tenant_id = ${tenantId} AND recipient = ${recipient}`;
  return { status: (r as { status: string }).status, lastError: r?.last_error ?? null };
}

describe('NotificationsWorker — zastaralé připomínky', () => {
  beforeAll(async () => {
    const [t] = await client`
      INSERT INTO tenants (slug, name, plan, status)
      VALUES (${znacka}, ${'Stale ' + znacka}, 'starter', 'active') RETURNING id`;
    tenantId = (t as { id: string }).id;
    const [b] = await client`
      INSERT INTO branches (tenant_id, name, slug) VALUES (${tenantId}, 'Praha', 'praha') RETURNING id`;
    const branchId = (b as { id: string }).id;
    const [c] = await client`
      INSERT INTO service_categories (tenant_id, name) VALUES (${tenantId}, 'Test') RETURNING id`;
    const [s] = await client`
      INSERT INTO services (tenant_id, category_id, name, duration_minutes, price_hellers, currency)
      VALUES (${tenantId}, ${(c as { id: string }).id}, 'Střih', 60, 50000, 'CZK') RETURNING id`;
    const serviceId = (s as { id: string }).id;

    const puvodni = '2027-05-10T08:00:00.000Z';
    const novy = '2027-05-12T08:00:00.000Z';
    const rezervace = [
      { kod: 'platna', ref: 'P', status: 'confirmed', start: puvodni },
      { kod: 'zrusena', ref: 'Z', status: 'cancelled', start: puvodni },
      { kod: 'presunuta', ref: 'R', status: 'confirmed', start: novy },
    ];
    for (const r of rezervace) {
      const konec = new Date(new Date(r.start).getTime() + 3600_000).toISOString();
      const [bk] = await client`
        INSERT INTO bookings (tenant_id, branch_id, service_id, customer_name, customer_email,
          starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, reference_code)
        VALUES (${tenantId}, ${branchId}, ${serviceId}, 'Jana', ${r.kod + '@e2e.local'},
          ${r.start}::timestamptz, ${konec}::timestamptz, ${r.start}::timestamptz,
          ${konec}::timestamptz, ${r.status}, ${'S-' + znacka.slice(-8) + r.ref})
        RETURNING id`;
      // Připomínka zralá k odeslání, naplánovaná pro PŮVODNÍ čas.
      await client`
        INSERT INTO notifications (tenant_id, channel, template_code, recipient, subject, body,
          related_booking_id, status, scheduled_at, metadata)
        VALUES (${tenantId}, 'email', 'booking_reminder', ${r.kod + '-' + znacka + '@e2e.local'},
          'Připomínka', 'Zítra máte termín', ${(bk as { id: string }).id}, 'pending',
          now() - interval '1 minute', ${JSON.stringify({ bookingStartsAt: puvodni })}::jsonb)`;
    }
  });

  afterAll(async () => {
    await client`DELETE FROM notifications WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM bookings WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM services WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM service_categories WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM branches WHERE tenant_id = ${tenantId}`;
    await client`DELETE FROM tenants WHERE id = ${tenantId}`;
    await client.end();
  });

  it('pošle jen platnou připomínku, ostatní označí jako zrušené', async () => {
    const worker = new NotificationsWorker(db, email, sms, whatsapp);
    // Fronta je sdílená s jinými testy — tick opakuj, dokud naše zprávy nezpracuje.
    for (let i = 0; i < 5; i++) {
      await worker.tick();
      if ((await stav(`platna-${znacka}@e2e.local`)).status !== 'pending') break;
    }

    expect(sent).toContain(`platna-${znacka}@e2e.local`);
    expect(await stav(`platna-${znacka}@e2e.local`)).toEqual({ status: 'sent', lastError: null });

    expect(sent).not.toContain(`zrusena-${znacka}@e2e.local`);
    expect(await stav(`zrusena-${znacka}@e2e.local`)).toEqual({
      status: 'cancelled',
      lastError: 'booking_cancelled',
    });

    expect(sent).not.toContain(`presunuta-${znacka}@e2e.local`);
    expect(await stav(`presunuta-${znacka}@e2e.local`)).toEqual({
      status: 'cancelled',
      lastError: 'booking_rescheduled',
    });
  });
});
