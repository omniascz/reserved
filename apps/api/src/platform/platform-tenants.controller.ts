// Master admin endpointy pro spravu tenantu — read-only cast.
// Vsechny endpointy chrani PlatformGuard.

import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformGuard } from './platform.guard.js';
import {
  PlatformTenantsService,
  type TenantActivity,
  type TenantDetail,
  type TenantListResult,
  type TenantOnboarding,
} from './platform-tenants.service.js';
import { PlatformAuditService } from './platform-audit.service.js';

@Public()
@UseGuards(PlatformGuard)
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    @Inject(PlatformTenantsService) private readonly tenants: PlatformTenantsService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('businessType') businessType?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<TenantListResult> {
    return this.tenants.list({
      status,
      plan,
      businessType,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  async detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ data: TenantDetail }> {
    return { data: await this.tenants.detail(id) };
  }

  @Get(':id/activity')
  async activity(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ data: TenantActivity }> {
    return { data: await this.tenants.activity(id) };
  }

  @Get(':id/onboarding')
  async onboarding(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ data: TenantOnboarding }> {
    return { data: await this.tenants.onboarding(id) };
  }

  @Get(':id/audit')
  async tenantAudit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: unknown[] }> {
    const data = await this.audit.list({
      targetId: id,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }
}
