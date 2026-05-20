// Sprint 9.0-C: Tenant mini-website data — agregace všeho potřebného
// pro vykreslení tenantova mini-webu v apps/tenant-site.
//
// Endpoint /public/:slug/site vrací:
//   - basic info (name, slug, businessType)
//   - theme (barvy, font, logo)
//   - publicProfile (popis, město, adresa, fotky, hodiny — z catalog)
//   - siteTemplate + siteContent (sekce)
//   - services (veřejné aktivní služby)

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

export type SiteTemplate = 'elegant' | 'bold' | 'fresh';
const VALID_TEMPLATES: SiteTemplate[] = ['elegant', 'bold', 'fresh'];

/** Sekce v mini-webu — všechny optional, tenant si vybere co publikovat. */
export interface SiteContent {
  hero?: {
    headline?: string;
    subheadline?: string;
    coverPhotoUrl?: string;
    ctaText?: string;
  };
  about?: {
    headline?: string;
    text?: string;
    photoUrl?: string;
  };
  team?: {
    headline?: string;
    members?: Array<{ name: string; role?: string; photoUrl?: string; bio?: string }>;
  };
  gallery?: {
    headline?: string;
    photos?: string[];
  };
  testimonials?: {
    headline?: string;
    items?: Array<{ author: string; text: string }>;
  };
  faq?: {
    headline?: string;
    items?: Array<{ q: string; a: string }>;
  };
  contact?: {
    headline?: string;
    showAddress?: boolean;
    showHours?: boolean;
    showPhone?: boolean;
    phone?: string;
    email?: string;
    mapEmbedUrl?: string;
  };
  /** Aktivní sekce v pořadí. Default = ['hero','about','services','gallery','contact']. */
  enabledSections?: string[];
}

export interface SiteData {
  tenant: {
    id: string;
    slug: string;
    name: string;
    businessType: string | null;
    customDomain: string | null;
    locale: string;
  };
  template: SiteTemplate;
  enabled: boolean;
  content: SiteContent;
  theme: {
    primaryColor?: string;
    borderRadius?: string;
    logoUrl?: string;
    fontFamily?: string;
    backgroundColor?: string;
    customCss?: string;
  };
  profile: {
    description: string | null;
    city: string | null;
    address: string | null;
    photos: string[];
    businessHours: Record<string, string>;
  };
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceHellers: number;
    currency: string;
    color: string | null;
  }>;
}

@Injectable()
export class TenantSiteService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Vrátí kompletní data mini-webu (public, bez auth). */
  async getSite(slug: string): Promise<SiteData> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const tenantRows = await tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
          businessType: schema.tenants.businessType,
          customDomain: schema.tenants.customDomain,
          locale: schema.tenants.locale,
          theme: schema.tenants.theme,
          publicDescription: schema.tenants.publicDescription,
          publicCity: schema.tenants.publicCity,
          publicAddress: schema.tenants.publicAddress,
          publicPhotos: schema.tenants.publicPhotos,
          publicBusinessHours: schema.tenants.publicBusinessHours,
          siteTemplate: schema.tenants.siteTemplate,
          siteEnabled: schema.tenants.siteEnabled,
          siteContent: schema.tenants.siteContent,
        })
        .from(schema.tenants)
        .where(
          and(
            eq(schema.tenants.slug, slug),
            isNull(schema.tenants.deletedAt),
            isNull(schema.tenants.suspendedAt),
          ),
        )
        .limit(1);

      const t = tenantRows[0];
      if (!t) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Salon nenalezen.' },
        });
      }

      const services = await tx
        .select({
          id: schema.services.id,
          name: schema.services.name,
          description: schema.services.description,
          durationMinutes: schema.services.durationMinutes,
          priceHellers: schema.services.priceHellers,
          currency: schema.services.currency,
          color: schema.services.color,
        })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.tenantId, t.id),
            eq(schema.services.isPublic, true),
            eq(schema.services.isActive, true),
            isNull(schema.services.deletedAt),
          ),
        )
        .orderBy(asc(schema.services.sortOrder), asc(schema.services.name));

      const template = (
        VALID_TEMPLATES.includes(t.siteTemplate as SiteTemplate) ? t.siteTemplate : 'elegant'
      ) as SiteTemplate;

      return {
        tenant: {
          id: t.id,
          slug: t.slug,
          name: t.name,
          businessType: t.businessType,
          customDomain: t.customDomain,
          locale: t.locale,
        },
        template,
        enabled: t.siteEnabled,
        content: (t.siteContent ?? {}) as SiteContent,
        theme: (t.theme ?? {}) as SiteData['theme'],
        profile: {
          description: t.publicDescription,
          city: t.publicCity,
          address: t.publicAddress,
          photos: Array.isArray(t.publicPhotos) ? (t.publicPhotos as string[]) : [],
          businessHours:
            typeof t.publicBusinessHours === 'object' && t.publicBusinessHours !== null
              ? (t.publicBusinessHours as Record<string, string>)
              : {},
        },
        services,
      };
    });
  }

  // ─── Admin (tenant vlastník) ────────────────────────────────────────────

  async getSiteSettings(tenantId: string): Promise<{
    template: SiteTemplate | null;
    enabled: boolean;
    content: SiteContent;
  }> {
    const rows = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          siteTemplate: schema.tenants.siteTemplate,
          siteEnabled: schema.tenants.siteEnabled,
          siteContent: schema.tenants.siteContent,
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
      template: VALID_TEMPLATES.includes(t.siteTemplate as SiteTemplate)
        ? (t.siteTemplate as SiteTemplate)
        : null,
      enabled: t.siteEnabled,
      content: (t.siteContent ?? {}) as SiteContent,
    };
  }

  async updateSiteSettings(
    tenantId: string,
    patch: {
      template?: SiteTemplate | null;
      enabled?: boolean;
      content?: SiteContent;
    },
  ): Promise<{ template: SiteTemplate | null; enabled: boolean; content: SiteContent }> {
    if (
      patch.template !== undefined &&
      patch.template !== null &&
      !VALID_TEMPLATES.includes(patch.template)
    ) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_TEMPLATE',
          message: `Šablona musí být jedno z: ${VALID_TEMPLATES.join(', ')}.`,
        },
      });
    }
    if (patch.content !== undefined) {
      // Basic validation — limity velikosti
      const serialized = JSON.stringify(patch.content);
      if (serialized.length > 100_000) {
        throw new BadRequestException({
          error: {
            code: 'CONTENT_TOO_LARGE',
            message: 'Obsah mini-webu je moc velký (max 100 kB).',
          },
        });
      }
    }

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.template !== undefined) updates.siteTemplate = patch.template;
      if (patch.enabled !== undefined) updates.siteEnabled = patch.enabled;
      if (patch.content !== undefined) updates.siteContent = patch.content;
      await tx.update(schema.tenants).set(updates).where(eq(schema.tenants.id, tenantId));
    });

    return this.getSiteSettings(tenantId);
  }
}
