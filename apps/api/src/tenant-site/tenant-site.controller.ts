import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { DrizzleTenantLookup } from '../tenant/tenant-lookup.service.js';
import { TenantSiteService } from './tenant-site.service.js';

@ApiTags('tenant-site')
@Controller('public')
export class TenantSiteController {
  constructor(
    @Inject(TenantSiteService) private readonly svc: TenantSiteService,
    @Inject(DrizzleTenantLookup) private readonly lookup: DrizzleTenantLookup,
  ) {}

  /** GET /api/v1/public/:slug/site — kompletní data pro tenant mini-web. */
  @Public()
  @Get(':slug/site')
  async getSite(@Param('slug') slug: string) {
    const data = await this.svc.getSite(slug);
    return { data };
  }

  /**
   * GET /api/v1/public/by-domain?host=booking.svujsalon.cz
   * Najde tenant podle custom_domain (jen ověřené). Vrátí slug.
   * Používá apps/tenant-site middleware pro routing.
   */
  @Public()
  @Get('by-domain')
  async byDomain(@Query('host') host: string) {
    if (!host) {
      throw new NotFoundException({
        error: { code: 'HOST_REQUIRED', message: 'host query param je povinný.' },
      });
    }
    const tenant = await this.lookup.byCustomDomain(host);
    if (!tenant) {
      throw new NotFoundException({
        error: { code: 'DOMAIN_NOT_FOUND', message: `Doména ${host} není registrovaná.` },
      });
    }
    return { data: { slug: tenant.slug, id: tenant.id, name: tenant.name } };
  }
}
