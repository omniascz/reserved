// Adapted from tixly/rls-multitenancy/lib/tenant-context.ts on 2026-05-10
// Změny vs. tixly:
//   - role enum rozšířen o owner|manager|employee|receptionist|customer (per reserved/04)
//   - SET LOCAL klíč přejmenován z app.current_promoter_id → app.current_tenant_id
//   - přidán app.current_branch_id pro scope-aware role
//
// SECURITY: tenantId, userId, branchId jsou validovány jako UUID před vložením
// do `SET LOCAL`. PostgreSQL nepodporuje parameter binding pro SET, takže
// musíme používat string interpolaci — ale jen po regex validaci.

import type { DbAdapter } from './service-container';
import { APP_ROLES, type AppRole, type TenantContext } from '../types/tenant';

/** UUID regex — RFC 4122 formát. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(value: string, fieldName: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new Error(
      `RLS security error: ${fieldName} must be a valid UUID, got: "${value}". ` +
        'Possible SQL injection attempt blocked.',
    );
  }
}

function assertValidRole(role: string): asserts role is AppRole {
  if (!(APP_ROLES as readonly string[]).includes(role)) {
    throw new Error(
      `RLS security error: invalid role "${role}". ` +
        `Allowed values: ${APP_ROLES.join(', ')}. Possible SQL injection attempt blocked.`,
    );
  }
}

/**
 * Nastaví PostgreSQL session proměnné pro RLS a zavolá `fn`.
 *
 * Implementace:
 *   1. Otevře transakci (`SET LOCAL` je scoped na transakci).
 *   2. SET LOCAL app.current_tenant_id   — používaný RLS policies pro filtrování
 *      podle `tenant_id` sloupce.
 *   3. SET LOCAL app.current_user_id     — pro audit log a per-user policies.
 *   4. SET LOCAL app.current_branch_id   — scope-aware filtrování pro role typu
 *      `manager` omezené na jednu pobočku.
 *   5. SET LOCAL app.current_role        — pro role-based RLS expressions.
 *   6. Zavolá `fn(tx)`.
 *   7. Commit (nebo rollback při chybě). Po commitu se SET LOCAL hodnoty
 *      automaticky resetují, takže další request nemůže vidět cizí kontext.
 *
 * @example
 *   // Admin endpoint pro listing zákazníků daného tenanta:
 *   await withTenantContext(deps.db, ownerContext(tenantId, userId), async (db) => {
 *     return db.query('SELECT * FROM customers');
 *     // RLS automaticky doplní: WHERE tenant_id = current_setting('app.current_tenant_id')::uuid
 *   });
 */
export async function withTenantContext<T>(
  db: DbAdapter,
  context: TenantContext,
  fn: (db: DbAdapter) => Promise<T>,
): Promise<T> {
  if (context.tenantId !== undefined && context.tenantId !== '') {
    validateUuid(context.tenantId, 'tenantId');
  }
  if (context.userId !== undefined && context.userId !== '') {
    validateUuid(context.userId, 'userId');
  }
  if (context.branchId !== undefined && context.branchId !== '') {
    validateUuid(context.branchId, 'branchId');
  }

  assertValidRole(context.role);

  const tenantIdValue = context.tenantId ?? '';
  const userIdValue = context.userId ?? '';
  const branchIdValue = context.branchId ?? '';
  const roleValue = context.role;

  return db.transaction(async (tx) => {
    await tx.execute(`SET LOCAL app.current_tenant_id = '${tenantIdValue}'`);
    await tx.execute(`SET LOCAL app.current_user_id = '${userIdValue}'`);
    await tx.execute(`SET LOCAL app.current_branch_id = '${branchIdValue}'`);
    await tx.execute(`SET LOCAL app.current_role = '${roleValue}'`);

    return fn(tx);
  });
}
