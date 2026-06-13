// ChainedBookingsService — řetězené (vícefázové) rezervace (Motor 3, sprint 10.23).
//
// Jedna rezervace = N segmentů, každý na svém zdroji a se svým časovým oknem.
// Každý zdroj je zamčený JEN na dobu svého segmentu → během pauzy (působení
// barvy) je volný pro jiného klienta. Staví na booking_resources (řádek/segment),
// employee_id parent rezervace je NULL (jinak by EXCLUDE zamkl trenéra na celou
// dobu a pauza by nefungovala).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateChainedDto } from './dto/chained.dto.js';

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
function refCode(): string {
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `C-${part()}-${part()}`;
}

@Injectable()
export class ChainedBookingsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateChainedDto) {
    assertCanManage(role);

    const base = new Date(dto.startsAt).getTime();
    const segments = dto.segments.map((s) => ({
      label: s.label,
      resourceId: s.resourceId,
      startsAt: new Date(base + s.startOffsetMinutes * 60_000),
      endsAt: new Date(base + (s.startOffsetMinutes + s.durationMinutes) * 60_000),
    }));
    const parentStart = new Date(Math.min(...segments.map((s) => s.startsAt.getTime())));
    const parentEnd = new Date(Math.max(...segments.map((s) => s.endsAt.getTime())));

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [service] = await tx
        .select()
        .from(schema.services)
        .where(and(eq(schema.services.id, dto.serviceId), eq(schema.services.tenantId, tenantId)))
        .limit(1);
      if (!service) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }

      // Pobočka: explicitní > default tenanta.
      let branchId = dto.branchId ?? null;
      if (!branchId) {
        const [def] = await tx
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId))
          .limit(1);
        branchId = def?.id ?? null;
      }
      if (!branchId) {
        throw new BadRequestException({
          error: { code: 'BRANCH_REQUIRED', message: 'Nelze určit pobočku.' },
        });
      }

      // Parent rezervace (bez employee_id — zámky drží segmenty, ne celá doba).
      const [booking] = await tx
        .insert(schema.bookings)
        .values({
          tenantId,
          branchId,
          serviceId: dto.serviceId,
          employeeId: null,
          customerId: dto.customerId ?? null,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone ?? null,
          startsAt: parentStart,
          endsAt: parentEnd,
          bufferStartsAt: parentStart,
          bufferEndsAt: parentEnd,
          status: 'confirmed',
          pricePaidHellers: service.priceHellers,
          currency: service.currency,
          referenceCode: refCode(),
          metadata: { source: 'chained', segments: dto.segments.length },
        })
        .returning();

      await tx.insert(schema.bookingStatusHistory).values({
        tenantId,
        bookingId: booking!.id,
        fromStatus: null,
        toStatus: 'confirmed',
        changedBy: userId,
        metadata: { source: 'chained' },
      });

      // Každý segment zamkne svůj zdroj jen na své okno.
      for (const seg of segments) {
        const [resource] = await tx
          .select({ id: schema.resources.id, name: schema.resources.name })
          .from(schema.resources)
          .where(
            and(
              eq(schema.resources.id, seg.resourceId),
              eq(schema.resources.tenantId, tenantId),
              isNull(schema.resources.deletedAt),
            ),
          )
          .limit(1);
        if (!resource) {
          throw new NotFoundException({
            error: {
              code: 'RESOURCE_NOT_FOUND',
              message: `Zdroj segmentu „${seg.label}" nenalezen.`,
            },
          });
        }
        const clash = await tx
          .select({ id: schema.bookingResources.id })
          .from(schema.bookingResources)
          .where(
            and(
              eq(schema.bookingResources.tenantId, tenantId),
              eq(schema.bookingResources.resourceId, seg.resourceId),
              eq(schema.bookingResources.status, 'active'),
              lt(schema.bookingResources.bufferStartsAt, seg.endsAt),
              gt(schema.bookingResources.bufferEndsAt, seg.startsAt),
            ),
          )
          .limit(1);
        if (clash.length > 0) {
          throw new BadRequestException({
            error: {
              code: 'SEGMENT_CONFLICT',
              message: `Zdroj „${resource.name}" je obsazený v čase fáze „${seg.label}".`,
            },
          });
        }
        await tx.insert(schema.bookingResources).values({
          tenantId,
          bookingId: booking!.id,
          resourceId: seg.resourceId,
          role: seg.label,
          bufferStartsAt: seg.startsAt,
          bufferEndsAt: seg.endsAt,
          status: 'active',
        });
      }

      return {
        id: booking!.id,
        referenceCode: booking!.referenceCode,
        startsAt: parentStart,
        endsAt: parentEnd,
        segments: segments.map((s) => ({
          label: s.label,
          resourceId: s.resourceId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        })),
      };
    });
  }
}
