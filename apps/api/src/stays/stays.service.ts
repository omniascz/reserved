// StaysService — pobyt na dny (Motor 2, sprint 10.22).
//
// Rezervace jednotky (pokoj/auto = resource) na rozsah nocí. Ochrana proti
// dvojí rezervaci přes daterange EXCLUDE (půlotevřený interval — den odjezdu
// je volný pro dalšího). Dostupnost = jednotky bez překryvu v daném rozsahu.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, isNull, lt, ne, notInArray } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateStayDto } from './dto/stay.dto.js';

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
function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
}

@Injectable()
export class StaysService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateStayDto) {
    assertCanManage(role);
    const nights = nightsBetween(dto.checkIn, dto.checkOut);
    if (nights <= 0) {
      throw new BadRequestException({
        error: { code: 'INVALID_DATES', message: 'Datum odjezdu musí být po datu příjezdu.' },
      });
    }
    const total = nights * dto.pricePerNightHellers;

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [resource] = await tx
        .select({ id: schema.resources.id, name: schema.resources.name })
        .from(schema.resources)
        .where(
          and(
            eq(schema.resources.id, dto.resourceId),
            eq(schema.resources.tenantId, tenantId),
            isNull(schema.resources.deletedAt),
          ),
        )
        .limit(1);
      if (!resource) {
        throw new NotFoundException({
          error: { code: 'UNIT_NOT_FOUND', message: 'Jednotka (pokoj/auto) nenalezena.' },
        });
      }

      try {
        const [stay] = await tx
          .insert(schema.stays)
          .values({
            tenantId,
            branchId: dto.branchId ?? null,
            resourceId: dto.resourceId,
            customerId: dto.customerId ?? null,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail ?? null,
            customerPhone: dto.customerPhone ?? null,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            nights,
            guests: dto.guests,
            pricePerNightHellers: dto.pricePerNightHellers,
            totalHellers: total,
            status: 'confirmed',
            note: dto.note ?? null,
            createdBy: userId,
          })
          .returning();
        return stay!;
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        const pgCode = e.code ?? e.cause?.code;
        if (pgCode === '23P01') {
          throw new BadRequestException({
            error: {
              code: 'STAY_CONFLICT',
              message: `Jednotka „${resource.name}" je v těchto dnech už obsazená.`,
            },
          });
        }
        throw err;
      }
    });
  }

  /** Volné jednotky pro daný rozsah dní (žádný překryv s nezrušeným pobytem). */
  async availableUnits(
    tenantId: string,
    userId: string,
    role: AppRole,
    opts: { checkIn: string; checkOut: string; branchId?: string },
  ) {
    assertCanManage(role);
    if (nightsBetween(opts.checkIn, opts.checkOut) <= 0) {
      throw new BadRequestException({
        error: { code: 'INVALID_DATES', message: 'Neplatný rozsah dní.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Obsazené jednotky: pobyt překrývá [checkIn, checkOut) a není zrušený.
      const busy = await tx
        .select({ resourceId: schema.stays.resourceId })
        .from(schema.stays)
        .where(
          and(
            eq(schema.stays.tenantId, tenantId),
            ne(schema.stays.status, 'cancelled'),
            lt(schema.stays.checkIn, opts.checkOut),
            gt(schema.stays.checkOut, opts.checkIn),
          ),
        );
      const busyIds = [...new Set(busy.map((b) => b.resourceId))];

      const conds = [eq(schema.resources.tenantId, tenantId), isNull(schema.resources.deletedAt)];
      if (opts.branchId) conds.push(eq(schema.resources.branchId, opts.branchId));
      if (busyIds.length > 0) conds.push(notInArray(schema.resources.id, busyIds));

      return tx
        .select({
          id: schema.resources.id,
          name: schema.resources.name,
          type: schema.resources.type,
          branchId: schema.resources.branchId,
        })
        .from(schema.resources)
        .where(and(...conds))
        .orderBy(schema.resources.name);
    });
  }

  async list(tenantId: string, userId: string, role: AppRole, filters?: { status?: string }) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [eq(schema.stays.tenantId, tenantId)];
      if (filters?.status) conds.push(eq(schema.stays.status, filters.status));
      return tx
        .select()
        .from(schema.stays)
        .where(and(...conds))
        .orderBy(desc(schema.stays.checkIn))
        .limit(500);
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [stay] = await tx
        .select()
        .from(schema.stays)
        .where(and(eq(schema.stays.id, id), eq(schema.stays.tenantId, tenantId)))
        .limit(1);
      if (!stay) {
        throw new NotFoundException({
          error: { code: 'STAY_NOT_FOUND', message: 'Pobyt nenalezen.' },
        });
      }
      return stay;
    });
  }

  /** Změna stavu pobytu (check-in / check-out / zrušení). */
  private async setStatus(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    status: 'checked_in' | 'checked_out' | 'cancelled',
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.stays)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(schema.stays.id, id), eq(schema.stays.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'STAY_NOT_FOUND', message: 'Pobyt nenalezen.' },
        });
      }
      return updated;
    });
  }

  cancel(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'cancelled');
  }
  checkIn(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'checked_in');
  }
  checkOut(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'checked_out');
  }
}
