import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformGuard } from './platform.guard.js';
import {
  PlatformDashboardService,
  type AtRiskTenant,
  type DashboardOverview,
  type PlatformAdoption,
  type RegistrationsPerDay,
} from './platform-dashboard.service.js';
import { PlatformAuditService } from './platform-audit.service.js';

@Public()
@UseGuards(PlatformGuard)
@Controller('platform/dashboard')
export class PlatformDashboardController {
  constructor(
    @Inject(PlatformDashboardService) private readonly dashboard: PlatformDashboardService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  @Get('overview')
  async overview(): Promise<{ data: DashboardOverview }> {
    return { data: await this.dashboard.overview() };
  }

  @Get('registrations-per-day')
  async registrationsPerDay(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<{ data: RegistrationsPerDay[] }> {
    return { data: await this.dashboard.registrationsPerDay(from, to) };
  }

  @Get('at-risk-tenants')
  async atRiskTenants(): Promise<{ data: AtRiskTenant[] }> {
    return { data: await this.dashboard.atRiskTenants() };
  }

  /** Adopce featur napříč platformou — napojené platby, MRR, moduly. */
  @Get('adoption')
  async adoption(): Promise<{ data: PlatformAdoption }> {
    return { data: await this.dashboard.adoption() };
  }
}

// Audit log napric platformou — patri sem tematicky, ale logicky pod /platform/audit.
@Public()
@UseGuards(PlatformGuard)
@Controller('platform/audit')
export class PlatformAuditController {
  constructor(@Inject(PlatformAuditService) private readonly audit: PlatformAuditService) {}

  @Get()
  async list(
    @Query('adminId') adminId?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: unknown[] }> {
    const data = await this.audit.list({
      adminId,
      targetId,
      action,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }
}
