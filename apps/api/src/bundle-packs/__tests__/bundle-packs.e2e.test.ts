// Integration test pro BundlePacksService.deductForBooking + refund (sprint 3.3 fáze A1).
//
// Pouziva primy SQL pres postgres-js (stejny pattern jako credit-packs.e2e.test.ts)
// abychom obesli Nest DI a testovali jen business logic v izolaci.
//
// Vyzaduje bezici Postgres (docker compose dev stack).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

type BundleItem = { serviceId: string; quantity: number };

// Test fixtures
const tenant1 = randomUUID();
const tenant2 = randomUUID();
const branch1 = randomUUID();
const branch2 = randomUUID();
const customer1 = randomUUID();
const customer2 = randomUUID();
const serviceMassage = randomUUID();
const serviceManicure = randomUUID();
const serviceWrap = randomUUID();
const booking1 = randomUUID();
const booking2 = randomUUID();

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

function totalRemaining(items: BundleItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

/** Zjednodusena verze BundlePacksService.deductForBooking v cistem SQL. */
async function deductForBooking(input: {
  tenantId: string;
  customerId: string;
  bookingId: string;
  serviceId: string;
  branchId: string;
}): Promise<{ allocationId: string; serviceId: string; quantityDeducted: number } | null> {
  return await sql.begin(async (tx) => {
    await setCtx(tx, 'service', input.tenantId);

    const candidates = await tx<
      Array<{
        id: string;
        itemsRemaining: BundleItem[] | string;
        snapshotAllowedBranchIds: string[] | string;
      }>
    >`
      SELECT id,
        items_remaining as "itemsRemaining",
        snapshot_allowed_branch_ids as "snapshotAllowedBranchIds"
      FROM customer_bundle_packs
      WHERE tenant_id = ${input.tenantId}
        AND customer_id = ${input.customerId}
        AND status = 'active'
        AND (valid_until IS NULL OR valid_until > NOW())
      ORDER BY valid_until ASC NULLS LAST
    `;

    for (const alloc of candidates) {
      const items = parseJson<BundleItem[]>(alloc.itemsRemaining, []);
      const allowedBranches = parseJson<string[]>(alloc.snapshotAllowedBranchIds, []);

      const idx = items.findIndex((i) => i.serviceId === input.serviceId && i.quantity > 0);
      if (idx === -1) continue;

      const branchMatch = allowedBranches.length === 0 || allowedBranches.includes(input.branchId);
      if (!branchMatch) continue;

      items[idx] = { serviceId: input.serviceId, quantity: items[idx]!.quantity - 1 };
      const newTotal = totalRemaining(items);

      await tx`
        UPDATE customer_bundle_packs
        SET items_remaining = ${sql.json(items)},
            status = ${newTotal === 0 ? 'used_up' : 'active'},
            updated_at = NOW()
        WHERE id = ${alloc.id}
      `;
      await tx`
        INSERT INTO bundle_item_uses
          (tenant_id, customer_bundle_pack_id, booking_id, service_id, quantity_deducted, action)
        VALUES
          (${input.tenantId}, ${alloc.id}, ${input.bookingId}, ${input.serviceId}, 1, 'consumed')
      `;
      return { allocationId: alloc.id, serviceId: input.serviceId, quantityDeducted: 1 };
    }
    return null;
  });
}

async function refundForBooking(
  tenantId: string,
  bookingId: string,
): Promise<{ allocationId: string; serviceId: string } | null> {
  return await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);

    const [originalUse] = await tx<
      Array<{
        id: string;
        customerBundlePackId: string;
        serviceId: string;
        quantityDeducted: number;
      }>
    >`
      SELECT id, customer_bundle_pack_id as "customerBundlePackId",
        service_id as "serviceId",
        quantity_deducted as "quantityDeducted"
      FROM bundle_item_uses
      WHERE tenant_id = ${tenantId}
        AND booking_id = ${bookingId}
        AND action = 'consumed'
      LIMIT 1
    `;
    if (!originalUse) return null;

    const [refundCheck] = await tx`
      SELECT id FROM bundle_item_uses
      WHERE tenant_id = ${tenantId}
        AND booking_id = ${bookingId}
        AND action = 'refunded'
      LIMIT 1
    `;
    if (refundCheck) return null;

    const [alloc] = await tx<Array<{ itemsRemaining: BundleItem[] | string }>>`
      SELECT items_remaining as "itemsRemaining"
      FROM customer_bundle_packs WHERE id = ${originalUse.customerBundlePackId}
    `;
    if (!alloc) return null;

    const items = parseJson<BundleItem[]>(alloc.itemsRemaining, []);
    const idx = items.findIndex((i) => i.serviceId === originalUse.serviceId);
    if (idx === -1) {
      items.push({
        serviceId: originalUse.serviceId,
        quantity: originalUse.quantityDeducted,
      });
    } else {
      items[idx] = {
        serviceId: originalUse.serviceId,
        quantity: items[idx]!.quantity + originalUse.quantityDeducted,
      };
    }

    await tx`
      UPDATE customer_bundle_packs
      SET items_remaining = ${sql.json(items)},
          status = 'active',
          updated_at = NOW()
      WHERE id = ${originalUse.customerBundlePackId}
    `;
    await tx`
      INSERT INTO bundle_item_uses
        (tenant_id, customer_bundle_pack_id, booking_id, service_id, quantity_deducted, action)
      VALUES
        (${tenantId}, ${originalUse.customerBundlePackId}, ${bookingId},
         ${originalUse.serviceId}, ${-originalUse.quantityDeducted}, 'refunded')
    `;
    return { allocationId: originalUse.customerBundlePackId, serviceId: originalUse.serviceId };
  });
}

async function getItems(tenantId: string, allocId: string): Promise<BundleItem[]> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    return tx<Array<{ items_remaining: BundleItem[] | string }>>`
      SELECT items_remaining FROM customer_bundle_packs WHERE id = ${allocId}
    `;
  });
  return parseJson<BundleItem[]>(rows[0]?.items_remaining, []);
}

async function getStatus(tenantId: string, allocId: string): Promise<string> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    return tx<Array<{ status: string }>>`
      SELECT status FROM customer_bundle_packs WHERE id = ${allocId}
    `;
  });
  return rows[0]?.status ?? '';
}

async function createBundlePack(input: {
  id?: string;
  tenantId?: string;
  name: string;
  items: BundleItem[];
  allowedBranchIds?: string[];
}): Promise<string> {
  const packId = input.id ?? randomUUID();
  const tenantId = input.tenantId ?? tenant1;
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    await tx`
      INSERT INTO bundle_packs
        (id, tenant_id, name, items, price_hellers,
         allowed_branch_ids, same_visit_required, is_active)
      VALUES
        (${packId}, ${tenantId}, ${input.name}, ${sql.json(input.items)},
         0, ${sql.json(input.allowedBranchIds ?? [])}, false, true)
    `;
  });
  return packId;
}

async function allocateBundle(input: {
  packId: string;
  customerId: string;
  tenantId?: string;
  validUntil?: Date | null;
  initialItems?: BundleItem[];
}): Promise<string> {
  const allocId = randomUUID();
  const tenantId = input.tenantId ?? tenant1;
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    const [pack] = await tx<
      Array<{ items: BundleItem[] | string; allowed_branch_ids: string[] | string }>
    >`SELECT items, allowed_branch_ids FROM bundle_packs WHERE id = ${input.packId}`;
    if (!pack) throw new Error('Bundle pack not found');
    const snapshotItems = parseJson<BundleItem[]>(pack.items, []);
    const snapshotBranches = parseJson<string[]>(pack.allowed_branch_ids, []);
    const remaining = input.initialItems ?? snapshotItems.map((i) => ({ ...i }));
    await tx`
      INSERT INTO customer_bundle_packs
        (id, tenant_id, customer_id, bundle_pack_id, items_remaining,
         snapshot_items, snapshot_allowed_branch_ids, snapshot_same_visit_required,
         valid_until, status, price_paid_hellers)
      VALUES
        (${allocId}, ${tenantId}, ${input.customerId}, ${input.packId},
         ${sql.json(remaining)}, ${sql.json(snapshotItems)},
         ${sql.json(snapshotBranches)}, false,
         ${input.validUntil ?? null}, 'active', 0)
    `;
  });
  return allocId;
}

describe('BundlePacks deduct/refund (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      // Dva tenanti pro RLS isolation test
      await tx`INSERT INTO tenants (id, slug, name) VALUES
        (${tenant1}, ${'bp-test-' + tenant1.slice(0, 8)}, 'BP Test 1'),
        (${tenant2}, ${'bp-test-' + tenant2.slice(0, 8)}, 'BP Test 2')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES
        (${branch1}, ${tenant1}, 'Praha', 'praha'),
        (${branch2}, ${tenant1}, 'Brno', 'brno')`;
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email) VALUES
        (${customer1}, ${tenant1}, 'Jana', 'Test', ${'jana-' + customer1.slice(0, 8) + '@test.cz'}),
        (${customer2}, ${tenant2}, 'Petr', 'Test', ${'petr-' + customer2.slice(0, 8) + '@test.cz'})`;
      const catId = randomUUID();
      await tx`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenant1}, 'Test')`;
      await tx`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency) VALUES
        (${serviceMassage}, ${tenant1}, ${catId}, 'Masáž', 60, 80000, 'CZK'),
        (${serviceManicure}, ${tenant1}, ${catId}, 'Manikúra', 45, 40000, 'CZK'),
        (${serviceWrap}, ${tenant1}, ${catId}, 'Zábal', 30, 60000, 'CZK')`;

      const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
      await tx`INSERT INTO bookings
        (id, tenant_id, branch_id, service_id, customer_id, customer_name, customer_email,
         starts_at, ends_at, buffer_starts_at, buffer_ends_at, status, price_paid_hellers,
         currency, reference_code) VALUES
        (${booking1}, ${tenant1}, ${branch1}, ${serviceMassage}, ${customer1},
         'Test', 'test@test.cz', ${startsAt}, ${endsAt},
         ${startsAt}, ${endsAt}, 'confirmed', 80000, 'CZK', 'B-BP-0001'),
        (${booking2}, ${tenant1}, ${branch1}, ${serviceManicure}, ${customer1},
         'Test', 'test@test.cz', ${startsAt}, ${endsAt},
         ${startsAt}, ${endsAt}, 'confirmed', 40000, 'CZK', 'B-BP-0002')`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM bundle_item_uses WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customer_bundle_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM bundle_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
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
      await tx`DELETE FROM bundle_item_uses WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customer_bundle_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM bundle_packs WHERE tenant_id IN (${tenant1}, ${tenant2})`;
    });
  });

  describe('deductForBooking', () => {
    it('strhne 1 ks polozky pri rezervaci', async () => {
      const packId = await createBundlePack({
        name: 'Relax',
        items: [
          { serviceId: serviceMassage, quantity: 1 },
          { serviceId: serviceManicure, quantity: 1 },
          { serviceId: serviceWrap, quantity: 1 },
        ],
      });
      const allocId = await allocateBundle({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      expect(result).not.toBeNull();
      expect(result?.serviceId).toBe(serviceMassage);
      expect(result?.quantityDeducted).toBe(1);

      const items = await getItems(tenant1, allocId);
      expect(items.find((i) => i.serviceId === serviceMassage)?.quantity).toBe(0);
      expect(items.find((i) => i.serviceId === serviceManicure)?.quantity).toBe(1);
    });

    it('vrati null kdyz sluzba neni v bundle', async () => {
      const packId = await createBundlePack({
        name: 'Bez zábalu',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      await allocateBundle({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking2,
        serviceId: serviceManicure,
        branchId: branch1,
      });

      expect(result).toBeNull();
    });

    it('vrati null kdyz polozka ma 0 ks', async () => {
      const packId = await createBundlePack({
        name: 'Vyčerpaný',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      await allocateBundle({
        packId,
        customerId: customer1,
        initialItems: [{ serviceId: serviceMassage, quantity: 0 }],
      });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      expect(result).toBeNull();
    });

    it('preskoci bundle kdyz branch neni allowed', async () => {
      const packId = await createBundlePack({
        name: 'Praha only',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
        allowedBranchIds: [branch1],
      });
      await allocateBundle({ packId, customerId: customer1 });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch2,
      });

      expect(result).toBeNull();
    });

    it('FIFO podle validUntil — driv expirujici bundle ma prednost', async () => {
      const packA = await createBundlePack({
        name: 'A',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      const packB = await createBundlePack({
        name: 'B',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });

      const allocA = await allocateBundle({
        packId: packA,
        customerId: customer1,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const allocB = await allocateBundle({
        packId: packB,
        customerId: customer1,
        validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      const result = await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      expect(result?.allocationId).toBe(allocA);
      const itemsA = await getItems(tenant1, allocA);
      const itemsB = await getItems(tenant1, allocB);
      expect(itemsA.find((i) => i.serviceId === serviceMassage)?.quantity).toBe(0);
      expect(itemsB.find((i) => i.serviceId === serviceMassage)?.quantity).toBe(1);
    });

    it('oznaci bundle jako used_up kdyz total kvanitita = 0', async () => {
      const packId = await createBundlePack({
        name: 'Single',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      const allocId = await allocateBundle({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      expect(await getStatus(tenant1, allocId)).toBe('used_up');
    });

    it('zustane active kdyz jine polozky maji jeste kvantitu', async () => {
      const packId = await createBundlePack({
        name: 'Multi',
        items: [
          { serviceId: serviceMassage, quantity: 1 },
          { serviceId: serviceManicure, quantity: 1 },
        ],
      });
      const allocId = await allocateBundle({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      expect(await getStatus(tenant1, allocId)).toBe('active');
    });
  });

  describe('refundForBooking', () => {
    it('vrati 1 ks pri zruseni booking', async () => {
      const packId = await createBundlePack({
        name: 'Relax',
        items: [
          { serviceId: serviceMassage, quantity: 2 },
          { serviceId: serviceManicure, quantity: 1 },
        ],
      });
      const allocId = await allocateBundle({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      const itemsBefore = await getItems(tenant1, allocId);
      expect(itemsBefore.find((i) => i.serviceId === serviceMassage)?.quantity).toBe(1);

      const refund = await refundForBooking(tenant1, booking1);
      expect(refund).not.toBeNull();
      expect(refund?.serviceId).toBe(serviceMassage);

      const itemsAfter = await getItems(tenant1, allocId);
      expect(itemsAfter.find((i) => i.serviceId === serviceMassage)?.quantity).toBe(2);
    });

    it('vrati null kdyz neexistuje consumed entry', async () => {
      const refund = await refundForBooking(tenant1, booking1);
      expect(refund).toBeNull();
    });

    it('idempotentni — druhy refund vrati null', async () => {
      const packId = await createBundlePack({
        name: 'Idem',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      await allocateBundle({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });

      const first = await refundForBooking(tenant1, booking1);
      expect(first).not.toBeNull();

      const second = await refundForBooking(tenant1, booking1);
      expect(second).toBeNull();
    });

    it('re-activates bundle kdyz byl used_up', async () => {
      const packId = await createBundlePack({
        name: 'Single',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      const allocId = await allocateBundle({ packId, customerId: customer1 });

      await deductForBooking({
        tenantId: tenant1,
        customerId: customer1,
        bookingId: booking1,
        serviceId: serviceMassage,
        branchId: branch1,
      });
      expect(await getStatus(tenant1, allocId)).toBe('used_up');

      await refundForBooking(tenant1, booking1);
      expect(await getStatus(tenant1, allocId)).toBe('active');
    });
  });

  describe('RLS isolation', () => {
    it('tenant nevidi bundles cizich tenantu', async () => {
      // Vytvor bundle pro tenant1
      const packId = await createBundlePack({
        name: 'Tenant 1 only',
        items: [{ serviceId: serviceMassage, quantity: 1 }],
      });
      await allocateBundle({ packId, customerId: customer1 });

      // Pres app_user pod tenant2 by mel vratit prazdny vysledek
      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'admin', tenant2);
        return tx<Array<{ id: string }>>`
          SELECT id FROM bundle_packs WHERE name = 'Tenant 1 only'
        `;
      });
      expect(rows.length).toBe(0);
    });
  });
});
