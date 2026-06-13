// Integration test pro CreditPacksService.deductForBooking + refund + penalty.
//
// Pouziva primy SQL pres postgres-js (stejny pattern jako rls.e2e.test.ts)
// abychom obesli Nest DI a testovali jen business logic v izolaci.
//
// Vyzaduje bezici Postgres (docker compose dev stack).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

// Test fixtures
const tenant1 = randomUUID();
const branch1 = randomUUID();
const branch2 = randomUUID();
const customer1 = randomUUID();
const customer2 = randomUUID();
const serviceEms = randomUUID();
const serviceMassage = randomUUID();
const serviceCardio = randomUUID();
const booking1 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

/** Zjednodusena verze CreditPacksService.deductForBooking v cistem SQL. */
async function deductForBooking(input: {
  tenantId: string;
  customerId: string;
  bookingId: string;
  serviceId: string;
  branchId: string;
}): Promise<{ allocationId: string; creditsDeducted: number } | null> {
  return await sql.begin(async (tx) => {
    await setCtx(tx, 'service', input.tenantId);

    const candidates = await tx<
      Array<{
        id: string;
        creditsRemaining: number;
        snapshotMode: string;
        snapshotAllowedServiceIds: string[];
        snapshotAllowedBranchIds: string[];
        snapshotCreditCosts: Record<string, number>;
      }>
    >`
      SELECT id,
        credits_remaining as "creditsRemaining",
        snapshot_mode as "snapshotMode",
        snapshot_allowed_service_ids as "snapshotAllowedServiceIds",
        snapshot_allowed_branch_ids as "snapshotAllowedBranchIds",
        snapshot_credit_costs as "snapshotCreditCosts"
      FROM customer_credit_packs
      WHERE tenant_id = ${input.tenantId}
        AND customer_id = ${input.customerId}
        AND status = 'active'
        AND credits_remaining > 0
        AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY valid_until ASC NULLS LAST
    `;

    // postgres-js vraci jsonb jako parsed value, ale safety check
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

    for (const alloc of candidates) {
      const allowedServices = parseJson<string[]>(alloc.snapshotAllowedServiceIds, []);
      const allowedBranches = parseJson<string[]>(alloc.snapshotAllowedBranchIds, []);
      const costs = parseJson<Record<string, number>>(alloc.snapshotCreditCosts, {});

      const serviceMatch =
        allowedServices.length === 0 || allowedServices.includes(input.serviceId);
      const branchMatch = allowedBranches.length === 0 || allowedBranches.includes(input.branchId);

      if (!serviceMatch || !branchMatch) continue;

      let cost = 1;
      if (alloc.snapshotMode === 'per_credit') {
        cost = costs[input.serviceId] ?? 1;
      }
      if (alloc.creditsRemaining < cost) continue;

      const newRemaining = alloc.creditsRemaining - cost;
      await tx`
        UPDATE customer_credit_packs
        SET credits_remaining = ${newRemaining},
            status = ${newRemaining === 0 ? 'used_up' : 'active'},
            updated_at = NOW()
        WHERE id = ${alloc.id}
      `;
      await tx`
        INSERT INTO credit_uses
          (tenant_id, customer_credit_pack_id, booking_id, credits_deducted, action)
        VALUES
          (${input.tenantId}, ${alloc.id}, ${input.bookingId}, ${cost}, 'consumed')
      `;
      return { allocationId: alloc.id, creditsDeducted: cost };
    }
    return null;
  });
}

async function refundForBooking(tenantId: string, bookingId: string): Promise<boolean> {
  return await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);

    const [originalUse] = await tx<
      Array<{ id: string; customerCreditPackId: string; creditsDeducted: number }>
    >`
      SELECT id, customer_credit_pack_id as "customerCreditPackId",
        credits_deducted as "creditsDeducted"
      FROM credit_uses
      WHERE tenant_id = ${tenantId}
        AND booking_id = ${bookingId}
        AND action = 'consumed'
      LIMIT 1
    `;
    if (!originalUse) return false;

    const [refundCheck] = await tx`
      SELECT id FROM credit_uses
      WHERE tenant_id = ${tenantId}
        AND booking_id = ${bookingId}
        AND action = 'refunded'
      LIMIT 1
    `;
    if (refundCheck) return false; // idempotence

    await tx`
      UPDATE customer_credit_packs
      SET credits_remaining = credits_remaining + ${originalUse.creditsDeducted},
          status = 'active',
          updated_at = NOW()
      WHERE id = ${originalUse.customerCreditPackId}
    `;
    await tx`
      INSERT INTO credit_uses
        (tenant_id, customer_credit_pack_id, booking_id, credits_deducted, action)
      VALUES
        (${tenantId}, ${originalUse.customerCreditPackId}, ${bookingId},
         ${-originalUse.creditsDeducted}, 'refunded')
    `;
    return true;
  });
}

async function getRemaining(tenantId: string, allocId: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    return tx<Array<{ credits_remaining: number }>>`
      SELECT credits_remaining FROM customer_credit_packs WHERE id = ${allocId}
    `;
  });
  return rows[0]?.credits_remaining ?? 0;
}

async function createPack(input: {
  id?: string;
  name: string;
  mode: 'per_visit' | 'per_credit';
  totalCredits: number;
  allowedServiceIds?: string[];
  allowedBranchIds?: string[];
  creditCosts?: Record<string, number>;
}): Promise<string> {
  const packId = input.id ?? randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      INSERT INTO credit_packs
        (id, tenant_id, name, mode, total_credits, price_hellers,
         allowed_service_ids, allowed_branch_ids, credit_costs_by_service, is_active)
      VALUES
        (${packId}, ${tenant1}, ${input.name}, ${input.mode}, ${input.totalCredits},
         0, ${sql.json(input.allowedServiceIds ?? [])},
         ${sql.json(input.allowedBranchIds ?? [])},
         ${sql.json(input.creditCosts ?? {})}, true)
    `;
  });
  return packId;
}

async function allocatePack(input: {
  packId: string;
  customerId: string;
  validUntil?: Date | null;
  initialCredits?: number;
}): Promise<string> {
  const allocId = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const [pack] = await tx<
      Array<{
        mode: string;
        total_credits: number;
        allowed_service_ids: string[];
        allowed_branch_ids: string[];
        credit_costs_by_service: Record<string, number>;
      }>
    >`SELECT mode, total_credits, allowed_service_ids, allowed_branch_ids,
        credit_costs_by_service FROM credit_packs WHERE id = ${input.packId}`;
    if (!pack) throw new Error('Pack not found');
    const credits = input.initialCredits ?? pack.total_credits;
    await tx`
      INSERT INTO customer_credit_packs
        (id, tenant_id, customer_id, credit_pack_id, credits_remaining,
         credits_at_purchase, snapshot_mode, snapshot_allowed_service_ids,
         snapshot_allowed_branch_ids, snapshot_credit_costs, valid_until,
         status, price_paid_hellers)
      VALUES
        (${allocId}, ${tenant1}, ${input.customerId}, ${input.packId},
         ${credits}, ${pack.total_credits}, ${pack.mode},
         ${sql.json(pack.allowed_service_ids)},
         ${sql.json(pack.allowed_branch_ids)},
         ${sql.json(pack.credit_costs_by_service)},
         ${input.validUntil ?? null}, 'active', 0)
    `;
  });
  return allocId;
}

describe('CreditPacks deduct/refund (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      // Tenant + branches
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'cp-test-' + tenant1.slice(0, 8)}, 'CP Test')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES
        (${branch1}, ${tenant1}, 'Praha', 'praha'),
        (${branch2}, ${tenant1}, 'Brno', 'brno')`;
      // Customers
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email) VALUES
        (${customer1}, ${tenant1}, 'Jana', 'Test', ${'jana-' + customer1.slice(0, 8) + '@test.cz'}),
        (${customer2}, ${tenant1}, 'Petr', 'Test', ${'petr-' + customer2.slice(0, 8) + '@test.cz'})`;
      // Services — potrebujeme service_categories nejdriv
      const catId = randomUUID();
      await tx`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenant1}, 'Test')`;
      await tx`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency) VALUES
        (${serviceEms}, ${tenant1}, ${catId}, 'EMS', 30, 50000, 'CZK'),
        (${serviceMassage}, ${tenant1}, ${catId}, 'Masáž', 60, 80000, 'CZK'),
        (${serviceCardio}, ${tenant1}, ${catId}, 'Cardio', 45, 60000, 'CZK')`;

      // Dummy booking pro FK constraint v credit_uses
      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
      await tx`INSERT INTO bookings
        (id, tenant_id, branch_id, service_id, customer_id, customer_name, customer_email,
         starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, price_paid_hellers,
         currency, reference_code)
        VALUES
        (${booking1}, ${tenant1}, ${branch1}, ${serviceEms}, ${customer1},
         'Test Booking', 'test@test.cz', ${startsAt}, ${endsAt},
         ${startsAt}, ${endsAt}, 'confirmed', 50000, 'CZK', 'B-TEST-0001')`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM credit_uses WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customer_credit_packs WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM credit_packs WHERE tenant_id = ${tenant1}`;
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
    // Cleanup credit packs + uses pred kazdym testem
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM credit_uses WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customer_credit_packs WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM credit_packs WHERE tenant_id = ${tenant1}`;
    });
  });

  describe('deductForBooking', () => {
    it('strhne 1 kredit per_visit balacku pri rezervaci', async () => {
      const packId = await createPack({ name: '10× EMS', mode: 'per_visit', totalCredits: 10 });
      const allocId = await allocatePack({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });

      expect(result).not.toBeNull();
      expect(result?.creditsDeducted).toBe(1);
      expect(await getRemaining(tenant1, allocId)).toBe(9);
    });

    it('per_credit mode pouzije creditCostsByService', async () => {
      const packId = await createPack({
        name: 'Mix',
        mode: 'per_credit',
        totalCredits: 50,
        creditCosts: { [serviceEms]: 1, [serviceMassage]: 3 },
      });
      const allocId = await allocatePack({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      expect(result?.creditsDeducted).toBe(3);
      expect(await getRemaining(tenant1, allocId)).toBe(47);
    });

    it('preskoci balicek pokud service neni v allowedServiceIds', async () => {
      // Balicek jen pro EMS
      const packId = await createPack({
        name: 'EMS only',
        mode: 'per_visit',
        totalCredits: 10,
        allowedServiceIds: [serviceEms],
      });
      await allocatePack({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage, // Massage neni allowed
        branchId: branch1,
      });

      expect(result).toBeNull();
    });

    it('preskoci balicek pokud branch neni v allowedBranchIds', async () => {
      const packId = await createPack({
        name: 'Praha only',
        mode: 'per_visit',
        totalCredits: 10,
        allowedBranchIds: [branch1],
      });
      await allocatePack({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch2, // Brno neni allowed
      });

      expect(result).toBeNull();
    });

    it('FIFO podle validUntil — nejdriv expirujici balicek jde prvni', async () => {
      const pack1 = await createPack({ name: 'Pack A', mode: 'per_visit', totalCredits: 5 });
      const pack2 = await createPack({ name: 'Pack B', mode: 'per_visit', totalCredits: 5 });

      // Pack A vyprsi za 30 dni
      const allocA = await allocatePack({
        packId: pack1,
        customerId: customer1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      // Pack B vyprsi za 90 dni
      const allocB = await allocatePack({
        packId: pack2,
        customerId: customer1,
        validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });

      expect(result?.allocationId).toBe(allocA); // Drive expirujici A
      expect(await getRemaining(tenant1, allocA)).toBe(4);
      expect(await getRemaining(tenant1, allocB)).toBe(5);
    });

    it('vrati null kdyz zakaznik nema zadny balicek', async () => {
      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });
      expect(result).toBeNull();
    });

    it('preskoci balicek s 0 kredity (used_up)', async () => {
      const packId = await createPack({ name: 'Used up', mode: 'per_visit', totalCredits: 10 });
      await allocatePack({ packId, customerId: customer1, initialCredits: 0 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });
      expect(result).toBeNull();
    });

    it('oznaci balicek jako used_up kdyz dosahne 0 po odpoctu', async () => {
      const packId = await createPack({ name: 'Last credit', mode: 'per_visit', totalCredits: 1 });
      const allocId = await allocatePack({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ status: string; credits_remaining: number }>>`
          SELECT status, credits_remaining FROM customer_credit_packs WHERE id = ${allocId}
        `;
      });
      expect(rows[0]?.status).toBe('used_up');
      expect(rows[0]?.credits_remaining).toBe(0);
    });
  });

  describe('refundForBooking', () => {
    it('vrati kredit pri zruseni rezervace', async () => {
      const packId = await createPack({ name: 'Pack', mode: 'per_visit', totalCredits: 10 });
      const allocId = await allocatePack({ packId, customerId: customer1 });

      // 1. Odepri
      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });
      expect(await getRemaining(tenant1, allocId)).toBe(9);

      // 2. Vrat
      const refunded = await refundForBooking(tenant1, booking1);
      expect(refunded).toBe(true);
      expect(await getRemaining(tenant1, allocId)).toBe(10);
    });

    it('idempotentni — druhy refund stejneho bookingu nedela nic', async () => {
      const packId = await createPack({ name: 'Pack', mode: 'per_visit', totalCredits: 10 });
      const allocId = await allocatePack({ packId, customerId: customer1 });
      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });

      const first = await refundForBooking(tenant1, booking1);
      const second = await refundForBooking(tenant1, booking1);

      expect(first).toBe(true);
      expect(second).toBe(false); // Refund uz existuje
      expect(await getRemaining(tenant1, allocId)).toBe(10); // Ne 11
    });

    it('vrati false kdyz neni co refundovat', async () => {
      const refunded = await refundForBooking(tenant1, booking1);
      expect(refunded).toBe(false);
    });
  });

  describe('Souběh a expirace (sprint 10.3)', () => {
    /** Mirror NOVÉ deductForBooking — se SELECT ... FOR UPDATE (row-lock). */
    async function deductLocked(bookingId: string): Promise<boolean> {
      return await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        const rows = await tx<Array<{ id: string; credits_remaining: number }>>`
          SELECT id, credits_remaining FROM customer_credit_packs
          WHERE tenant_id = ${tenant1} AND customer_id = ${customer1}
            AND status = 'active' AND credits_remaining > 0
          ORDER BY valid_until ASC NULLS LAST
          FOR UPDATE`;
        const c = rows[0];
        if (!c || c.credits_remaining < 1) return false;
        const newRemaining = c.credits_remaining - 1;
        await tx`UPDATE customer_credit_packs
          SET credits_remaining = ${newRemaining},
              status = ${newRemaining === 0 ? 'used_up' : 'active'}
          WHERE id = ${c.id}`;
        await tx`INSERT INTO credit_uses (tenant_id, customer_credit_pack_id, booking_id, credits_deducted, action)
          VALUES (${tenant1}, ${c.id}, ${bookingId}, 1, 'consumed')`;
        return true;
      });
    }

    it('row-lock zabrání dvojímu odečtu při souběhu (1 kredit, 2 rezervace naráz)', async () => {
      const packId = await createPack({ name: '1× EMS', mode: 'per_visit', totalCredits: 1 });
      const allocId = await allocatePack({ packId, customerId: customer1 });

      const [r1, r2] = await Promise.all([deductLocked(booking1), deductLocked(booking1)]);
      const successes = [r1, r2].filter(Boolean).length;

      expect(successes).toBe(1); // jen jedna rezervace strhla kredit
      expect(await getRemaining(tenant1, allocId)).toBe(0); // nikdy -1 (žádný double-spend)
    });

    it('refund NEoživí expirovaný balíček (status zůstane used_up)', async () => {
      const packId = await createPack({ name: 'Expired', mode: 'per_visit', totalCredits: 1 });
      // Balíček expirovaný (validUntil v minulosti), 0 kreditů, used_up + předchozí consumed use.
      const allocId = await allocatePack({
        packId,
        customerId: customer1,
        validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
        initialCredits: 0,
      });
      await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        await tx`UPDATE customer_credit_packs SET status = 'used_up' WHERE id = ${allocId}`;
        await tx`INSERT INTO credit_uses (tenant_id, customer_credit_pack_id, booking_id, credits_deducted, action)
          VALUES (${tenant1}, ${allocId}, ${booking1}, 1, 'consumed')`;
      });

      // Mirror NOVÉ refundForBooking — expirovaný se neaktivuje.
      await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        const [use] = await tx<Array<{ pid: string; cd: number }>>`
          SELECT customer_credit_pack_id AS pid, credits_deducted AS cd FROM credit_uses
          WHERE tenant_id = ${tenant1} AND booking_id = ${booking1} AND action = 'consumed' LIMIT 1`;
        const [a] = await tx<Array<{ vu: string | null }>>`
          SELECT valid_until AS vu FROM customer_credit_packs WHERE id = ${use!.pid} FOR UPDATE`;
        const isExpired = a!.vu != null && new Date(a!.vu).getTime() <= Date.now();
        if (isExpired) {
          await tx`UPDATE customer_credit_packs SET credits_remaining = credits_remaining + ${use!.cd} WHERE id = ${use!.pid}`;
        } else {
          await tx`UPDATE customer_credit_packs SET credits_remaining = credits_remaining + ${use!.cd}, status = 'active' WHERE id = ${use!.pid}`;
        }
      });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ status: string; credits_remaining: number }>>`
          SELECT status, credits_remaining FROM customer_credit_packs WHERE id = ${allocId}`;
      });
      expect(rows[0]?.status).toBe('used_up'); // NEoživeno na 'active'
      expect(rows[0]?.credits_remaining).toBe(1); // kredit se do evidence vrátil
    });
  });

  describe('Multi-tenant isolation', () => {
    it('jiny customer nedostane cizi balicky', async () => {
      const packId = await createPack({ name: 'C1 only', mode: 'per_visit', totalCredits: 10 });
      await allocatePack({ packId, customerId: customer1 });

      // Customer 2 nema zadny balicek
      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer2,
        bookingId: booking1,
        serviceId: serviceEms,
        branchId: branch1,
      });

      expect(result).toBeNull();
    });
  });
});
