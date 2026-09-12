// TenantMiddleware — resolves tenant per request a attachne na req.tenant.
//
// Order:
//   1. Subdomain (`salon-jana.reserved.cz`)
//   2. Custom domain (`rezervace.salon-jana.cz` přes CNAME)
//   3. X-Tenant-ID header (UUID nebo slug)
//
// 404 pokud tenant neexistuje. Public endpointy (např. /health, /auth/login)
// musí buď:
//   - akceptovat libovolný tenant (a /health není tenant-scoped — je @Public)
//   - používat header s konkrétním tenantem
// Pro local dev: localhost neresolvuje subdoménu, vyžaduje X-Tenant-ID nebo
// X-Tenant-Slug.

import {
  ForbiddenException,
  Inject,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { TenantConfig } from './tenant.config.js';
import { extractTenantCandidates } from './tenant.resolver.js';
import { DrizzleTenantLookup } from './tenant-lookup.service.js';
import type { ResolvedTenant } from './tenant.types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TenantLookupRow {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  suspendedAt: Date | null;
  deletedAt: Date | null;
}

export interface TenantLookup {
  bySlug(slug: string): Promise<TenantLookupRow | null>;
  byCustomDomain(domain: string): Promise<TenantLookupRow | null>;
  byId(id: string): Promise<TenantLookupRow | null>;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    @Inject(TenantConfig) private readonly config: TenantConfig,
    @Inject(DrizzleTenantLookup) private readonly lookup: TenantLookup,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Pokud je v requestu Bearer token, tenant je v něm — JwtGuard ho ověří
    // a zpřístupní přes @CurrentUser(). Middleware skipuje resolution.
    // Tohle pokrývá všechny chráněné admin endpointy.
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const candidates = extractTenantCandidates(
      {
        host: req.hostname,
        headerValue: req.headers['x-tenant-id'] as string | undefined,
      },
      this.config,
    );

    for (const candidate of candidates) {
      const tenant = await this.resolveCandidate(candidate.source, candidate.value);
      if (tenant) {
        if (tenant.deletedAt) {
          throw new NotFoundException({
            error: { code: 'TENANT_NOT_FOUND', message: 'No tenant matches this hostname.' },
          });
        }
        if (tenant.suspendedAt) {
          throw new ForbiddenException({
            error: {
              code: 'TENANT_SUSPENDED',
              message: 'Tento ucet je do casu prerusen. Kontaktujte podporu Reserved.',
            },
          });
        }
        const resolved: ResolvedTenant = {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          customDomain: tenant.customDomain,
          source: candidate.source,
        };
        req.tenant = resolved;
        next();
        return;
      }
    }

    // Žádný kandidát neresolvoval — 404 (s nezveřejňováním, který krok selhal).
    throw new NotFoundException({
      error: { code: 'TENANT_NOT_FOUND', message: 'No tenant matches this hostname.' },
    });
  }

  private async resolveCandidate(
    source: 'subdomain' | 'custom_domain' | 'header',
    value: string,
  ): Promise<TenantLookupRow | null> {
    if (source === 'subdomain') {
      return this.lookup.bySlug(value);
    }
    if (source === 'custom_domain') {
      return this.lookup.byCustomDomain(value);
    }
    // header — UUID nebo slug
    if (UUID_REGEX.test(value)) {
      return this.lookup.byId(value);
    }
    return this.lookup.bySlug(value);
  }
}
