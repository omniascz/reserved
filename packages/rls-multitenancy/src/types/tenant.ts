// Reserved tenant context — předaný do `withTenantContext` při každém requestu.
//
// Reference: reserved-docs/04_permission_system.md (role enum) + 13e_db_schema_audit_rls_triggers.md
// (RLS policies čtou app.current_tenant_id, app.current_user_id, app.current_role
// session proměnné — proto musí být validované před vložením do SQL).

export const APP_ROLES = [
  'service', // system / background job
  'owner',
  'manager',
  'employee',
  'receptionist',
  'customer',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface TenantContext {
  /** UUID tenant — povinné pro všechny role kromě customera v cross-tenant operacích. */
  tenantId?: string;
  /** UUID admin user nebo customer — povinné pro audit log. */
  userId?: string;
  /** UUID pobočky pro scope-aware role (např. `manager` omezený na 1 pobočku). */
  branchId?: string;
  /** Aktivní role — vynucená přes whitelist. */
  role: AppRole;
}
