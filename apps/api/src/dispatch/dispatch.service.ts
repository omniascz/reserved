// DispatchService — dispečink zakázek (Motor 4, sprint 10.24).
//
// Malá logistika: zakázka (vyzvednutí→doručení) přiřazená vozu + řidiči
// v časovém okně. Vůz ani řidič nesmí mít dvě překrývající se zakázky
// (app pre-check + DB EXCLUDE). Routing/optimalizace tras = mimo (externí).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateJobDto } from './dto/dispatch.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
    });
  }
}

@Injectable()
export class DispatchService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateJobDto) {
    assertCanManage(role);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + dto.durationMinutes * 60_000);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [vehicle] = await tx
        .select({ id: schema.resources.id, name: schema.resources.name })
        .from(schema.resources)
        .where(
          and(
            eq(schema.resources.id, dto.vehicleId),
            eq(schema.resources.tenantId, tenantId),
            isNull(schema.resources.deletedAt),
          ),
        )
        .limit(1);
      if (!vehicle) {
        throw new NotFoundException({
          error: { code: 'VEHICLE_NOT_FOUND', message: 'Vozidlo nenalezeno.' },
        });
      }
      const [driver] = await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.id, dto.driverId), eq(schema.employees.tenantId, tenantId)))
        .limit(1);
      if (!driver) {
        throw new NotFoundException({
          error: { code: 'DRIVER_NOT_FOUND', message: 'Řidič nenalezen.' },
        });
      }

      // Pre-check překryvu — vůz.
      const vehicleClash = await tx
        .select({ id: schema.logisticsJobs.id })
        .from(schema.logisticsJobs)
        .where(
          and(
            eq(schema.logisticsJobs.tenantId, tenantId),
            eq(schema.logisticsJobs.vehicleId, dto.vehicleId),
            lt(schema.logisticsJobs.startsAt, endsAt),
            gt(schema.logisticsJobs.endsAt, startsAt),
            // jen nezrušené
            eq(schema.logisticsJobs.status, 'scheduled'),
          ),
        )
        .limit(1);
      if (vehicleClash.length > 0) {
        throw new BadRequestException({
          error: {
            code: 'VEHICLE_BUSY',
            message: `Vozidlo „${vehicle.name}" má v tom čase jinou zakázku.`,
          },
        });
      }
      // Pre-check překryvu — řidič.
      const driverClash = await tx
        .select({ id: schema.logisticsJobs.id })
        .from(schema.logisticsJobs)
        .where(
          and(
            eq(schema.logisticsJobs.tenantId, tenantId),
            eq(schema.logisticsJobs.driverId, dto.driverId),
            lt(schema.logisticsJobs.startsAt, endsAt),
            gt(schema.logisticsJobs.endsAt, startsAt),
            eq(schema.logisticsJobs.status, 'scheduled'),
          ),
        )
        .limit(1);
      if (driverClash.length > 0) {
        throw new BadRequestException({
          error: { code: 'DRIVER_BUSY', message: 'Řidič má v tom čase jinou zakázku.' },
        });
      }

      try {
        const [job] = await tx
          .insert(schema.logisticsJobs)
          .values({
            tenantId,
            branchId: dto.branchId ?? null,
            vehicleId: dto.vehicleId,
            driverId: dto.driverId,
            customerName: dto.customerName ?? null,
            customerPhone: dto.customerPhone ?? null,
            pickupAddress: dto.pickupAddress,
            dropoffAddress: dto.dropoffAddress,
            startsAt,
            endsAt,
            weightGrams: dto.weightGrams ?? null,
            priceHellers: dto.priceHellers,
            status: 'scheduled',
            note: dto.note ?? null,
            createdBy: userId,
          })
          .returning();
        return job!;
      } catch (err) {
        const e = err as {
          code?: string;
          constraint_name?: string;
          cause?: { code?: string; constraint_name?: string };
        };
        const pgCode = e.code ?? e.cause?.code;
        if (pgCode === '23P01') {
          const c = e.constraint_name ?? e.cause?.constraint_name ?? '';
          throw new BadRequestException({
            error: {
              code: c.includes('driver') ? 'DRIVER_BUSY' : 'VEHICLE_BUSY',
              message: 'V daném čase už je naplánovaná jiná zakázka.',
            },
          });
        }
        throw err;
      }
    });
  }

  async list(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters?: { status?: string; driverId?: string; vehicleId?: string },
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [eq(schema.logisticsJobs.tenantId, tenantId)];
      if (filters?.status) conds.push(eq(schema.logisticsJobs.status, filters.status));
      if (filters?.driverId) conds.push(eq(schema.logisticsJobs.driverId, filters.driverId));
      if (filters?.vehicleId) conds.push(eq(schema.logisticsJobs.vehicleId, filters.vehicleId));
      return tx
        .select()
        .from(schema.logisticsJobs)
        .where(and(...conds))
        .orderBy(desc(schema.logisticsJobs.startsAt))
        .limit(500);
    });
  }

  private async setStatus(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    status: 'in_progress' | 'done' | 'cancelled',
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.logisticsJobs)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(schema.logisticsJobs.id, id), eq(schema.logisticsJobs.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'JOB_NOT_FOUND', message: 'Zakázka nenalezena.' },
        });
      }
      return updated;
    });
  }

  start(t: string, u: string, r: AppRole, id: string) {
    return this.setStatus(t, u, r, id, 'in_progress');
  }
  complete(t: string, u: string, r: AppRole, id: string) {
    return this.setStatus(t, u, r, id, 'done');
  }
  cancel(t: string, u: string, r: AppRole, id: string) {
    return this.setStatus(t, u, r, id, 'cancelled');
  }
}
