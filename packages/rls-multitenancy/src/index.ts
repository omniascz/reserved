export { withTenantContext } from './lib/tenant-context';
export type { DbAdapter, DbQueryResult } from './lib/service-container';
export { APP_ROLES, type AppRole, type TenantContext } from './types/tenant';
export {
  ownerContext,
  managerContext,
  employeeContext,
  receptionistContext,
  customerContext,
  serviceContext,
} from './lib/tenant-helpers';
