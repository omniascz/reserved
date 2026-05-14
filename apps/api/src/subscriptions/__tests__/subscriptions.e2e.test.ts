// Integration test pro subscription DB layer + webhook idempotence
// (sprint 3.3 fáze A3).
//
// Pouziva primy SQL pres postgres-js. Testuje:
//  - vytvareni plans + customer_subscriptions
//  - webhook event idempotence (UNIQUE(tenantId, stripeEventId))
//  - status transitions (incomplete -> active -> past_due -> canceled)
//  - RLS isolation
//
// Stripe API calls (createPrice, createSession, subscriptions.update) jsou
// testovany manualne se Stripe CLI / sandbox — nejsou v e2e.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

const tenant1 = randomUUID();
const tenant2 = randomUUID();
const customer1 = randomUUID();
const customer2 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

type Benefits = {
  discountPercent?: number;
  priorityAccess?: boolean;
  freeCreditsPerPeriod?: number;
  exclusiveServiceIds?: string[];
};

async function createPlan(input: {
  tenantId?: string;
  name: string;
  billingInterval: string;
  priceHellers: number;
  benefits?: Benefits;
}): Promise<string> {
  const planId = randomUUID();
  const tenantId = input.tenantId ?? tenant1;
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenantId);
    await tx`
      INSERT INTO subscription_plans
        (id, tenant_id, name, billing_interval, price_hellers, currency,
         trial_days, benefits, is_active)
      VALUES
        (${planId}, ${tenantId}, ${input.name}, ${input.billingInterval},
         ${input.priceHellers}, 'CZK', 0,
         ${sql.json(input.benefits ?? {})}, true)
    `;
  });
  return planId;
}

async function createSubscription(input: {
  planId: string;
  customerId: string;
  stripeSubId?: string;
  status?: string;
}): Promise<string> {
  const subId = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const [plan] = await tx<
      Array<{
        billing_interval: string;
        price_hellers: number;
        benefits: Benefits | string;
      }>
    >`SELECT billing_interval, price_hellers, benefits
       FROM subscription_plans WHERE id = ${input.planId}`;
    if (!plan) throw new Error('Plan not found');
    const benefits: Benefits =
      typeof plan.benefits === 'string' ? (JSON.parse(plan.benefits) as Benefits) : plan.benefits;
    await tx`
      INSERT INTO customer_subscriptions
        (id, tenant_id, customer_id, plan_id, stripe_subscription_id, status,
         snapshot_benefits, snapshot_billing_interval, snapshot_price_hellers)
      VALUES
        (${subId}, ${tenant1}, ${input.customerId}, ${input.planId},
         ${input.stripeSubId ?? null}, ${input.status ?? 'incomplete'},
         ${sql.json(benefits)}, ${plan.billing_interval}, ${plan.price_hellers})
    `;
  });
  return subId;
}

async function insertEvent(input: {
  tenantId: string;
  customerSubscriptionId: string | null;
  stripeEventId: string;
  eventType: string;
}): Promise<boolean> {
  try {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service', input.tenantId);
      await tx`
        INSERT INTO subscription_events
          (tenant_id, customer_subscription_id, stripe_event_id, event_type, payload)
        VALUES
          (${input.tenantId}, ${input.customerSubscriptionId}, ${input.stripeEventId},
           ${input.eventType}, ${sql.json({})})
      `;
    });
    return true;
  } catch (e) {
    if (e instanceof Error && /unique/i.test(e.message)) return false;
    throw e;
  }
}

async function updateStatus(subId: string, status: string): Promise<void> {
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      UPDATE customer_subscriptions
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${subId}
    `;
  });
}

async function getStatus(subId: string): Promise<string> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    return tx<Array<{ status: string }>>`
      SELECT status FROM customer_subscriptions WHERE id = ${subId}
    `;
  });
  return rows[0]?.status ?? '';
}

describe('Subscriptions DB + webhook idempotence (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES
        (${tenant1}, ${'sub-test-' + tenant1.slice(0, 8)}, 'Sub Test 1'),
        (${tenant2}, ${'sub-test-' + tenant2.slice(0, 8)}, 'Sub Test 2')`;
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email) VALUES
        (${customer1}, ${tenant1}, 'Jana', 'Test', ${'jana-' + customer1.slice(0, 8) + '@test.cz'}),
        (${customer2}, ${tenant2}, 'Petr', 'Test', ${'petr-' + customer2.slice(0, 8) + '@test.cz'})`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM subscription_events WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customer_subscriptions WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM subscription_plans WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customers WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM tenants WHERE id IN (${tenant1}, ${tenant2})`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM subscription_events WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM customer_subscriptions WHERE tenant_id IN (${tenant1}, ${tenant2})`;
      await tx`DELETE FROM subscription_plans WHERE tenant_id IN (${tenant1}, ${tenant2})`;
    });
  });

  describe('plan CRUD', () => {
    it('vytvori plan + benefits jsonb', async () => {
      const planId = await createPlan({
        name: 'VIP',
        billingInterval: 'monthly',
        priceHellers: 49900,
        benefits: {
          discountPercent: 20,
          priorityAccess: true,
        },
      });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ name: string; price_hellers: number; benefits: Benefits | string }>>`
          SELECT name, price_hellers, benefits FROM subscription_plans WHERE id = ${planId}
        `;
      });
      expect(rows.length).toBe(1);
      expect(rows[0]!.name).toBe('VIP');
      expect(rows[0]!.price_hellers).toBe(49900);
      const b: Benefits =
        typeof rows[0]!.benefits === 'string'
          ? (JSON.parse(rows[0]!.benefits) as Benefits)
          : rows[0]!.benefits;
      expect(b.discountPercent).toBe(20);
      expect(b.priorityAccess).toBe(true);
    });

    it('soft delete = deleted_at', async () => {
      const planId = await createPlan({
        name: 'Old',
        billingInterval: 'yearly',
        priceHellers: 500000,
      });
      await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        await tx`UPDATE subscription_plans SET deleted_at = NOW() WHERE id = ${planId}`;
      });
      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ deleted_at: Date | null }>>`
          SELECT deleted_at FROM subscription_plans WHERE id = ${planId}
        `;
      });
      expect(rows[0]!.deleted_at).not.toBeNull();
    });
  });

  describe('subscription instance', () => {
    it('vytvori subscription se snapshot benefits', async () => {
      const planId = await createPlan({
        name: 'Premium',
        billingInterval: 'monthly',
        priceHellers: 99900,
        benefits: { discountPercent: 25 },
      });
      const subId = await createSubscription({ planId, customerId: customer1 });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<
          Array<{
            status: string;
            snapshot_billing_interval: string;
            snapshot_price_hellers: number;
            snapshot_benefits: Benefits | string;
          }>
        >`SELECT status, snapshot_billing_interval, snapshot_price_hellers, snapshot_benefits
           FROM customer_subscriptions WHERE id = ${subId}`;
      });
      expect(rows[0]!.status).toBe('incomplete');
      expect(rows[0]!.snapshot_billing_interval).toBe('monthly');
      expect(rows[0]!.snapshot_price_hellers).toBe(99900);
      const b: Benefits =
        typeof rows[0]!.snapshot_benefits === 'string'
          ? (JSON.parse(rows[0]!.snapshot_benefits) as Benefits)
          : rows[0]!.snapshot_benefits;
      expect(b.discountPercent).toBe(25);
    });

    it('status transitions: incomplete -> active -> past_due -> canceled', async () => {
      const planId = await createPlan({
        name: 'X',
        billingInterval: 'monthly',
        priceHellers: 10000,
      });
      const subId = await createSubscription({ planId, customerId: customer1 });

      expect(await getStatus(subId)).toBe('incomplete');
      await updateStatus(subId, 'active');
      expect(await getStatus(subId)).toBe('active');
      await updateStatus(subId, 'past_due');
      expect(await getStatus(subId)).toBe('past_due');
      await updateStatus(subId, 'canceled');
      expect(await getStatus(subId)).toBe('canceled');
    });
  });

  describe('webhook idempotence', () => {
    it('UNIQUE(tenant_id, stripe_event_id) blokuje duplicitni event', async () => {
      const planId = await createPlan({
        name: 'X',
        billingInterval: 'monthly',
        priceHellers: 10000,
      });
      const subId = await createSubscription({ planId, customerId: customer1 });

      const first = await insertEvent({
        tenantId: tenant1,
        customerSubscriptionId: subId,
        stripeEventId: 'evt_test_001',
        eventType: 'customer.subscription.updated',
      });
      expect(first).toBe(true);

      const second = await insertEvent({
        tenantId: tenant1,
        customerSubscriptionId: subId,
        stripeEventId: 'evt_test_001',
        eventType: 'customer.subscription.updated',
      });
      expect(second).toBe(false); // unique violation
    });

    it('stejne event ID napric tenantu OK (multi-tenant)', async () => {
      const planA = await createPlan({
        name: 'A',
        billingInterval: 'monthly',
        priceHellers: 1000,
      });
      const planB = await createPlan({
        tenantId: tenant2,
        name: 'B',
        billingInterval: 'monthly',
        priceHellers: 2000,
      });
      const subA = await createSubscription({ planId: planA, customerId: customer1 });

      // V tenant1 to projde
      const first = await insertEvent({
        tenantId: tenant1,
        customerSubscriptionId: subA,
        stripeEventId: 'evt_dup_001',
        eventType: 'invoice.payment_succeeded',
      });
      expect(first).toBe(true);

      // V tenant2 se stejnym ID — protoze UNIQUE je per-tenant, taky projde
      const second = await insertEvent({
        tenantId: tenant2,
        customerSubscriptionId: null,
        stripeEventId: 'evt_dup_001',
        eventType: 'invoice.payment_succeeded',
      });
      expect(second).toBe(true);
    });
  });

  describe('RLS isolation', () => {
    it('tenant nevidi plans cizich tenantu', async () => {
      await createPlan({ name: 'Tenant 1 only', billingInterval: 'monthly', priceHellers: 100 });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'admin', tenant2);
        return tx<Array<{ id: string }>>`
          SELECT id FROM subscription_plans WHERE name = 'Tenant 1 only'
        `;
      });
      expect(rows.length).toBe(0);
    });

    it('tenant nevidi subscriptions cizich tenantu', async () => {
      const planId = await createPlan({
        name: 'X',
        billingInterval: 'monthly',
        priceHellers: 100,
      });
      await createSubscription({ planId, customerId: customer1 });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'admin', tenant2);
        return tx<Array<{ id: string }>>`
          SELECT id FROM customer_subscriptions
        `;
      });
      expect(rows.length).toBe(0);
    });
  });
});
