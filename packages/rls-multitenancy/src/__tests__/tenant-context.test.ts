import { describe, expect, it, vi } from 'vitest';
import { withTenantContext } from '../lib/tenant-context';
import { ownerContext, customerContext, serviceContext } from '../lib/tenant-helpers';
import type { DbAdapter } from '../lib/service-container';

const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';
const VALID_UUID_3 = '33333333-3333-4333-8333-333333333333';

function makeMockDb(): DbAdapter & { calls: string[] } {
  const calls: string[] = [];
  const db: DbAdapter & { calls: string[] } = {
    calls,
    query: vi.fn(async () => ({ rows: [] })),
    execute: vi.fn(async (sql: string) => {
      calls.push(sql);
    }),
    transaction: vi.fn(async (fn) => fn(db)),
  };
  return db;
}

describe('withTenantContext', () => {
  it('sets all four session variables in correct order', async () => {
    const db = makeMockDb();
    const ctx = ownerContext(VALID_UUID_1, VALID_UUID_2);

    await withTenantContext(db, ctx, async () => 'ok');

    expect(db.calls).toEqual([
      `SET LOCAL app.current_tenant_id = '${VALID_UUID_1}'`,
      `SET LOCAL app.current_user_id = '${VALID_UUID_2}'`,
      `SET LOCAL app.current_branch_id = ''`,
      `SET LOCAL app.current_role = 'owner'`,
    ]);
  });

  it('passes branchId when provided in context', async () => {
    const db = makeMockDb();
    const ctx = {
      tenantId: VALID_UUID_1,
      userId: VALID_UUID_2,
      branchId: VALID_UUID_3,
      role: 'manager' as const,
    };

    await withTenantContext(db, ctx, async () => null);

    expect(db.calls[2]).toBe(`SET LOCAL app.current_branch_id = '${VALID_UUID_3}'`);
  });

  it('throws on invalid UUID — SQL injection attempt blocked', async () => {
    const db = makeMockDb();
    const malicious = "1'; DROP TABLE users; --";

    await expect(
      withTenantContext(db, { tenantId: malicious, role: 'owner' }, async () => null),
    ).rejects.toThrow(/RLS security error.*tenantId.*Possible SQL injection/);
  });

  it('throws on invalid role — SQL injection via role field blocked', async () => {
    const db = makeMockDb();
    const malicious = "owner'; DROP TABLE users; --" as never;

    await expect(
      withTenantContext(db, { tenantId: VALID_UUID_1, role: malicious }, async () => null),
    ).rejects.toThrow(/RLS security error.*invalid role/);
  });

  it('accepts service role without tenantId for cross-tenant background jobs', async () => {
    const db = makeMockDb();
    const ctx = serviceContext();

    await withTenantContext(db, ctx, async () => 'ok');

    expect(db.calls[0]).toBe(`SET LOCAL app.current_tenant_id = ''`);
    expect(db.calls[3]).toBe(`SET LOCAL app.current_role = 'service'`);
  });

  it('returns the value from fn callback', async () => {
    const db = makeMockDb();
    const ctx = customerContext(VALID_UUID_1, VALID_UUID_2);

    const result = await withTenantContext(db, ctx, async () => ({ foo: 42 }));

    expect(result).toEqual({ foo: 42 });
  });

  it('rollbacks on error inside fn', async () => {
    const db = makeMockDb();
    db.transaction = vi.fn(async (fn) => {
      try {
        return await fn(db);
      } catch (err) {
        // simulated rollback
        throw err;
      }
    });

    await expect(
      withTenantContext(db, ownerContext(VALID_UUID_1, VALID_UUID_2), async () => {
        throw new Error('booking failed');
      }),
    ).rejects.toThrow('booking failed');
  });
});
