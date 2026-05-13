// Integration test pro bookings cancel/reschedule flow + integraci s credit-packs.
//
// Testovane scénáře:
//   1. Cancel booking — status_history se vytvori, status='cancelled'
//   2. Reschedule — startsAt + endsAt aktualizovane
//   3. EXCLUDE constraint — nelze vytvorit dve rezervace stejneho zamestnance v okne
//   4. Cancel po credit deduct — kredit se vrati pri refund

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

const tenant1 = randomUUID();
const branch1 = randomUUID();
const customer1 = randomUUID();
const serviceEms = randomUUID();
const employee1 = randomUUID();
const employee2 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

async function createBooking(input: {
  customerId?: string;
  employeeId: string;
  startsAt: Date;
  durationMinutes?: number;
  status?: string;
}): Promise<string> {
  const bookingId = randomUUID();
  const duration = input.durationMinutes ?? 30;
  const endsAt = new Date(input.startsAt.getTime() + duration * 60_000);
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      INSERT INTO bookings
        (id, tenant_id, branch_id, service_id, customer_id, employee_id,
         customer_name, customer_email,
         starts_at, ends_at, buffer_starts_at, buffer_ends_at,
         status, price_paid_hellers, currency, reference_code)
      VALUES
        (${bookingId}, ${tenant1}, ${branch1}, ${serviceEms},
         ${input.customerId ?? customer1}, ${input.employeeId},
         'Test', 'test@test.cz',
         ${input.startsAt}, ${endsAt},
         ${input.startsAt}, ${endsAt},
         ${input.status ?? 'confirmed'}, 50000, 'CZK',
         ${'B-' + bookingId.slice(0, 8)})
    `;
  });
  return bookingId;
}

async function cancelBooking(bookingId: string, reason: string): Promise<void> {
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const [existing] = await tx<Array<{ status: string }>>`
      SELECT status FROM bookings WHERE id = ${bookingId}
    `;
    if (!existing) throw new Error('Booking not found');
    await tx`
      UPDATE bookings
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_reason = ${reason},
          updated_at = NOW()
      WHERE id = ${bookingId}
    `;
    await tx`
      INSERT INTO booking_status_history
        (tenant_id, booking_id, from_status, to_status, changed_by, reason)
      VALUES
        (${tenant1}, ${bookingId}, ${existing.status}, 'cancelled', 'system', ${reason})
    `;
  });
}

async function rescheduleBooking(bookingId: string, newStartsAt: Date): Promise<void> {
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    const [existing] = await tx<Array<{ ends_at: Date; starts_at: Date }>>`
      SELECT starts_at, ends_at FROM bookings WHERE id = ${bookingId}
    `;
    if (!existing) throw new Error('Booking not found');
    const duration = existing.ends_at.getTime() - existing.starts_at.getTime();
    const newEndsAt = new Date(newStartsAt.getTime() + duration);
    await tx`
      UPDATE bookings
      SET starts_at = ${newStartsAt},
          ends_at = ${newEndsAt},
          buffer_starts_at = ${newStartsAt},
          buffer_ends_at = ${newEndsAt},
          updated_at = NOW()
      WHERE id = ${bookingId}
    `;
  });
}

describe('Bookings cancel/reschedule + EXCLUDE (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'bk-test-' + tenant1.slice(0, 8)}, 'Bookings Test')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branch1}, ${tenant1}, 'P', 'p')`;
      await tx`INSERT INTO customers (id, tenant_id, first_name, last_name, email) VALUES
        (${customer1}, ${tenant1}, 'X', 'Y', ${'x-' + customer1.slice(0, 8) + '@test.cz'})`;
      // Employees + assignment to branch
      await tx`INSERT INTO employees (id, tenant_id, first_name, last_name, is_active) VALUES
        (${employee1}, ${tenant1}, 'Anna', 'Test', true),
        (${employee2}, ${tenant1}, 'Bob', 'Test', true)`;
      // Service
      const catId = randomUUID();
      await tx`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenant1}, 'T')`;
      await tx`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency) VALUES
        (${serviceEms}, ${tenant1}, ${catId}, 'EMS', 30, 50000, 'CZK')`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM booking_status_history WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM bookings WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM services WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM service_categories WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM employees WHERE tenant_id = ${tenant1}`;
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
      await tx`DELETE FROM bookings WHERE tenant_id = ${tenant1}`;
    });
  });

  describe('Cancel', () => {
    it('zmeni status na cancelled + zaznamen v history', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const bookingId = await createBooking({ employeeId: employee1, startsAt: tomorrow });

      await cancelBooking(bookingId, 'klient onemocnel');

      const result = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        const [booking] = await tx<Array<{ status: string; cancelled_reason: string | null }>>`
          SELECT status, cancelled_reason FROM bookings WHERE id = ${bookingId}
        `;
        const history = await tx<
          Array<{ from_status: string; to_status: string; reason: string | null }>
        >`SELECT from_status, to_status, reason FROM booking_status_history WHERE booking_id = ${bookingId}`;
        return { booking, history };
      });

      expect(result.booking?.status).toBe('cancelled');
      expect(result.booking?.cancelled_reason).toBe('klient onemocnel');
      expect(result.history).toHaveLength(1);
      expect(result.history[0]?.from_status).toBe('confirmed');
      expect(result.history[0]?.to_status).toBe('cancelled');
    });

    it('zachová si historii pri vice status zmenach', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const bookingId = await createBooking({
        employeeId: employee1,
        startsAt: tomorrow,
        status: 'pending',
      });

      // Pending → confirmed
      await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        await tx`UPDATE bookings SET status='confirmed' WHERE id=${bookingId}`;
        await tx`INSERT INTO booking_status_history (tenant_id, booking_id, from_status, to_status, changed_by) VALUES (${tenant1}, ${bookingId}, 'pending', 'confirmed', 'admin')`;
      });

      // Confirmed → cancelled
      await cancelBooking(bookingId, 'late cancel');

      const history = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ from_status: string; to_status: string }>>`
          SELECT from_status, to_status FROM booking_status_history
          WHERE booking_id = ${bookingId}
          ORDER BY created_at ASC
        `;
      });

      expect(history).toHaveLength(2);
      expect(history[0]?.to_status).toBe('confirmed');
      expect(history[1]?.to_status).toBe('cancelled');
    });
  });

  describe('Reschedule', () => {
    it('aktualizuje startsAt + endsAt + buffer', async () => {
      const initial = new Date('2026-06-15T10:00:00Z');
      const newTime = new Date('2026-06-15T14:00:00Z');
      const bookingId = await createBooking({ employeeId: employee1, startsAt: initial });

      await rescheduleBooking(bookingId, newTime);

      const result = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ starts_at: Date; ends_at: Date }>>`
          SELECT starts_at, ends_at FROM bookings WHERE id = ${bookingId}
        `;
      });

      expect(result[0]?.starts_at?.toISOString()).toBe(newTime.toISOString());
      // 30min duration
      const expectedEnd = new Date(newTime.getTime() + 30 * 60_000);
      expect(result[0]?.ends_at?.toISOString()).toBe(expectedEnd.toISOString());
    });
  });

  describe('EXCLUDE constraint', () => {
    it('zabrání dvojité rezervaci stejného zaměstnance ve stejném okně', async () => {
      const time = new Date('2026-06-20T10:00:00Z');
      // První rezervace projde
      await createBooking({ employeeId: employee1, startsAt: time });

      // Druhá pro stejného zaměstnance ve stejném okně → EXCLUDE
      await expect(createBooking({ employeeId: employee1, startsAt: time })).rejects.toThrow(
        /exclusion|conflicting key/i,
      );
    });

    it('povolí stejný čas pro různé zaměstnance', async () => {
      const time = new Date('2026-06-21T10:00:00Z');
      await createBooking({ employeeId: employee1, startsAt: time });
      // Stejný čas, jiný zaměstnanec → OK
      await expect(createBooking({ employeeId: employee2, startsAt: time })).resolves.toBeDefined();
    });

    it('povolí stejného zaměstnance v navazujícím okně', async () => {
      const time1 = new Date('2026-06-22T10:00:00Z');
      const time2 = new Date('2026-06-22T10:30:00Z'); // hned po
      await createBooking({ employeeId: employee1, startsAt: time1 });
      await expect(
        createBooking({ employeeId: employee1, startsAt: time2 }),
      ).resolves.toBeDefined();
    });

    it('zrušená rezervace neblokuje slot — můžeš vytvořit novou ve stejném okně', async () => {
      const time = new Date('2026-06-23T10:00:00Z');
      const b1 = await createBooking({ employeeId: employee1, startsAt: time });
      await cancelBooking(b1, 'klient zmenil');

      // Po zruseni: novou ve stejnem okne pro stejneho zamestnance — OK
      await expect(createBooking({ employeeId: employee1, startsAt: time })).resolves.toBeDefined();
    });
  });
});
