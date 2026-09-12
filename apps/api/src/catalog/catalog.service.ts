// Marketplace v1 — public katalog tenantů na reserved.cz.
//
// Read-only endpointy přístupné bez autentizace. Vrací jen tenanty, kteří mají
// `listed_in_catalog = true` a nejsou suspended/deleted.

import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

export interface CatalogListing {
  id: string;
  slug: string;
  name: string;
  businessType: string | null;
  city: string | null;
  description: string | null;
  /** První fotka z public_photos (cover image). */
  coverPhoto: string | null;
  servicesCount: number;
}

export interface CatalogProfile extends CatalogListing {
  address: string | null;
  photos: string[];
  businessHours: Record<string, string>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceHellers: number;
    currency: string;
  }>;
}

@Injectable()
export class CatalogService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async list(filters: {
    city?: string;
    businessType?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: CatalogListing[]; total: number }> {
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const conditions = [
        eq(schema.tenants.listedInCatalog, true),
        isNull(schema.tenants.deletedAt),
        isNull(schema.tenants.suspendedAt),
      ];

      if (filters.city) {
        conditions.push(ilike(schema.tenants.publicCity, `%${filters.city}%`));
      }
      if (filters.businessType) {
        conditions.push(eq(schema.tenants.businessType, filters.businessType));
      }
      if (filters.search) {
        conditions.push(ilike(schema.tenants.name, `%${filters.search}%`));
      }

      const whereClause = and(...conditions);

      const rows = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          businessType: schema.tenants.businessType,
          publicCity: schema.tenants.publicCity,
          publicDescription: schema.tenants.publicDescription,
          publicPhotos: schema.tenants.publicPhotos,
        })
        .from(schema.tenants)
        .where(whereClause)
        .orderBy(schema.tenants.name)
        .limit(limit)
        .offset(offset);

      const [{ count } = { count: 0 }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.tenants)
        .where(whereClause);

      // Pocet sluzeb per tenant — single query s GROUP BY.
      const tenantIds = rows.map((r) => r.id);
      const serviceCounts =
        tenantIds.length === 0
          ? []
          : await tx
              .select({
                tenantId: schema.services.tenantId,
                count: sql<number>`count(*)::int`,
              })
              .from(schema.services)
              .where(
                and(
                  sql`${schema.services.tenantId} = ANY(${tenantIds})`,
                  eq(schema.services.isPublic, true),
                  eq(schema.services.isActive, true),
                ),
              )
              .groupBy(schema.services.tenantId);

      const countByTenant = new Map(serviceCounts.map((s) => [s.tenantId, s.count]));

      const data: CatalogListing[] = rows.map((row) => {
        const photos = Array.isArray(row.publicPhotos) ? (row.publicPhotos as string[]) : [];
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          businessType: row.businessType,
          city: row.publicCity,
          description: row.publicDescription,
          coverPhoto: photos[0] ?? null,
          servicesCount: countByTenant.get(row.id) ?? 0,
        };
      });

      return { data, total: count };
    });
  }

  async getBySlug(slug: string): Promise<CatalogProfile> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const tenantRows = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          businessType: schema.tenants.businessType,
          publicCity: schema.tenants.publicCity,
          publicDescription: schema.tenants.publicDescription,
          publicAddress: schema.tenants.publicAddress,
          publicPhotos: schema.tenants.publicPhotos,
          publicBusinessHours: schema.tenants.publicBusinessHours,
        })
        .from(schema.tenants)
        .where(
          and(
            eq(schema.tenants.slug, slug),
            eq(schema.tenants.listedInCatalog, true),
            isNull(schema.tenants.deletedAt),
            isNull(schema.tenants.suspendedAt),
          ),
        )
        .limit(1);

      const tenant = tenantRows[0];
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_IN_CATALOG', message: 'Salon nenalezen v katalogu.' },
        });
      }

      const services = await tx
        .select({
          id: schema.services.id,
          name: schema.services.name,
          durationMinutes: schema.services.durationMinutes,
          priceHellers: schema.services.priceHellers,
          currency: schema.services.currency,
        })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.tenantId, tenant.id),
            eq(schema.services.isPublic, true),
            eq(schema.services.isActive, true),
          ),
        )
        .orderBy(schema.services.name);

      const photos = Array.isArray(tenant.publicPhotos) ? (tenant.publicPhotos as string[]) : [];
      const businessHours =
        typeof tenant.publicBusinessHours === 'object' && tenant.publicBusinessHours !== null
          ? (tenant.publicBusinessHours as Record<string, string>)
          : {};

      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        businessType: tenant.businessType,
        city: tenant.publicCity,
        description: tenant.publicDescription,
        address: tenant.publicAddress,
        photos,
        businessHours,
        coverPhoto: photos[0] ?? null,
        services,
        servicesCount: services.length,
      };
    });
  }

  // ─── Admin (vlastník tenanta) ──────────────────────────────────────────

  async getMyProfile(tenantId: string): Promise<{
    listedInCatalog: boolean;
    publicDescription: string | null;
    publicCity: string | null;
    publicAddress: string | null;
    publicPhotos: string[];
    publicBusinessHours: Record<string, string>;
  }> {
    const rows = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          listedInCatalog: schema.tenants.listedInCatalog,
          publicDescription: schema.tenants.publicDescription,
          publicCity: schema.tenants.publicCity,
          publicAddress: schema.tenants.publicAddress,
          publicPhotos: schema.tenants.publicPhotos,
          publicBusinessHours: schema.tenants.publicBusinessHours,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
    });

    const t = rows[0];
    if (!t) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
      });
    }

    return {
      listedInCatalog: t.listedInCatalog,
      publicDescription: t.publicDescription,
      publicCity: t.publicCity,
      publicAddress: t.publicAddress,
      publicPhotos: Array.isArray(t.publicPhotos) ? (t.publicPhotos as string[]) : [],
      publicBusinessHours:
        typeof t.publicBusinessHours === 'object' && t.publicBusinessHours !== null
          ? (t.publicBusinessHours as Record<string, string>)
          : {},
    };
  }

  async updateMyProfile(
    tenantId: string,
    patch: {
      listedInCatalog?: boolean;
      publicDescription?: string | null;
      publicCity?: string | null;
      publicAddress?: string | null;
      publicPhotos?: string[];
      publicBusinessHours?: Record<string, string>;
    },
  ): Promise<void> {
    // Validace
    if (patch.publicPhotos && patch.publicPhotos.length > 10) {
      throw new BadRequestException({
        error: { code: 'TOO_MANY_PHOTOS', message: 'Max 10 fotek.' },
      });
    }
    if (patch.publicDescription && patch.publicDescription.length > 5000) {
      throw new BadRequestException({
        error: { code: 'DESCRIPTION_TOO_LONG', message: 'Popis max 5000 znaků.' },
      });
    }

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.listedInCatalog !== undefined) updates.listedInCatalog = patch.listedInCatalog;
      if (patch.publicDescription !== undefined)
        updates.publicDescription = patch.publicDescription;
      if (patch.publicCity !== undefined) updates.publicCity = patch.publicCity;
      if (patch.publicAddress !== undefined) updates.publicAddress = patch.publicAddress;
      if (patch.publicPhotos !== undefined) updates.publicPhotos = patch.publicPhotos;
      if (patch.publicBusinessHours !== undefined)
        updates.publicBusinessHours = patch.publicBusinessHours;

      await tx.update(schema.tenants).set(updates).where(eq(schema.tenants.id, tenantId));
    });
  }
}
