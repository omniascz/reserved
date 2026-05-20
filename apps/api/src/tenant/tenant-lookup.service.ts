// TenantLookup — Drizzle implementace pro vyhledávání tenanta podle slug,
// custom domény nebo UUID. Používáno TenantMiddleware.

import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, type SQL } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { TenantLookup } from './tenant.middleware.js';

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  suspendedAt: Date | null;
  deletedAt: Date | null;
};

@Injectable()
export class DrizzleTenantLookup implements TenantLookup {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async bySlug(slug: string): Promise<TenantRow | null> {
    return this.lookupBy(eq(schema.tenants.slug, slug));
  }

  async byCustomDomain(domain: string): Promise<TenantRow | null> {
    // Pouze ověřené domény routujeme — neověřené visí v DB jako 'pending'
    // dokud tenant nepotvrdí TXT záznam přes /admin/custom-domain/verify.
    const predicate = and(
      eq(schema.tenants.customDomain, domain),
      isNotNull(schema.tenants.customDomainVerifiedAt),
    );
    if (!predicate) return null;
    return this.lookupBy(predicate);
  }

  async byId(id: string): Promise<TenantRow | null> {
    return this.lookupBy(eq(schema.tenants.id, id));
  }

  private async lookupBy(predicate: SQL<unknown>): Promise<TenantRow | null> {
    const rows = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      return tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          customDomain: schema.tenants.customDomain,
          suspendedAt: schema.tenants.suspendedAt,
          deletedAt: schema.tenants.deletedAt,
        })
        .from(schema.tenants)
        .where(predicate)
        .limit(1);
    });
    return rows[0] ?? null;
  }
}
