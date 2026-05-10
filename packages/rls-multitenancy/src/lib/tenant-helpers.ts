// Helper factory funkce pro běžné context tvary.
// Použití v API route handlerech a background jobs.

import type { TenantContext } from '../types/tenant';

export function ownerContext(tenantId: string, userId: string): TenantContext {
  return { tenantId, userId, role: 'owner' };
}

export function managerContext(tenantId: string, userId: string, branchId?: string): TenantContext {
  return branchId
    ? { tenantId, userId, branchId, role: 'manager' }
    : { tenantId, userId, role: 'manager' };
}

export function employeeContext(
  tenantId: string,
  userId: string,
  branchId?: string,
): TenantContext {
  return branchId
    ? { tenantId, userId, branchId, role: 'employee' }
    : { tenantId, userId, role: 'employee' };
}

export function receptionistContext(
  tenantId: string,
  userId: string,
  branchId?: string,
): TenantContext {
  return branchId
    ? { tenantId, userId, branchId, role: 'receptionist' }
    : { tenantId, userId, role: 'receptionist' };
}

/**
 * Customer context — zákazník přes portál nebo widget.
 * tenantId určuje, kterému tenantovi zákazník patří (zákazníci jsou per-tenant,
 * ne globální — viz reserved-docs/13b_db_schema_users_customers.md).
 */
export function customerContext(tenantId: string, userId: string): TenantContext {
  return { tenantId, userId, role: 'customer' };
}

/**
 * Service context — používaný v background jobs a internal API endpoints.
 * Bypassuje per-user RLS, ale stále respektuje tenant scope.
 */
export function serviceContext(tenantId?: string): TenantContext {
  return tenantId ? { tenantId, role: 'service' } : { role: 'service' };
}
