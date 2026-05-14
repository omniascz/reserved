// Integration test pro TimePacksService.deductForBooking + refund + limity
// (sprint 3.3 fáze A2).
//
// Pouziva primy SQL pres postgres-js abychom obesli Nest DI a testovali
// jen business logic v izolaci. Vyzaduje bezici Postgres (docker compose).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

// Test fixtures
const tenant1 = randomUUID();
const tenant2 = randomUUID();
const branch1 = randomUUID();
const branch2 = randomUUID();
const customer1 = randomUUID();
const customer2 = randomUUID();
const serviceFitness = randomUUID();
const serviceYoga = randomUUID();
const booking1 = randomUUID();
const booking2 = randomUUID();
const booking3 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

const parseJson = <T>(val: unknown, fallback: T): T => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
};

function dayStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}
function dayEnd(d: Date): Date {
  const e = dayStart(d);
  e.setDate(e.getDate() + 1);
  return e;
}

/** Zjednodusena verze TimePacksService.deductForBooking v cistem SQL. */
async function deductForBooking(input: {
  tenantId: string;
  customerId: string;
  bookingId: string;
  serviceId: string;
  branchId: string;
  bookingStartsAt: Date;
}): Promise<{ allocationId: string; bookingsUsed: number } | null> {
  return await sql.begin(async (tx) => {
    await setCtx(tx, 'service', input.tenantId);

    const candidates = await tx<
      Array<{
        id: string;
        bookingsUsed: number;
        snapshotMaxBookingsPerPeriod: number | null;
        snapshotMaxBookingsPerDay: number | null;
        snapshotAllowedServiceIds: string[] | string;
        snapshotAllowedBranchIds: string[] | string;
      }>
    >`
      SELECT id,
        bookings_used as "bookingsUsed",
        snapshot_max_bookings_per_period as "snapshotMaxBookingsPerPeriod",
        snapshot_max_bookings_per_day as "snapshotMaxBookingsPerDay",
        snapshot_allowed_service_ids as "snapshotAllowedServiceIds",
        snapshot_allowed_branch_ids as "snapshotAllowedBranchIds"
      FROM customer_time_packs
      WHERE tenant_id = ${input.tenantId}
        AND customer_id = ${input.customerId}
        AND status = 'active'
        AND valid_until >= ${input.bookingStartsAt}
        AND valid_from <= ${input.bookingStartsAt}
      ORDER BY valid_until ASC
    `;

    for (const alloc of candidates) {
      const allowedServices = parseJson<string[]>(alloc.snapshotAllowedServiceIds, []);
      const allowedBranches = parseJson<string[]>(alloc.snapshotAllowedBranchIds, []);

      const serviceMatch =
        allowedServices.length === 0 || allowedServices.includes(input.serviceId);
      const branchMatch = allowedBranches.length === 0 || allowedBranches.includes(input.branchId);
      if (!serviceMatch || !branchMatch) continue;

      if (
        alloc.snapshotMaxBookingsPerPeriod !== null &&
        alloc.bookingsUsed >= alloc.snapshotMaxBookingsPerPeriod
      ) {
        continue;
      }

      if (alloc.snapshotMaxBookingsPerDay !== null) {
        const start = dayStart(input.bookingStartsAt);
        const end = dayEnd(input.bookingStartsAt);
        const dayRows = await tx<Array<{ usedToday: number }>>`
          SELECT COUNT(*)::int as "usedToday"
          FROM time_pack_uses
          WHERE customer_time_pack_id = ${alloc.id}
            AND action = 'consumed'
            AND usage_date >= ${start}
            AND usage_date < ${end}
        `;
        const usedToday = dayRows[0]?.usedToday ?? 0;
        if (usedToday >= alloc.snapshotMaxBookingsPerDay) continue;
      }

      const newUsed = alloc.bookingsUsed + 1;
      const becomesUsedUp =
        alloc.snapshotMaxBookingsPerPeriod !== null &&
        newUsed >= alloc.snapshotMaxBookingsPerPeriod;

      await tx`
        UPDATE customer_time_packs
        SET bookings_used = ${newUsed},
            status = ${becomesUsedUp ? 'used_up' : 'active'},
            updated_at = NOW()
        WHERE id = ${alloc.id}
      `;
      await tx`
        INSERT INTO time_pack_uses
          (tenant_id, customer_time_pack_id, booking_id, service_id, usage_date, action)
        VALUES
          (${input.tenantId}, ${alloc.id}, ${input.bookingId}, ${input.serviceId},
           ${input.bookingStartsAt}, 'consumed')
      `;
      return { allocationId: alloc.id, bookingsUsed: newUsed };
    }
    return null;
  });
}

async function refundForBooking(
  tenantId: string,
  bookingId: string,
): Promise<{ allocationId: string; bookingsUsed: number } | null> {
  return await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);

    const [originalUse] = await tx<Array<{ id: string; customerTimePackId: string }>>`
      SELECT id, customer_time_pack_id as "customerTimePackId"
      FROM time_pack_uses
      WHERE tenant_id = ${tenantId}
        AND booking_id = ${bookingId}
        AND action = 'consumed'
      LIMIT 1
    `;
    if (!originalUse) return null;

    const [refundCheck] = await tx`
      SELECT id FROM time_pack_uses
      WHERE tenant_id = ${tenantId}
        AND booking_id = ${bookingId}
        AND action = 'refunded'
      LIMIT 1
    `;
    if (refundCheck) return null;

    const [alloc] = await tx<
      Array<{ bookingsUsed: number; validUntil: Date }>
    >`SELECT bookings_used as "bookingsUsed", valid_until as "validUntil"
       FROM customer_time_packs WHERE id = ${originalUse.customerTimePackId}`;
    if (!alloc) return null;

    const newUsed = Math.max(0, alloc.bookingsUsed - 1);
    const stillValid = alloc.validUntil > new Date();

    await tx`
      UPDATE customer_time_packs
      SET bookings_used = ${newUsed},
          status = ${stillValid ? 'active' : sql`status`},
          updated_at = NOW()
      WHERE id = ${originalUse.customerTimePackId}
    `;
    await tx`
      INSERT INTO time_pack_uses
        (tenant_id, customer_time_pack_id, booking_id, service_id, usage_date, action)
      SELECT tenant_id, customer_time_pack_id, ${bookingId}, service_id,
        usage_date, 'refunded'
      FROM time_pack_uses
      WHERE id = ${originalUse.id}
    `;
    return { allocationId: originalUse.customerTimePackId, bookingsUsed: newUsed };
  });
}

async function getUsed(tenantId: string, allocId: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    return tx<Array<{ bookings_used: number }>>`
      SELECT bookings_used FROM customer_time_packs WHERE id = ${allocId}
    `;
  });
  return rows[0]?.bookings_used ?? 0;
}

async function getStatus(tenantId: string, allocId: string): Promise<string> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    return tx<Array<{ status: string }>>`
      SELECT status FROM customer_time_packs WHERE id = ${allocId}
    `;
  });
  return rows[0]?.status ?? '';
}

async function createTimePack(input: {
  name: string;
  durationDays: number;
  maxBookingsPerPeriod?: number | null;
  maxBookingsPerDay?: number | null;
  allowedServiceIds?: string[];
  allowedBranchIds?: string[];
}): Promise<string> {
  const packId = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      INSERT INTO time_packs
        (id, tenant_id, name, duration_days, max_bookings_per_period,
         max_bookings_per_day, allowed_service_ids, allowed_branch_ids,
         price_hellers, is_active)
      VALUES
        (${packId}, ${tenant1}, ${input.name}, ${input.durationDays},
         ${input.maxBookingsPerPeriod ?? null}, ${input.maxBookingsPerDay ?? null},
         ${sql.json(input.allowedServiceIds ?? [])},
         ${sql.json(input.allowedBranchIds ?? [])},
         0, true)
    `;
  });
  return packId;
}

async function allocateTimePack(input: {
  packId: string;
  customerId: string;
  validFrom?: Date;
  validUntil?: Date;
}): Promise<string> {
  const allocId = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const [pack] = await tx<
      Array<{
        duration_days: number;
        max_bookings_per_period: number | null;
        max_bookings_per_day: number | null;
        allowed_service_ids: string[] | string;
        allowed_branch_ids: string[] | string;
      }>
    >`SELECT duration_days, max_bookings_per_period, max_bookings_per_day,
        allowed_service_ids, allowed_branch_ids FROM time_packs WHERE id = ${input.packId}`;
    if (!pack) throw new Error('Pack not found');
    const from = input.validFrom ?? new Date();
    const until =
      input.validUntil ?? new Date(from.getTime() + pack.duration_days * 24 * 60 * 60 * 1000);
    await tx`
      INSERT INTO customer_time_packs
        (id, tenant_id, customer_id, time_pack_id,
         snapshot_max_bookings_per_period, snapshot_max_bookings_per_day,
         snapshot_allowed_service_ids, snapshot_allowed_branch_ids,
         bookings_used, valid_from, valid_until, status, price_paid_hellers)
      VALUES
        (${allocId}, ${tenant1}, ${input.customerId}, ${input.packId},
         ${pack.max_bookings_per_period}, ${pack.max_bookings_per_day},
         ${sql.json(parseJson<string[]>(pack.allowed_service_ids, []))},
         ${sql.json(parseJson<string[]>(pack.allowed_branch_ids, []))},
         0, ${from}, ${until}, 'active', 0)
    `;
  });
  return allocId;
}

describe('TimePacks deduct/refund (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES
        (${tenant1}, ${'tp-test-' + tenant1.slice(0, 8)}, 'TP Test 1'),
        (${tenant2}, ${'tp-test-' + tenant2.slice(0, 8)}, 'TP Test 2')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES
        (${branch1}, ${tenant1}, 'Praha', 'praha'),
        (${branch2}, ${tenant1}, 'Brno', 'brno')`;
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email) VALUES
        (${customer1}, ${tenant1}, 'Jana', 'Test', ${'jana-' + customer1.slice(0, 8) + '@test.cz'}),
        (${customer2}, ${tenant2}, 'Petr', 'Test', ${'petr-' + customer2.slice(0, 8) + '@test.cz'})`;
      const catId = randomUUID();
      await tx`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenant1}, 'Test')`;
      await tx`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency) VALUES
        (${serviceFitness}, ${tenant1}, ${catId}, 'Fitness lekce', 60, 20000, 'CZK'),
        (${serviceYoga}, ${tenant1}, ${catId}, 'Joga lekce', 60, 30000, 'CZK')`;

      // 3 bookings ve stejny den pro maxPerDay test
      const day = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      day.setHours(8, 0, 0, 0);
      const day2 = new Date(day.getTime() + 2 * 60 * 60 * 1000);
      const day3 = new Date(day.getTime() + 4 * 60 * 60 * 1000);
      for (const [id, startsAt] of [
        [booking1, day],
        [booking2, day2],
        [booking3, day3],
      ] as Array<[string, Date]>) {
        const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
        await tx`INSERT INTO bookings
          (id, tenant_id, branch_id, service_id, customer_id, customer_name, customer_email,
           starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, price_paid_hellers,
           currency, reference_code) VALUES
          (${id}, ${tenant1}, ${branch1}, ${serviceFitness}, ${customer1},
           'Test', 'test@test.cz', ${startsAt}, ${endsAt},
           ${startsAt}, ${endsAt}, 'confirmed', 20000, 'CZK', ${'B-TP-' + id.slice(0, 4)})`;
      }
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM time_pack_uses WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customer_time_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM time_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM bookings WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM services WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM service_categories WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customers WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM branches WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM tenants WHERE id IN (${tenant1}, ${tenant2})`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM time_pack_uses WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customer_time_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM time_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
    });
  });

  describe('deductForBooking', () => {
    it('strhne 1 pouziti pri rezervaci', async () => {
      const packId = await createTimePack({ name: '30 dni', durationDays: 30 });
      const allocId = await allocateTimePack({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      expect(result).not.toBeNull();
      expect(result?.bookingsUsed).toBe(1);
      expect(await getUsed(tenant1, allocId)).toBe(1);
    });

    it('vrati null pro neomezeny pack — ale zustane active po pouziti', async () => {
      const packId = await createTimePack({
        name: 'Unlimited',
        durationDays: 30,
        maxBookingsPerPeriod: null,
      });
      const allocId = await allocateTimePack({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      expect(await getStatus(tenant1, allocId)).toBe('active');
    });

    it('vrati null kdyz pack neni jeste platny (validFrom v budoucnu)', async () => {
      const packId = await createTimePack({ name: '30 dni', durationDays: 30 });
      const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await allocateTimePack({
        packId,
        customerId: customer1,
        validFrom: future,
        validUntil: new Date(future.getTime() + 30 * 24 * 60 * 60 * 1000),
      });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(), // ted, ale pack zacina za 30 dni
      });

      expect(result).toBeNull();
    });

    it('vrati null kdyz validUntil je pred bookingStartsAt', async () => {
      const packId = await createTimePack({ name: '30 dni', durationDays: 30 });
      const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await allocateTimePack({
        packId,
        customerId: customer1,
        validFrom: past,
        validUntil: new Date(past.getTime() + 30 * 24 * 60 * 60 * 1000),
      });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(),
      });

      expect(result).toBeNull();
    });

    it('vrati null kdyz dosahl maxBookingsPerPeriod', async () => {
      const packId = await createTimePack({
        name: 'Max 2',
        durationDays: 30,
        maxBookingsPerPeriod: 2,
      });
      const allocId = await allocateTimePack({ packId, customerId: customer1 });

      const time = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: time,
      });
      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking2,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: time,
      });

      expect(await getStatus(tenant1, allocId)).toBe('used_up');

      // 3. pokus vrati null
      const third = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking3,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: time,
      });
      expect(third).toBeNull();
    });

    it('respektuje maxBookingsPerDay — povoli 1 denne, blokuje 2.', async () => {
      const packId = await createTimePack({
        name: 'Max 1/den',
        durationDays: 30,
        maxBookingsPerDay: 1,
      });
      await allocateTimePack({ packId, customerId: customer1 });

      const time = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      time.setHours(8, 0, 0, 0);

      const first = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: time,
      });
      expect(first).not.toBeNull();

      const sameDay = new Date(time.getTime() + 4 * 60 * 60 * 1000);
      const second = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking2,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: sameDay,
      });
      expect(second).toBeNull(); // odmitnuto
    });

    it('preskoci pack kdyz service neni v allowedServiceIds', async () => {
      const packId = await createTimePack({
        name: 'Jen fitness',
        durationDays: 30,
        allowedServiceIds: [serviceFitness],
      });
      await allocateTimePack({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceYoga, // joga neni allowed
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      expect(result).toBeNull();
    });

    it('FIFO podle validUntil — driv expirujici dostane prednost', async () => {
      const packA = await createTimePack({ name: 'A', durationDays: 30 });
      const packB = await createTimePack({ name: 'B', durationDays: 30 });

      const allocA = await allocateTimePack({
        packId: packA,
        customerId: customer1,
        validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      });
      const allocB = await allocateTimePack({
        packId: packB,
        customerId: customer1,
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      expect(result?.allocationId).toBe(allocA);
      expect(await getUsed(tenant1, allocA)).toBe(1);
      expect(await getUsed(tenant1, allocB)).toBe(0);
    });
  });

  describe('refundForBooking', () => {
    it('dec counter pri zruseni booking', async () => {
      const packId = await createTimePack({
        name: '30 dni',
        durationDays: 30,
        maxBookingsPerPeriod: 5,
      });
      const allocId = await allocateTimePack({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      expect(await getUsed(tenant1, allocId)).toBe(1);

      const refund = await refundForBooking(tenant1, booking1);
      expect(refund).not.toBeNull();
      expect(refund?.bookingsUsed).toBe(0);
      expect(await getUsed(tenant1, allocId)).toBe(0);
    });

    it('idempotentni — druhy refund vrati null', async () => {
      const packId = await createTimePack({ name: 'Idem', durationDays: 30 });
      await allocateTimePack({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const first = await refundForBooking(tenant1, booking1);
      expect(first).not.toBeNull();

      const second = await refundForBooking(tenant1, booking1);
      expect(second).toBeNull();
    });

    it('vrati null kdyz neexistuje consumed entry', async () => {
      const refund = await refundForBooking(tenant1, booking1);
      expect(refund).toBeNull();
    });

    it('re-activates pack kdyz byl used_up', async () => {
      const packId = await createTimePack({
        name: 'Max 1',
        durationDays: 30,
        maxBookingsPerPeriod: 1,
      });
      const allocId = await allocateTimePack({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceFitness,
        branchId: branch1,
        bookingStartsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      expect(await getStatus(tenant1, allocId)).toBe('used_up');

      await refundForBooking(tenant1, booking1);
      expect(await getStatus(tenant1, allocId)).toBe('active');
    });
  });

  describe('RLS isolation', () => {
    it('tenant nevidi time-packs cizich tenantu', async () => {
      const packId = await createTimePack({ name: 'Tenant 1 only', durationDays: 30 });
      await allocateTimePack({ packId, customerId: customer1 });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'admin', tenant2);
        return tx<Array<{ id: string }>>`
          SELECT id FROM time_packs WHERE name = 'Tenant 1 only'
        `;
      });
      expect(rows.length).toBe(0);
    });
  });
});
