// Master admin endpointy pro spravu tenantu — read-only + master akce.
// Vsechny endpointy chrani PlatformGuard.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { PlatformGuard } from './platform.guard.js';
import {
  PlatformTenantsService,
  type TenantActivity,
  type TenantDetail,
  type TenantListResult,
  type TenantOnboarding,
} from './platform-tenants.service.js';
import { PlatformTenantActionsService } from './platform-tenant-actions.service.js';
import { PlatformAuditService } from './platform-audit.service.js';
import { CurrentPlatformAdmin } from './decorators/current-admin.decorator.js';
import type { PlatformAccessPayload } from './platform-jwt.service.js';
import {
  ChangePlanSchema,
  ExtendTrialSchema,
  SuspendTenantSchema,
  type ChangePlanDto,
  type ExtendTrialDto,
  type SuspendTenantDto,
} from './dto/platform-tenant-actions.dto.js';

@Public()
@UseGuards(PlatformGuard)
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(
    @Inject(PlatformTenantsService) private readonly tenants: PlatformTenantsService,
    @Inject(PlatformTenantActionsService) private readonly actions: PlatformTenantActionsService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  private actionContext(
    req: Request,
    admin: PlatformAccessPayload,
  ): { adminId: string; ip?: string; ua?: string } {
    return {
      adminId: admin.sub,
      ip: req.ip,
      ua: req.headers['user-agent'],
    };
  }

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

  // ─── Master akce ────────────────────────────────────────────────────────

  @Post(':id/suspend')
  @HttpCode(204)
  async suspend(
    @Req() req: Request,
    @CurrentPlatformAdmin() admin: PlatformAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(SuspendTenantSchema)) dto: SuspendTenantDto,
  ): Promise<void> {
    await this.actions.suspend(id, dto, this.actionContext(req, admin));
  }

  @Post(':id/reactivate')
  @HttpCode(204)
  async reactivate(
    @Req() req: Request,
    @CurrentPlatformAdmin() admin: PlatformAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.actions.reactivate(id, this.actionContext(req, admin));
  }

  @Post(':id/extend-trial')
  async extendTrial(
    @Req() req: Request,
    @CurrentPlatformAdmin() admin: PlatformAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ExtendTrialSchema)) dto: ExtendTrialDto,
  ): Promise<{ data: { trialEndsAt: Date } }> {
    const data = await this.actions.extendTrial(id, dto, this.actionContext(req, admin));
    return { data };
  }

  @Patch(':id/plan')
  @HttpCode(204)
  async changePlan(
    @Req() req: Request,
    @CurrentPlatformAdmin() admin: PlatformAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(ChangePlanSchema)) dto: ChangePlanDto,
  ): Promise<void> {
    await this.actions.changePlan(id, dto, this.actionContext(req, admin));
  }

  @Delete(':id')
  @HttpCode(204)
  async softDelete(
    @Req() req: Request,
    @CurrentPlatformAdmin() admin: PlatformAccessPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.actions.softDelete(id, this.actionContext(req, admin));
  }
}
