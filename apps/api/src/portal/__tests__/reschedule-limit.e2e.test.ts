// Integration test pro limit počtu přesunů (sprint 10.3).
// Mirror logiky PortalMeService.reschedule: počítá předchozí přesuny z
// booking_status_history (metadata->>'action' = 'rescheduled') a porovná s maxReschedules.
// Vyžaduje běžící Postgres (docker compose dev stack).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

const tenant1 = randomUUID();
const branch1 = randomUUID();
const customer1 = randomUUID();
const service1 = randomUUID();
const booking1 = randomUUID();
const actor = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') await tx.unsafe('SET LOCAL ROLE app_user');
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

/** Mirror: kolikrát už byla rezervace přesunuta. */
async function rescheduleCount(bookingId: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    return tx<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM booking_status_history
      WHERE booking_id = ${bookingId} AND metadata->>'action' = 'rescheduled'`;
  });
  return rows[0]?.n ?? -1;
}

/** Mirror rozhodnutí ze service: smí se přesunout? */
function canReschedule(priorCount: number, maxReschedules: number): boolean {
  return !(maxReschedules > 0 && priorCount >= maxReschedules);
}

async function addReschedule(bookingId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`INSERT INTO booking_status_history
      (tenant_id, booking_id, from_status, to_status, changed_by, reason, metadata)
      VALUES (${tenant1}, ${bookingId}, 'confirmed', 'confirmed', ${actor}, 'customer_reschedule',
        ${sql.json({ action: 'rescheduled', source: 'portal' })})`;
  });
}

describe('Reschedule limit (sprint 10.3, e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'rl-' + tenant1.slice(0, 8)}, 'RL Test')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branch1}, ${tenant1}, 'Praha', 'praha')`;
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email)
        VALUES (${customer1}, ${tenant1}, 'Jana', 'Test', ${'jana-' + customer1.slice(0, 8) + '@test.cz'})`;
      const catId = randomUUID();
      await tx`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenant1}, 'Test')`;
      await tx`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency)
        VALUES (${service1}, ${tenant1}, ${catId}, 'Lekce', 60, 30000, 'CZK')`;
      const s = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const e = new Date(s.getTime() + 60 * 60 * 1000);
      await tx`INSERT INTO bookings
        (id, tenant_id, branch_id, service_id, customer_id, customer_name, customer_email,
         starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, reference_code)
        VALUES (${booking1}, ${tenant1}, ${branch1}, ${service1}, ${customer1}, 'Jana', 'jana@test.cz',
         ${s}, ${e}, ${s}, ${e}, 'confirmed', 'B-RL-0001')`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM booking_status_history WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM bookings WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM services WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM service_categories WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customers WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM branches WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM tenants WHERE id = ${tenant1}`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM booking_status_history WHERE tenant_id = ${tenant1}`;
    });
  });

  it('počítá jen přesuny (metadata.action = rescheduled)', async () => {
    expect(await rescheduleCount(booking1)).toBe(0);
    await addReschedule(booking1);
    await addReschedule(booking1);
    expect(await rescheduleCount(booking1)).toBe(2);
  });

  it('limit 3: blokuje až po 3 přesunech', async () => {
    await addReschedule(booking1);
    await addReschedule(booking1);
    expect(canReschedule(await rescheduleCount(booking1), 3)).toBe(true); // 2 < 3
    await addReschedule(booking1);
    expect(canReschedule(await rescheduleCount(booking1), 3)).toBe(false); // 3 >= 3
  });

  it('maxReschedules = 0 znamená bez limitu', async () => {
    for (let i = 0; i < 5; i++) await addReschedule(booking1);
    expect(await rescheduleCount(booking1)).toBe(5);
    expect(canReschedule(5, 0)).toBe(true);
  });
});
