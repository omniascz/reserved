// Integration test pro rezervaci stolu (vertikála Restaurace, R1/R3) — DB EXCLUDE.
//
// Pouziva primy SQL pres postgres-js (stejny pattern jako class-sessions.e2e.test.ts).
// Testuje presne to, na cem stoji TableReservationsService.create:
//   INSERT do table_reservation_tables s EXCLUDE na (resource_id, tstzrange)
//   → dva obsazene stoly v prekryvu se odmitnou (PG 23P01).
//
// Vyzaduje bezici Postgres s aplikovanymi migracemi 0081–0084.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 8 });

const tenant1 = randomUUID();
const branch1 = randomUUID();
const t5 = randomUUID();
const t6 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

/** Mirror TableReservationsService.create: rezervace + obsazení N stolů v 1 transakci. */
async function reserve(
  resourceIds: string[],
  startIso: string,
  endIso: string,
  partySize = 2,
): Promise<{ ok: true; id: string } | { ok: false; reason: 'conflict' }> {
  const reservationId = randomUUID();
  try {
    return await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      await tx`
        INSERT INTO table_reservations
          (id, tenant_id, branch_id, resource_id, customer_name, starts_at, ends_at, party_size, status)
        VALUES
          (${reservationId}, ${tenant1}, ${branch1}, ${resourceIds[0]!}, 'Host',
           ${startIso}, ${endIso}, ${partySize}, 'confirmed')`;
      for (let i = 0; i < resourceIds.length; i++) {
        await tx`
          INSERT INTO table_reservation_tables
            (tenant_id, reservation_id, resource_id, is_primary, occupied_starts_at, occupied_ends_at, status)
          VALUES
            (${tenant1}, ${reservationId}, ${resourceIds[i]!}, ${i === 0},
             ${startIso}, ${endIso}, 'confirmed')`;
      }
      return { ok: true as const, id: reservationId };
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23P01')
      return { ok: false as const, reason: 'conflict' };
    throw err;
  }
}

async function activeTablesFor(reservationId: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    return tx<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM table_reservation_tables
      WHERE reservation_id = ${reservationId} AND status NOT IN ('cancelled','no_show')`;
  });
  return rows[0]?.n ?? -1;
}

async function release(reservationId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`UPDATE table_reservations SET status='cancelled' WHERE id=${reservationId}`;
    await tx`UPDATE table_reservation_tables SET status='cancelled' WHERE reservation_id=${reservationId}`;
  });
}

describe('TableReservations — obsazenost stolů a souběh (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'tr-' + tenant1.slice(0, 8)}, 'TableRes Test')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branch1}, ${tenant1}, 'Restaurace', 'restaurace')`;
      await tx`INSERT INTO resources (id, tenant_id, branch_id, name, type, metadata)
        VALUES (${t5}, ${tenant1}, ${branch1}, 'Stůl 5', 'table', ${'{"seats":4}'}::jsonb)`;
      await tx`INSERT INTO resources (id, tenant_id, branch_id, name, type, metadata)
        VALUES (${t6}, ${tenant1}, ${branch1}, 'Stůl 6', 'table', ${'{"seats":4}'}::jsonb)`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM table_reservation_tables WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM table_reservations WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM resources WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM branches WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM tenants WHERE id = ${tenant1}`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      await tx`DELETE FROM table_reservation_tables WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM table_reservations WHERE tenant_id = ${tenant1}`;
    });
  });

  it('stejný stůl nelze rezervovat dvakrát v překryvu', async () => {
    const a = await reserve([t5], '2031-06-01T18:00:00Z', '2031-06-01T20:00:00Z');
    const overlap = await reserve([t5], '2031-06-01T19:00:00Z', '2031-06-01T21:00:00Z');
    const later = await reserve([t5], '2031-06-01T20:00:00Z', '2031-06-01T22:00:00Z'); // navazuje, [) volné

    expect(a.ok).toBe(true);
    expect(overlap).toEqual({ ok: false, reason: 'conflict' });
    expect(later.ok).toBe(true);
  });

  it('sloučení 2 stolů a kolize na jednom z nich se odmítne', async () => {
    // Skupina obsadí stůl 5+6 (banket) na večer.
    const merged = await reserve([t5, t6], '2031-06-02T18:00:00Z', '2031-06-02T20:30:00Z', 8);
    expect(merged.ok).toBe(true);
    if (merged.ok) expect(await activeTablesFor(merged.id)).toBe(2);

    // Jiná rezervace na stůl 6 v překryvu → odmítnuto (EXCLUDE vidí i sloučené stoly).
    const clashOn6 = await reserve([t6], '2031-06-02T19:00:00Z', '2031-06-02T20:00:00Z');
    expect(clashOn6).toEqual({ ok: false, reason: 'conflict' });

    // Stůl 5 po uvolnění banketu je opět volný.
    if (merged.ok) await release(merged.id);
    const after = await reserve([t5], '2031-06-02T19:00:00Z', '2031-06-02T20:00:00Z');
    expect(after.ok).toBe(true);
  });

  it('SOUBĚH: 3 rezervace naráz o stejný stůl → uspěje právě jedna', async () => {
    const results = await Promise.all([
      reserve([t5], '2031-06-03T18:00:00Z', '2031-06-03T20:00:00Z'),
      reserve([t5], '2031-06-03T18:30:00Z', '2031-06-03T20:30:00Z'),
      reserve([t5], '2031-06-03T19:00:00Z', '2031-06-03T21:00:00Z'),
    ]);
    const ok = results.filter((r) => r.ok).length;
    expect(ok).toBe(1);
  });
});
