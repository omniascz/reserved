// e2e test pro Rules engine flow.
// Vytvori rule + zaznam execution.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://dev:dev@localhost:5432/reserved_dev';
const sql = postgres(DATABASE_URL, { max: 4 });

const tenant1 = randomUUID();

async function setCtx(tx: postgres.TransactionSql, role: string, tenantId?: string): Promise<void> {
  if (role !== 'service') {
    await tx.unsafe('SET LOCAL ROLE app_user');
  }
  await tx`SELECT set_config('app.current_role', ${role}, true)`;
  await tx`SELECT set_config('app.current_tenant_id', ${tenantId ?? ''}, true)`;
}

async function createRule(input: {
  name: string;
  triggerEvent: string;
  conditions?: Record<string, unknown>;
  actions?: Array<{ type: string; config: Record<string, unknown> }>;
  priority?: number;
  isEnabled?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      INSERT INTO rules
        (id, tenant_id, name, trigger_event, conditions, actions, is_enabled, priority)
      VALUES
        (${id}, ${tenant1}, ${input.name}, ${input.triggerEvent},
         ${sql.json((input.conditions ?? { type: 'always' }) as never)},
         ${sql.json((input.actions ?? []) as never)},
         ${input.isEnabled ?? true}, ${input.priority ?? 100})
    `;
  });
  return id;
}

async function logExecution(input: {
  ruleId: string;
  eventType: string;
  matched: boolean;
  actionResults?: Array<{ action: string; status: string }>;
}): Promise<string> {
  const id = randomUUID();
  await sql.begin(async (tx) => {
    await setCtx(tx, 'service', tenant1);
    await tx`
      INSERT INTO rule_executions
        (id, tenant_id, rule_id, event_type, event_payload, matched, action_results)
      VALUES
        (${id}, ${tenant1}, ${input.ruleId}, ${input.eventType},
         ${sql.json({} as never)},
         ${input.matched},
         ${sql.json((input.actionResults ?? []) as never)})
    `;
  });
  return id;
}

describe('Rules engine flow (e2e)', () => {
  beforeAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`INSERT INTO tenants (id, slug, name) VALUES (${tenant1}, ${'rules-test-' + tenant1.slice(0, 8)}, 'Rules Test')`;
    });
  });

  afterAll(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM rule_executions WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM rules WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM tenants WHERE id = ${tenant1}`;
    });
    await sql.end();
  });

  beforeEach(async () => {
    await sql.begin(async (tx) => {
      await setCtx(tx, 'service');
      await tx`DELETE FROM rule_executions WHERE tenant_id = ${tenant1}`;
      await tx`DELETE FROM rules WHERE tenant_id = ${tenant1}`;
    });
  });

  describe('CRUD', () => {
    it('vytvori rule s default values', async () => {
      const id = await createRule({ name: 'Test Rule', triggerEvent: 'booking_cancelled' });
      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ name: string; trigger_event: string; is_enabled: boolean }>>`
          SELECT name, trigger_event, is_enabled FROM rules WHERE id = ${id}
        `;
      });
      expect(rows[0]?.name).toBe('Test Rule');
      expect(rows[0]?.trigger_event).toBe('booking_cancelled');
      expect(rows[0]?.is_enabled).toBe(true);
    });

    it('list pravidel filtruje by trigger + isEnabled', async () => {
      await createRule({ name: 'A', triggerEvent: 'booking_cancelled', isEnabled: true });
      await createRule({ name: 'B', triggerEvent: 'booking_cancelled', isEnabled: false });
      await createRule({ name: 'C', triggerEvent: 'booking_no_show', isEnabled: true });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ name: string }>>`
          SELECT name FROM rules
          WHERE tenant_id = ${tenant1}
            AND trigger_event = 'booking_cancelled'
            AND is_enabled = true
            AND deleted_at IS NULL
        `;
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('A');
    });

    it('soft-delete oznaci deleted_at', async () => {
      const id = await createRule({ name: 'ToDelete', triggerEvent: 'booking_created' });
      await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        await tx`UPDATE rules SET deleted_at = NOW() WHERE id = ${id}`;
      });

      const visible = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ id: string }>>`
          SELECT id FROM rules WHERE tenant_id = ${tenant1} AND deleted_at IS NULL
        `;
      });
      expect(visible).toHaveLength(0);

      const all = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ id: string }>>`
          SELECT id FROM rules WHERE tenant_id = ${tenant1}
        `;
      });
      expect(all).toHaveLength(1); // stale tam je, jen soft-deleted
    });
  });

  describe('Executions log', () => {
    it('zapise execution s matched=true + action results', async () => {
      const ruleId = await createRule({ name: 'R', triggerEvent: 'booking_cancelled' });
      await logExecution({
        ruleId,
        eventType: 'booking_cancelled',
        matched: true,
        actionResults: [
          { action: 'log_message', status: 'ok' },
          { action: 'send_email', status: 'ok' },
        ],
      });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ matched: boolean; action_results: unknown }>>`
          SELECT matched, action_results FROM rule_executions WHERE rule_id = ${ruleId}
        `;
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.matched).toBe(true);
      const results = rows[0]?.action_results as Array<{ action: string; status: string }>;
      expect(results).toHaveLength(2);
      expect(results[0]?.action).toBe('log_message');
    });

    it('zapise execution s matched=false (podminky neprosly)', async () => {
      const ruleId = await createRule({ name: 'R', triggerEvent: 'booking_cancelled' });
      await logExecution({
        ruleId,
        eventType: 'booking_cancelled',
        matched: false,
      });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ matched: boolean }>>`
          SELECT matched FROM rule_executions WHERE rule_id = ${ruleId}
        `;
      });
      expect(rows[0]?.matched).toBe(false);
    });

    it('vice executions pro stejne rule jsou serazene podle createdAt', async () => {
      const ruleId = await createRule({ name: 'R', triggerEvent: 'booking_cancelled' });
      await logExecution({ ruleId, eventType: 'booking_cancelled', matched: true });
      await new Promise((r) => setTimeout(r, 10));
      await logExecution({ ruleId, eventType: 'booking_cancelled', matched: false });

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'service', tenant1);
        return tx<Array<{ matched: boolean }>>`
          SELECT matched FROM rule_executions
          WHERE rule_id = ${ruleId}
          ORDER BY created_at ASC
        `;
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]?.matched).toBe(true);
      expect(rows[1]?.matched).toBe(false);
    });
  });

  describe('Multi-tenant isolation', () => {
    it('pravidla z tenant A nejsou videt v tenant B kontextu', async () => {
      const ruleId = await createRule({ name: 'A rule', triggerEvent: 'booking_cancelled' });
      const otherTenant = randomUUID();

      const rows = await sql.begin(async (tx) => {
        await setCtx(tx, 'owner', otherTenant);
        return tx<Array<{ id: string }>>`SELECT id FROM rules WHERE id = ${ruleId}`;
      });
      expect(rows).toHaveLength(0);
    });
  });
});
