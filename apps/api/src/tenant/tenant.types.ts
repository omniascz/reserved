// Tenant resolution result — informace nahraná do req.tenant.

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  /** Custom doména pokud byla použita pro resolution. */
  customDomain: string | null;
  /** Z jakého zdroje byl tenant resolved (pro debugging + audit). */
  source: 'subdomain' | 'custom_domain' | 'header';
}

declare module 'express' {
  interface Request {
    tenant?: ResolvedTenant;
  }
}
