// e2e test pro payments record/refund/QR flow.
// Pure SQL test bez NestJS DI — testuje SQL state transitions.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

const tenant1 = randomUUID();
const customer1 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

async function recordPayment(input: {
  customerId?: string;
  amountHellers: number;
  methodType: 'cash' | 'card_terminal' | 'qr_bank';
  description?: string;
}): Promise<string> {
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const status = input.methodType === 'qr_bank' ? 'pending' : 'succeeded';
    const paidAt = status === 'succeeded' ? new Date() : null;
    await tx`
      INSERT INTO payments
        (id, tenant_id, customer_id, amount_hellers, currency, method_type,
         status, description, paid_at)
      VALUES
        (${id}, ${tenant1}, ${input.customerId ?? null}, ${input.amountHellers}, 'CZK',
         ${input.methodType}, ${status}, ${input.description ?? null}, ${paidAt})
    `;
    await tx`
      INSERT INTO payment_events (tenant_id, payment_id, event_type, payload, verified)
      VALUES (${tenant1}, ${id}, 'manual_marked', ${sql.json({} as never)}, true)
    `;
  });
  return id;
}

async function markPaid(paymentId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      UPDATE payments
      SET status = 'succeeded', paid_at = NOW(), updated_at = NOW()
      WHERE id = ${paymentId} AND status = 'pending'
    `;
  });
}

async function refundPayment(paymentId: string): Promise<string> {
  const refundId = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const [orig] = await tx<
      Array<{
        amount_hellers: number;
        currency: string;
        method_type: string;
        customer_id: string | null;
      }>
    >`SELECT amount_hellers, currency, method_type, customer_id FROM payments WHERE id = ${paymentId}`;
    if (!orig) throw new Error('Payment not found');
    await tx`
      INSERT INTO payments
        (id, tenant_id, customer_id, amount_hellers, currency, method_type,
         status, refunded_from_payment_id, paid_at)
      VALUES
        (${refundId}, ${tenant1}, ${orig.customer_id}, ${-orig.amount_hellers},
         ${orig.currency}, ${orig.method_type}, 'refunded', ${paymentId}, NOW())
    `;
    await tx`UPDATE payments SET status='refunded', updated_at=NOW() WHERE id=${paymentId}`;
  });
  return refundId;
}

async function getPayment(id: string): Promise<{
  status: string;
  paid_at: Date | null;
  amount_hellers: number;
}> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    return tx<Array<{ status: string; paid_at: Date | null; amount_hellers: number }>>`
      SELECT status, paid_at, amount_hellers FROM payments WHERE id = ${id}
    `;
  });
  return rows[0]!;
}

describe('Payments record/refund (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'pay-test-' + tenant1.slice(0, 8)}, 'Payments Test')`;
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email) VALUES
        (${customer1}, ${tenant1}, 'Pay', 'Test', ${'pay-' + customer1.slice(0, 8) + '@test.cz'})`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM payment_events WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM payments WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customers WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM tenants WHERE id = ${tenant1}`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM payment_events WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM payments WHERE tenant_id = ${tenant1}`;
    });
  });

  describe('Manual record', () => {
    it('cash → status=succeeded + paid_at = now', async () => {
      const id = await recordPayment({
        customerId: customer1,
        amountHellers: 50000,
        methodType: 'cash',
      });
      const p = await getPayment(id);
      expect(p.status).toBe('succeeded');
      expect(p.paid_at).not.toBeNull();
      expect(p.amount_hellers).toBe(50000);
    });

    it('card_terminal → status=succeeded', async () => {
      const id = await recordPayment({
        customerId: customer1,
        amountHellers: 75000,
        methodType: 'card_terminal',
      });
      const p = await getPayment(id);
      expect(p.status).toBe('succeeded');
    });

    it('qr_bank → status=pending + paid_at=null', async () => {
      const id = await recordPayment({
        customerId: customer1,
        amountHellers: 30000,
        methodType: 'qr_bank',
      });
      const p = await getPayment(id);
      expect(p.status).toBe('pending');
      expect(p.paid_at).toBeNull();
    });

    it('vytvori payment_event pro audit', async () => {
      const id = await recordPayment({
        customerId: customer1,
        amountHellers: 100,
        methodType: 'cash',
      });
      const events = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ event_type: string }>>`
          SELECT event_type FROM payment_events WHERE payment_id = ${id}
        `;
      });
      expect(events.length).toBe(1);
      expect(events[0]?.event_type).toBe('manual_marked');
    });
  });

  describe('Mark QR as paid', () => {
    it('pending → succeeded po manual oznaceni', async () => {
      const id = await recordPayment({
        customerId: customer1,
        amountHellers: 50000,
        methodType: 'qr_bank',
      });
      const before = await getPayment(id);
      expect(before.status).toBe('pending');

      await markPaid(id);

      const after = await getPayment(id);
      expect(after.status).toBe('succeeded');
      expect(after.paid_at).not.toBeNull();
    });

    it('idempotentni — markPaid 2x neaktualizuje paid_at podruhe', async () => {
      const id = await recordPayment({
        customerId: customer1,
        amountHellers: 1000,
        methodType: 'qr_bank',
      });
      await markPaid(id);
      const first = await getPayment(id);
      const firstPaidAt = first.paid_at;

      // Try again — should be no-op because status != 'pending' anymore
      await markPaid(id);
      const second = await getPayment(id);
      expect(second.paid_at?.toISOString()).toBe(firstPaidAt?.toISOString());
    });
  });

  describe('Refund', () => {
    it('vytvori refund zaznam s zapornou castkou + oznaci original', async () => {
      const orig = await recordPayment({
        customerId: customer1,
        amountHellers: 50000,
        methodType: 'cash',
      });
      const refundId = await refundPayment(orig);

      const origAfter = await getPayment(orig);
      expect(origAfter.status).toBe('refunded');

      const refund = await getPayment(refundId);
      expect(refund.status).toBe('refunded');
      expect(refund.amount_hellers).toBe(-50000); // záporné
    });
  });
});
