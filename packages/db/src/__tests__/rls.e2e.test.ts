// E2E test pro RLS izolaci.
// Vyžaduje běžící Postgres (docker compose -f docker-compose.dev.yml up -d).
// Spuštění: pnpm --filter @reserved/db test:e2e
//
// postgres-js neumí `SET LOCAL` v tagged-template (chce parametr binding,
// PG `SET` ale parametry nepodporuje). Místo toho používáme `set_config(name,
// value, is_local=true)`, která SET LOCAL semantiku plně reprodukuje a navíc
// je parametrizovatelná.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';

const sql = postgres(DATABASE_URL, { max: 4 });

const tenantA = randomUUID();
const tenantB = randomUUID();
const branchA = randomUUID();
const branchB = randomUUID();

async function setRlsContext(
  tx: postgres.TransactionSql,
  role: string,
  tenantId?: string,
): Promise<void> {
  // Connection user `dev` is superuser/owner who would bypass RLS. We switch
  // to non-privileged `app_user` so FORCE ROW LEVEL SECURITY applies. SET
  // LOCAL ROLE reverts at COMMIT/ROLLBACK.
  // Service-role test cases stay on `dev` (RLS bypass) by NOT switching.
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

describe('RLS isolation', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenantA}, ${'rls-a-' + tenantA.slice(0, 8)}, 'RLS Test A')`;
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenantB}, ${'rls-b-' + tenantB.slice(0, 8)}, 'RLS Test B')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branchA}, ${tenantA}, 'Branch A', 'branch-a')`;
      await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${branchB}, ${tenantB}, 'Branch B', 'branch-b')`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setRlsContext(tx, 'service');
      await tx`DELETE FROM branches WHERE id IN (${branchA}, ${branchB})`;
      await tx`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
    });
    await sql.end();
  });

  it('tenant A sees only its own tenant row', async () => {
    const rows = await sql.begin(async (tx) => {
      await setRlsContext(tx, 'owner', tenantA);
      return tx`SELECT id FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
    });
    expect(rows.map((r) => r.id)).toEqual([tenantA]);
  });

  it('tenant A sees only its own branches', async () => {
    const rows = await sql.begin(async (tx) => {
      await setRlsContext(tx, 'owner', tenantA);
      return tx`SELECT id FROM branches WHERE id IN (${branchA}, ${branchB})`;
    });
    expect(rows.map((r) => r.id)).toEqual([branchA]);
  });

  it('tenant B sees only its own branches (cross-check)', async () => {
    const rows = await sql.begin(async (tx) => {
      await setRlsContext(tx, 'owner', tenantB);
      return tx`SELECT id FROM branches WHERE id IN (${branchA}, ${branchB})`;
    });
    expect(rows.map((r) => r.id)).toEqual([branchB]);
  });

  it('cannot insert branch with wrong tenant_id (WITH CHECK enforcement)', async () => {
    await expect(
      sql.begin(async (tx) => {
        await setRlsContext(tx, 'owner', tenantA);
        const evilBranchId = randomUUID();
        await tx`INSERT INTO branches (id, tenant_id, name, slug) VALUES (${evilBranchId}, ${tenantB}, 'Evil', 'evil')`;
      }),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('cannot update branch belonging to another tenant', async () => {
    const result = await sql.begin(async (tx) => {
      await setRlsContext(tx, 'owner', tenantA);
      // RLS makes the row invisible, so UPDATE affects 0 rows (no error).
      return tx`UPDATE branches SET name = 'HIJACKED' WHERE id = ${branchB} RETURNING id`;
    });
    expect(result.length).toBe(0);
  });

  it('service role sees all rows across tenants', async () => {
    const rows = await sql.begin(async (tx) => {
      await setRlsContext(tx, 'service');
      return tx`SELECT id FROM branches WHERE id IN (${branchA}, ${branchB}) ORDER BY name`;
    });
    expect(rows.map((r) => r.id).sort()).toEqual([branchA, branchB].sort());
  });

  it('without setting tenant context, no rows are visible (default deny)', async () => {
    const rows = await sql.begin(async (tx) => {
      // app_user without tenant context → policies return false → 0 rows
      await tx.unsafe('SET LOCAL ROLE app_user');
      return tx`SELECT id FROM branches WHERE id IN (${branchA}, ${branchB})`;
    });
    expect(rows.length).toBe(0);
  });

  it('onboarding_checklist requires owner/manager role (employee blocked)', async () => {
    const checklistId = randomUUID();
    await sql.begin(async (tx) => {
      await setRlsContext(tx, 'service');
      await tx`INSERT INTO onboarding_checklist (id, tenant_id) VALUES (${checklistId}, ${tenantA})`;
    });

    try {
      const ownerRows = await sql.begin(async (tx) => {
        await setRlsContext(tx, 'owner', tenantA);
        return tx`SELECT id FROM onboarding_checklist WHERE id = ${checklistId}`;
      });
      expect(ownerRows.length).toBe(1);

      const employeeRows = await sql.begin(async (tx) => {
        await setRlsContext(tx, 'employee', tenantA);
        return tx`SELECT id FROM onboarding_checklist WHERE id = ${checklistId}`;
      });
      expect(employeeRows.length).toBe(0);
    } finally {
      await sql.begin(async (tx) => {
        await setRlsContext(tx, 'service');
        await tx`DELETE FROM onboarding_checklist WHERE id = ${checklistId}`;
      });
    }
  });
});
