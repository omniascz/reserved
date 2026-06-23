// ServicePeriodsService — správa směn (dayparts) restaurace.
// Konfigurace, ze které čerpá rezervace stolu: turn time, pacing, zálohy.

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateServicePeriodDto, UpdateServicePeriodDto } from './dto/service-period.dto.js';

const CONFIG_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanConfigure(role: AppRole): void {
  if (!CONFIG_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Jen vlastník/manažer může spravovat směny.' },
    });
  }
}

@Injectable()
export class ServicePeriodsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateServicePeriodDto) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [period] = await tx
        .insert(schema.servicePeriods)
        .values({
          tenantId,
          branchId: dto.branchId,
          name: dto.name,
          daysOfWeek: dto.daysOfWeek,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          lastSeating: dto.lastSeating ?? null,
          slotIntervalMin: dto.slotIntervalMin,
          maxCoversPerSlot: dto.maxCoversPerSlot ?? null,
          maxPartiesPerSlot: dto.maxPartiesPerSlot ?? null,
          turnTimeRules: dto.turnTimeRules,
          depositThresholdGuests: dto.depositThresholdGuests ?? null,
          depositPerGuestHellers: dto.depositPerGuestHellers,
        })
        .returning();
      return period!;
    });
  }

  async list(tenantId: string, userId: string, role: AppRole, branchId?: string) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [
        eq(schema.servicePeriods.tenantId, tenantId),
        isNull(schema.servicePeriods.deletedAt),
      ];
      if (branchId) conds.push(eq(schema.servicePeriods.branchId, branchId));
      return tx
        .select()
        .from(schema.servicePeriods)
        .where(and(...conds))
        .orderBy(asc(schema.servicePeriods.startsAt));
    });
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    dto: UpdateServicePeriodDto,
  ) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.servicePeriods)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.daysOfWeek !== undefined && { daysOfWeek: dto.daysOfWeek }),
          ...(dto.startsAt !== undefined && { startsAt: dto.startsAt }),
          ...(dto.endsAt !== undefined && { endsAt: dto.endsAt }),
          ...(dto.lastSeating !== undefined && { lastSeating: dto.lastSeating }),
          ...(dto.slotIntervalMin !== undefined && { slotIntervalMin: dto.slotIntervalMin }),
          ...(dto.maxCoversPerSlot !== undefined && { maxCoversPerSlot: dto.maxCoversPerSlot }),
          ...(dto.maxPartiesPerSlot !== undefined && { maxPartiesPerSlot: dto.maxPartiesPerSlot }),
          ...(dto.turnTimeRules !== undefined && { turnTimeRules: dto.turnTimeRules }),
          ...(dto.depositThresholdGuests !== undefined && {
            depositThresholdGuests: dto.depositThresholdGuests,
          }),
          ...(dto.depositPerGuestHellers !== undefined && {
            depositPerGuestHellers: dto.depositPerGuestHellers,
          }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.servicePeriods.id, id),
            eq(schema.servicePeriods.tenantId, tenantId),
            isNull(schema.servicePeriods.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'PERIOD_NOT_FOUND', message: 'Směna nenalezena.' },
        });
      }
      return updated;
    });
  }

  async remove(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [deleted] = await tx
        .update(schema.servicePeriods)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(schema.servicePeriods.id, id),
            eq(schema.servicePeriods.tenantId, tenantId),
            isNull(schema.servicePeriods.deletedAt),
          ),
        )
        .returning({ id: schema.servicePeriods.id });
      if (!deleted) {
        throw new NotFoundException({
          error: { code: 'PERIOD_NOT_FOUND', message: 'Směna nenalezena.' },
        });
      }
      return { id: deleted.id, deleted: true };
    });
  }
}
