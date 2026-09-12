// PlatformTenantActionsService — master akce nad tenanty (suspend, plan, atd.).
//
// Vsechny akce zaroven zapisi do platform_admin_actions audit logu.

import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { PlatformAuditService } from './platform-audit.service.js';
import type {
  SuspendTenantDto,
  ExtendTrialDto,
  ChangePlanDto,
} from './dto/platform-tenant-actions.dto.js';

export interface ActionContext {
  adminId: string;
  ip?: string;
  ua?: string;
}

@Injectable()
export class PlatformTenantActionsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  async suspend(tenantId: string, dto: SuspendTenantDto, ctx: ActionContext): Promise<void> {
    const before = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      if (tenant.suspendedAt) {
        throw new BadRequestException({
          error: { code: 'ALREADY_SUSPENDED', message: 'Tenant je jiz suspendovany.' },
        });
      }
      if (tenant.deletedAt) {
        throw new BadRequestException({
          error: { code: 'TENANT_DELETED', message: 'Smazany tenant nelze suspendovat.' },
        });
      }
      await tx
        .update(schema.tenants)
        .set({
          suspendedAt: new Date(),
          suspensionReason: dto.reason,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
      return { previousStatus: tenant.status };
    });

    await this.audit.log({
      adminId: ctx.adminId,
      action: 'tenant_suspended',
      targetType: 'tenant',
      targetId: tenantId,
      payload: { reason: dto.reason, ...before },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });
  }

  async reactivate(tenantId: string, ctx: ActionContext): Promise<void> {
    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      if (!tenant.suspendedAt) {
        throw new BadRequestException({
          error: { code: 'NOT_SUSPENDED', message: 'Tenant neni suspendovany.' },
        });
      }
      await tx
        .update(schema.tenants)
        .set({
          suspendedAt: null,
          suspensionReason: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    });

    await this.audit.log({
      adminId: ctx.adminId,
      action: 'tenant_reactivated',
      targetType: 'tenant',
      targetId: tenantId,
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });
  }

  async extendTrial(
    tenantId: string,
    dto: ExtendTrialDto,
    ctx: ActionContext,
  ): Promise<{ trialEndsAt: Date }> {
    const result = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      // Bod od ktereho prodluzujeme: bud existujici trialEndsAt nebo dnes
      const base =
        tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
      const newEnd = new Date(base.getTime() + dto.days * 86400_000);
      await tx
        .update(schema.tenants)
        .set({
          trialEndsAt: newEnd,
          status: tenant.status === 'expired' ? 'trial' : tenant.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
      return { trialEndsAt: newEnd, previousEnd: tenant.trialEndsAt };
    });

    await this.audit.log({
      adminId: ctx.adminId,
      action: 'tenant_trial_extended',
      targetType: 'tenant',
      targetId: tenantId,
      payload: {
        days: dto.days,
        newTrialEndsAt: result.trialEndsAt,
        previousEnd: result.previousEnd,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });

    return { trialEndsAt: result.trialEndsAt };
  }

  async changePlan(tenantId: string, dto: ChangePlanDto, ctx: ActionContext): Promise<void> {
    const before = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      if (tenant.plan === dto.plan) {
        throw new BadRequestException({
          error: { code: 'SAME_PLAN', message: `Tenant je jiz na planu ${dto.plan}.` },
        });
      }
      await tx
        .update(schema.tenants)
        .set({ plan: dto.plan, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));
      return { previousPlan: tenant.plan };
    });

    await this.audit.log({
      adminId: ctx.adminId,
      action: 'tenant_plan_changed',
      targetType: 'tenant',
      targetId: tenantId,
      payload: { from: before.previousPlan, to: dto.plan },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });
  }

  async softDelete(tenantId: string, ctx: ActionContext): Promise<void> {
    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      if (tenant.deletedAt) {
        throw new BadRequestException({
          error: { code: 'ALREADY_DELETED', message: 'Tenant je jiz smazany.' },
        });
      }
      await tx
        .update(schema.tenants)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));
    });

    await this.audit.log({
      adminId: ctx.adminId,
      action: 'tenant_soft_deleted',
      targetType: 'tenant',
      targetId: tenantId,
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });
  }
}
