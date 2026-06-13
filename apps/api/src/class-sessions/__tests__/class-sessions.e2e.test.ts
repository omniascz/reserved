// Integration test pro skupinové lekce (sprint 10.0) — atomicita kapacity.
//
// Pouziva primy SQL pres postgres-js (stejny pattern jako credit-packs.e2e.test.ts).
// Testuje presne tu logiku, na ktere stoji ClassSessionsService.join:
//   UPDATE class_sessions SET booked_count = booked_count + 1
//   WHERE id=? AND status='open' AND booked_count < capacity RETURNING ...
// + insert bookingu se session_id (dvojí přihlášení blokuje partial unique index).
//
// Vyzaduje bezici Postgres (docker compose dev stack) s aplikovanou migraci 0050.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 8 });

const tenant1 = randomUUID();
const branch1 = randomUUID();
const groupService = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

/** Vytvoří skupinovou lekci a vrátí její id. */
async function createSession(capacity: number, bookedCount = 0): Promise<string> {
  const id = randomUUID();
  const startsAt = new Date('2031-03-01T10:00:00Z');
  const endsAt = new Date('2031-03-01T11:00:00Z');
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      INSERT INTO class_sessions
        (id, tenant_id, branch_id, service_id, employee_id, starts_at, ends_at,
         buffer_starts_at, buffer_ends_at, capacity, booked_count, status)
      VALUES
        (${id}, ${tenant1}, ${branch1}, ${groupService}, NULL, ${startsAt}, ${endsAt},
         ${startsAt}, ${endsAt}, ${capacity}, ${bookedCount}, 'open')`;
  });
  return id;
}

/** Mirror ClassSessionsService.join — atomická rezervace místa + insert účastníka. */
async function join(
  sessionId: string,
  customerId: string,
): Promise<{ ok: true; bookedCount: number } | { ok: false; reason: 'full' | 'already' }> {
  try {
    return await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      // Mirror ClassSessionsService.join: účastník musí mít customer entitu.
      await tx`
        INSERT INTO customers (id, tenant_id, first_name, last_name, email)
        VALUES (${customerId}, ${tenant1}, 'Test', 'Účastník', ${'u-' + customerId.slice(0, 8) + '@test.cz'})
        ON CONFLICT (id) DO NOTHING`;
      const reserved = await tx<Array<{ booked_count: number }>>`
        UPDATE class_sessions
        SET booked_count = booked_count + 1, updated_at = now()
        WHERE id = ${sessionId} AND tenant_id = ${tenant1}
          AND status = 'open' AND booked_count < capacity
        RETURNING booked_count`;
      if (reserved.length === 0) {
        const err = new Error('full') as Error & { _reason?: string };
        err._reason = 'full';
        throw err;
      }
      const startsAt = new Date('2031-03-01T10:00:00Z');
      const endsAt = new Date('2031-03-01T11:00:00Z');
      await tx`
        INSERT INTO bookings
          (tenant_id, branch_id, service_id, session_id, customer_id, customer_name,
           customer_email, starts_at, ends_at, buffer_starts_at, buffer_ends_at,
           status, reference_code)
        VALUES
          (${tenant1}, ${branch1}, ${groupService}, ${sessionId}, ${customerId},
           'Účastník', ${'u-' + customerId.slice(0, 8) + '@test.cz'}, ${startsAt}, ${endsAt},
           ${startsAt}, ${endsAt}, 'confirmed', ${'L-' + randomUUID().slice(0, 8)})`;
      return { ok: true as const, bookedCount: reserved[0]!.booked_count };
    });
  } catch (e) {
    const err = e as { _reason?: string; code?: string };
    if (err._reason === 'full') return { ok: false as const, reason: 'full' as const };
    if (err.code === '23505') return { ok: false as const, reason: 'already' as const };
    throw e;
  }
}

async function getBookedCount(sessionId: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    return tx<Array<{ booked_count: number }>>`
      SELECT booked_count FROM class_sessions WHERE id = ${sessionId}`;
  });
  return rows[0]?.booked_count ?? -1;
}

async function activeParticipants(sessionId: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    return tx<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM bookings
      WHERE session_id = ${sessionId} AND status NOT IN ('cancelled', 'no_show')`;
  });
  return rows[0]?.n ?? -1;
}

describe('ClassSessions — kapacita a souběh (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'cs-' + tenant1.slice(0, 8)}, 'ClassSessions Test')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branch1}, ${tenant1}, 'Praha', 'praha')`;
      const catId = randomUUID();
      await tx`INSERT INTO service_categories (id, tenant_id, name) VALUES (${catId}, ${tenant1}, 'Fitness')`;
      await tx`INSERT INTO services (id, tenant_id, category_id, name, duration_minutes, price_hellers, currency, capacity)
        VALUES (${groupService}, ${tenant1}, ${catId}, 'Skupinová lekce', 60, 30000, 'CZK', 12)`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM booking_status_history WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM bookings WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM class_sessions WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM resources WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customers WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM services WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM service_categories WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM branches WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM tenants WHERE id = ${tenant1}`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM bookings WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM class_sessions WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM customers WHERE tenant_id = ${tenant1}`;
    });
  });

  it('naplní lekci do kapacity a další přihlášení odmítne', async () => {
    const session = await createSession(3);
    const c1 = randomUUID();
    const c2 = randomUUID();
    const c3 = randomUUID();
    const c4 = randomUUID();

    expect(await join(session, c1)).toEqual({ ok: true, bookedCount: 1 });
    expect(await join(session, c2)).toEqual({ ok: true, bookedCount: 2 });
    expect(await join(session, c3)).toEqual({ ok: true, bookedCount: 3 });
    expect(await join(session, c4)).toEqual({ ok: false, reason: 'full' });

    expect(await getBookedCount(session)).toBe(3);
    expect(await activeParticipants(session)).toBe(3);
  });

  it('stejný klient se nepřihlásí dvakrát (a místo se nezablokuje)', async () => {
    const session = await createSession(5);
    const c1 = randomUUID();

    expect(await join(session, c1)).toEqual({ ok: true, bookedCount: 1 });
    expect(await join(session, c1)).toEqual({ ok: false, reason: 'already' });

    // booked_count se po neúspěchu nesmí navýšit (transakce se vrátila).
    expect(await getBookedCount(session)).toBe(1);
    expect(await activeParticipants(session)).toBe(1);
  });

  it('SOUBĚH: 3 lidé naráz o poslední místo → uspěje právě jeden', async () => {
    const session = await createSession(5, 4); // 1 volné místo
    const racers = [randomUUID(), randomUUID(), randomUUID()];

    const results = await Promise.all(racers.map((c) => join(session, c)));
    const ok = results.filter((r) => r.ok).length;
    const full = results.filter((r) => !r.ok && r.reason === 'full').length;

    expect(ok).toBe(1);
    expect(full).toBe(2);
    expect(await getBookedCount(session)).toBe(5);
    expect(await activeParticipants(session)).toBe(1); // jen ten 1 nově přidaný
  });

  it('odhlášení uvolní místo a další se může přihlásit', async () => {
    const session = await createSession(2);
    const c1 = randomUUID();
    const c2 = randomUUID();
    const c3 = randomUUID();

    await join(session, c1);
    await join(session, c2);
    expect(await join(session, c3)).toEqual({ ok: false, reason: 'full' });

    // c1 odejde — mirror ClassSessionsService.leave
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      await tx`UPDATE bookings SET status = 'cancelled', cancelled_at = now()
        WHERE session_id = ${session} AND customer_id = ${c1} AND status NOT IN ('cancelled','no_show')`;
      await tx`UPDATE class_sessions SET booked_count = GREATEST(booked_count - 1, 0)
        WHERE id = ${session}`;
    });

    expect(await getBookedCount(session)).toBe(1);
    expect(await join(session, c3)).toEqual({ ok: true, bookedCount: 2 });
  });

  it('listOpenPublic vrací jen otevřené lekce s volnými místy, seřazené dle času', async () => {
    // D: 09:00 open, volno (3-1). A: 10:00 open, volno (3-0).
    // B: 08:00 open ale PLNÁ (2/2). C: 07:00 ZRUŠENÁ.
    const mk = async (
      startIso: string,
      capacity: number,
      booked: number,
      status: string,
    ): Promise<string> => {
      const id = randomUUID();
      const s = new Date(startIso);
      const e = new Date(new Date(startIso).getTime() + 60 * 60_000);
      await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        await tx`INSERT INTO class_sessions
          (id, tenant_id, branch_id, service_id, employee_id, starts_at, ends_at,
           buffer_starts_at, buffer_ends_at, capacity, booked_count, status)
          VALUES (${id}, ${tenant1}, ${branch1}, ${groupService}, NULL, ${s}, ${e}, ${s}, ${e},
           ${capacity}, ${booked}, ${status})`;
      });
      return id;
    };
    const a = await mk('2031-04-01T10:00:00Z', 3, 0, 'open');
    const d = await mk('2031-04-01T09:00:00Z', 3, 1, 'open');
    await mk('2031-04-01T08:00:00Z', 2, 2, 'open'); // plná
    await mk('2031-04-01T07:00:00Z', 5, 1, 'cancelled'); // zrušená

    // Mirror ClassSessionsService.listOpenPublic
    const rows = await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      return tx<Array<{ id: string; free: number }>>`
        SELECT cs.id, (cs.capacity - cs.booked_count) AS free
        FROM class_sessions cs
        LEFT JOIN employees e ON cs.employee_id = e.id
        WHERE cs.tenant_id = ${tenant1} AND cs.status = 'open'
          AND cs.booked_count < cs.capacity
        ORDER BY cs.starts_at ASC`;
    });

    expect(rows.map((r) => r.id)).toEqual([d, a]); // 09:00 první, plná a zrušená vynechány
    expect(rows.map((r) => Number(r.free))).toEqual([2, 3]);
  });

  it('EMS: stejný přístroj nesmí mít dvě překrývající se otevřené lekce', async () => {
    // Vytvoř přístroj (resource) v tenantu.
    const resourceId = randomUUID();
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      await tx`INSERT INTO resources (id, tenant_id, branch_id, name, type)
        VALUES (${resourceId}, ${tenant1}, ${branch1}, 'EMS #1', 'ems_machine')`;
    });

    const mkEms = async (startIso: string): Promise<string | null> => {
      const id = randomUUID();
      const s = new Date(startIso);
      const e = new Date(new Date(startIso).getTime() + 20 * 60_000);
      try {
        await sql.begin(async (tx) => {
          await setCtx(tx, 'service', tenant1);
          await tx`INSERT INTO class_sessions
            (id, tenant_id, branch_id, service_id, resource_id, starts_at, ends_at,
             buffer_starts_at, buffer_ends_at, capacity, booked_count, status)
            VALUES (${id}, ${tenant1}, ${branch1}, ${groupService}, ${resourceId}, ${s}, ${e},
             ${s}, ${e}, 1, 0, 'open')`;
        });
        return id;
      } catch (err) {
        if ((err as { code?: string }).code === '23P01') return null; // přístroj obsazen
        throw err;
      }
    };

    const first = await mkEms('2031-05-01T10:00:00Z');
    const overlap = await mkEms('2031-05-01T10:10:00Z'); // překrývá první (20 min sloty)
    const later = await mkEms('2031-05-01T11:00:00Z'); // nepřekrývá

    expect(first).not.toBeNull();
    expect(overlap).toBeNull(); // EXCLUDE odmítl
    expect(later).not.toBeNull();

    await sql.begin(async (tx) => {
      await setCtx(tx, 'service', tenant1);
      await tx`DELETE FROM class_sessions WHERE resource_id = ${resourceId}`;
      await tx`DELETE FROM resources WHERE id = ${resourceId}`;
    });
  });
});
