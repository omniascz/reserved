// TenantLookup — Drizzle implementace pro vyhledávání tenanta podle slug,
// custom domény nebo UUID. Používáno TenantMiddleware.

import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { TenantLookup } from './tenant.middleware.js';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
};

@Injectable()
export class DrizzleTenantLookup implements TenantLookup {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async bySlug(slug: string): Promise<TenantRow | null> {
    return this.lookupBy(eq(schema.tenants.slug, slug));
  }

  async byCustomDomain(domain: string): Promise<TenantRow | null> {
    return this.lookupBy(eq(schema.tenants.customDomain, domain));
  }

  async byId(id: string): Promise<TenantRow | null> {
    return this.lookupBy(eq(schema.tenants.id, id));
  }

  private async lookupBy(predicate: ReturnType<typeof eq>): Promise<TenantRow | null> {
    const rows = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      return tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          customDomain: schema.tenants.customDomain,
        })
        .from(schema.tenants)
        .where(predicate)
        .limit(1);
    });
    return rows[0] ?? null;
  }
}
