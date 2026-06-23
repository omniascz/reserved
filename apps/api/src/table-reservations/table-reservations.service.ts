// TableReservationsService — rezervace stolu v restauraci (vertikála Restaurace).
//
// Stůl = resource (type='table'). Obsazenost stolů (R1 jeden, R3 slučování N) je
// autoritativně v `table_reservation_tables` s JEDNÍM EXCLUDE — slučování proto
// nemá slepé místo. Vložení rezervace + obsazení stolů běží v jedné transakci
// (withRlsContext); kolize = PG 23P01 → celá rezervace se rollbackne.
//
// Doba sezení (turn time) i pacing/zálohy vycházejí ze směny (service_period).
// Úklidový buffer zahrň do turn_time_rules (okno scanu = okno zápisu, konzistentně).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, gt, isNull, lt, notInArray } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService, type Database } from '../db/db.service.js';
import type {
  CreateTableReservationDto,
  AvailableTablesDto,
  OverviewDto,
  WalkInDto,
} from './dto/table-reservation.dto.js';
import {
  DEFAULT_TURN_MINUTES,
  computeDeposit,
  computeEndsAt,
  pacingAllows,
  pickCombination,
  pickTable,
  resolveTurnTimeMinutes,
  type CombinationCandidate,
  type TurnTimeRule,
} from './table-availability.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];
/** Stavy mimo tyto stůl uvolňují (shoda s EXCLUDE WHERE). */
const RELEASING_STATUSES = ['cancelled', 'no_show'];

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

interface TableMeta {
  seats?: number;
}
export interface FreeTable {
  id: string;
  name: string;
  seats: number;
}

@Injectable()
export class TableReservationsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateTableReservationDto) {
    assertCanManage(role);
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException({
        error: { code: 'INVALID_START', message: 'Neplatný čas příchodu.' },
      });
    }

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const period = dto.servicePeriodId
        ? await this.loadPeriod(tx, tenantId, dto.servicePeriodId)
        : null;

      const turnMinutes =
        dto.turnMinutes ??
        resolveTurnTimeMinutes(
          dto.partySize,
          (period?.turnTimeRules as TurnTimeRule[] | undefined) ?? [],
          DEFAULT_TURN_MINUTES,
        );
      const endsAt = computeEndsAt(startsAt, turnMinutes);

      // 1) Urči stoly: ruční výběr (resourceId) NEBO auto (jeden stůl / sloučení).
      const assigned = await this.resolveTables(tx, tenantId, dto, startsAt, endsAt);

      // 2) Pacing — jen když směna definuje stropy.
      if (period && (period.maxCoversPerSlot != null || period.maxPartiesPerSlot != null)) {
        await this.assertPacing(tx, tenantId, startsAt, dto.partySize, period);
      }

      // 3) Záloha: explicitní z DTO, jinak dle směny a počtu hostů.
      const deposit =
        dto.depositHellers && dto.depositHellers > 0
          ? dto.depositHellers
          : computeDeposit(
              dto.partySize,
              period?.depositThresholdGuests ?? null,
              period?.depositPerGuestHellers ?? 0,
            );

      // 4) Vlož rezervaci + obsazení stolů v jedné transakci.
      try {
        const [reservation] = await tx
          .insert(schema.tableReservations)
          .values({
            tenantId,
            branchId: dto.branchId ?? null,
            resourceId: assigned[0]!,
            servicePeriodId: dto.servicePeriodId ?? null,
            customerId: dto.customerId ?? null,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail ?? null,
            customerPhone: dto.customerPhone ?? null,
            startsAt,
            endsAt,
            partySize: dto.partySize,
            seatingPref: dto.seatingPref ?? null,
            occasion: dto.occasion ?? null,
            depositHellers: deposit,
            status: 'confirmed',
            note: dto.note ?? null,
            createdBy: userId,
          })
          .returning();

        await tx.insert(schema.tableReservationTables).values(
          assigned.map((resourceId, i) => ({
            tenantId,
            reservationId: reservation!.id,
            resourceId,
            isPrimary: i === 0,
            occupiedStartsAt: startsAt,
            occupiedEndsAt: endsAt,
            status: 'confirmed',
          })),
        );

        return { ...reservation!, tables: assigned };
      } catch (err) {
        if (this.isExcludeViolation(err)) {
          throw new BadRequestException({
            error: {
              code: 'TABLE_CONFLICT',
              message: 'Některý ze stolů je v tento čas už obsazený. Zkus jiný čas.',
            },
          });
        }
        throw err;
      }
    });
  }

  /** Walk-in: host bez rezervace teď → vytvoř a rovnou usaď. */
  async walkIn(tenantId: string, userId: string, role: AppRole, dto: WalkInDto) {
    const nowIso = new Date(Date.now()).toISOString();
    const reservation = await this.create(tenantId, userId, role, {
      ...dto,
      startsAt: nowIso,
      customerName: dto.customerName ?? 'Walk-in',
      depositHellers: 0,
    });
    const seated = await this.seat(tenantId, userId, role, reservation.id);
    return { ...seated, tables: reservation.tables };
  }

  /** Volné stoly pro daný příchod a velikost skupiny. */
  async availableTables(tenantId: string, userId: string, role: AppRole, opts: AvailableTablesDto) {
    assertCanManage(role);
    const startsAt = new Date(opts.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException({
        error: { code: 'INVALID_START', message: 'Neplatný čas příchodu.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const period = opts.servicePeriodId
        ? await this.loadPeriod(tx, tenantId, opts.servicePeriodId)
        : null;
      const turnMinutes =
        opts.turnMinutes ??
        resolveTurnTimeMinutes(
          opts.partySize,
          (period?.turnTimeRules as TurnTimeRule[] | undefined) ?? [],
          DEFAULT_TURN_MINUTES,
        );
      const endsAt = computeEndsAt(startsAt, turnMinutes);
      const free = await this.freeTablesFor(tx, tenantId, opts.branchId, startsAt, endsAt);

      const singles = free
        .filter((t) => t.seats >= opts.partySize)
        .sort((a, b) => a.seats - b.seats);
      // Sloučené sestavy, jejichž všechny stoly jsou volné.
      const freeSet = new Set(free.map((t) => t.id));
      const combos = await this.loadCombinations(tx, tenantId, opts.branchId);
      const combinations = combos
        .filter(
          (c) =>
            opts.partySize >= c.minPartySize &&
            opts.partySize <= c.combinedCapacity &&
            c.resourceIds.every((id) => freeSet.has(id)),
        )
        .sort((a, b) => a.combinedCapacity - b.combinedCapacity);

      return { singles, combinations };
    });
  }

  /** Půdorysný přehled stolů k danému okamžiku (free / occupied + rezervace). */
  async overview(tenantId: string, userId: string, role: AppRole, opts: OverviewDto) {
    assertCanManage(role);
    const at = opts.at ? new Date(opts.at) : new Date(Date.now());
    if (Number.isNaN(at.getTime())) {
      throw new BadRequestException({
        error: { code: 'INVALID_TIME', message: 'Neplatný čas.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [
        eq(schema.resources.tenantId, tenantId),
        eq(schema.resources.type, 'table'),
        eq(schema.resources.isActive, true),
        isNull(schema.resources.deletedAt),
      ];
      if (opts.branchId) conds.push(eq(schema.resources.branchId, opts.branchId));
      const tables = await tx
        .select({
          id: schema.resources.id,
          name: schema.resources.name,
          branchId: schema.resources.branchId,
          metadata: schema.resources.metadata,
        })
        .from(schema.resources)
        .where(and(...conds))
        .orderBy(schema.resources.name);

      // Aktuálně obsazené stoly v okamžiku `at`.
      const occupied = await tx
        .select({
          resourceId: schema.tableReservationTables.resourceId,
          reservationId: schema.tableReservationTables.reservationId,
          occupiedEndsAt: schema.tableReservationTables.occupiedEndsAt,
        })
        .from(schema.tableReservationTables)
        .where(
          and(
            eq(schema.tableReservationTables.tenantId, tenantId),
            notInArray(schema.tableReservationTables.status, RELEASING_STATUSES),
            lt(schema.tableReservationTables.occupiedStartsAt, at),
            gt(schema.tableReservationTables.occupiedEndsAt, at),
          ),
        );
      const byResource = new Map(occupied.map((o) => [o.resourceId, o]));

      return tables.map((t) => {
        const occ = byResource.get(t.id);
        return {
          id: t.id,
          name: t.name,
          branchId: t.branchId,
          seats: ((t.metadata ?? {}) as TableMeta).seats ?? 0,
          status: occ ? ('occupied' as const) : ('free' as const),
          reservationId: occ?.reservationId ?? null,
          freeAt: occ?.occupiedEndsAt ?? null,
        };
      });
    });
  }

  async list(tenantId: string, userId: string, role: AppRole, filters?: { status?: string }) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [eq(schema.tableReservations.tenantId, tenantId)];
      if (filters?.status) conds.push(eq(schema.tableReservations.status, filters.status));
      return tx
        .select()
        .from(schema.tableReservations)
        .where(and(...conds))
        .orderBy(desc(schema.tableReservations.startsAt))
        .limit(500);
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [reservation] = await tx
        .select()
        .from(schema.tableReservations)
        .where(
          and(eq(schema.tableReservations.id, id), eq(schema.tableReservations.tenantId, tenantId)),
        )
        .limit(1);
      if (!reservation) {
        throw new NotFoundException({
          error: { code: 'RESERVATION_NOT_FOUND', message: 'Rezervace nenalezena.' },
        });
      }
      const tables = await tx
        .select({
          resourceId: schema.tableReservationTables.resourceId,
          isPrimary: schema.tableReservationTables.isPrimary,
        })
        .from(schema.tableReservationTables)
        .where(eq(schema.tableReservationTables.reservationId, id));
      return { ...reservation, tables };
    });
  }

  // ── interní pomocné ────────────────────────────────────────────────

  /** Vrátí seznam stolů, které rezervace obsadí (1 ruční / 1 auto / N sloučené). */
  private async resolveTables(
    tx: Database,
    tenantId: string,
    dto: CreateTableReservationDto,
    startsAt: Date,
    endsAt: Date,
  ): Promise<string[]> {
    // Ruční výběr konkrétního stolu.
    if (dto.resourceId) {
      const [table] = await tx
        .select({ id: schema.resources.id, type: schema.resources.type })
        .from(schema.resources)
        .where(
          and(
            eq(schema.resources.id, dto.resourceId),
            eq(schema.resources.tenantId, tenantId),
            isNull(schema.resources.deletedAt),
          ),
        )
        .limit(1);
      if (!table) {
        throw new NotFoundException({
          error: { code: 'TABLE_NOT_FOUND', message: 'Stůl nenalezen.' },
        });
      }
      if (table.type !== 'table') {
        throw new BadRequestException({
          error: { code: 'NOT_A_TABLE', message: 'Zdroj není stůl (type=table).' },
        });
      }
      return [dto.resourceId];
    }

    // Auto: nejdřív jeden dost velký volný stůl.
    const free = await this.freeTablesFor(
      tx,
      tenantId,
      dto.branchId ?? undefined,
      startsAt,
      endsAt,
    );
    const single = pickTable(
      free.map((t) => ({ id: t.id, seats: t.seats })),
      dto.partySize,
    );
    if (single) return [single.id];

    // Jinak slučitelná sestava, jejíž všechny stoly jsou volné.
    const combos = await this.loadCombinations(tx, tenantId, dto.branchId ?? undefined);
    const combo = pickCombination(combos, dto.partySize, new Set(free.map((t) => t.id)));
    if (combo) return combo.resourceIds;

    throw new BadRequestException({
      error: {
        code: 'NO_TABLE_AVAILABLE',
        message: 'Pro tento čas a počet hostů není volný stůl ani sestava.',
      },
    });
  }

  /** Volné stoly (resource type='table') v okně [startsAt, endsAt). */
  private async freeTablesFor(
    tx: Database,
    tenantId: string,
    branchId: string | undefined,
    startsAt: Date,
    endsAt: Date,
  ): Promise<FreeTable[]> {
    const busy = await tx
      .select({ resourceId: schema.tableReservationTables.resourceId })
      .from(schema.tableReservationTables)
      .where(
        and(
          eq(schema.tableReservationTables.tenantId, tenantId),
          notInArray(schema.tableReservationTables.status, RELEASING_STATUSES),
          lt(schema.tableReservationTables.occupiedStartsAt, endsAt),
          gt(schema.tableReservationTables.occupiedEndsAt, startsAt),
        ),
      );
    const busyIds = [...new Set(busy.map((b) => b.resourceId))];

    const conds = [
      eq(schema.resources.tenantId, tenantId),
      eq(schema.resources.type, 'table'),
      eq(schema.resources.isActive, true),
      isNull(schema.resources.deletedAt),
    ];
    if (branchId) conds.push(eq(schema.resources.branchId, branchId));
    if (busyIds.length > 0) conds.push(notInArray(schema.resources.id, busyIds));

    const rows = await tx
      .select({
        id: schema.resources.id,
        name: schema.resources.name,
        metadata: schema.resources.metadata,
      })
      .from(schema.resources)
      .where(and(...conds))
      .orderBy(schema.resources.name);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      seats: ((r.metadata ?? {}) as TableMeta).seats ?? 0,
    }));
  }

  private async loadCombinations(
    tx: Database,
    tenantId: string,
    branchId: string | undefined,
  ): Promise<CombinationCandidate[]> {
    const conds = [
      eq(schema.tableCombinations.tenantId, tenantId),
      eq(schema.tableCombinations.isActive, true),
      isNull(schema.tableCombinations.deletedAt),
    ];
    if (branchId) conds.push(eq(schema.tableCombinations.branchId, branchId));
    const rows = await tx
      .select()
      .from(schema.tableCombinations)
      .where(and(...conds));
    return rows.map((c) => ({
      id: c.id,
      resourceIds: c.resourceIds,
      combinedCapacity: c.combinedCapacity,
      minPartySize: c.minPartySize,
    }));
  }

  private async assertPacing(
    tx: Database,
    tenantId: string,
    startsAt: Date,
    partySize: number,
    period: {
      slotIntervalMin: number;
      maxCoversPerSlot: number | null;
      maxPartiesPerSlot: number | null;
    },
  ): Promise<void> {
    const slotEnd = new Date(startsAt.getTime() + period.slotIntervalMin * 60_000);
    const inSlot = await tx
      .select({ partySize: schema.tableReservations.partySize })
      .from(schema.tableReservations)
      .where(
        and(
          eq(schema.tableReservations.tenantId, tenantId),
          notInArray(schema.tableReservations.status, RELEASING_STATUSES),
          gte(schema.tableReservations.startsAt, startsAt),
          lt(schema.tableReservations.startsAt, slotEnd),
        ),
      );
    const state = {
      coversBooked: inSlot.reduce((sum, r) => sum + r.partySize, 0),
      partiesBooked: inSlot.length,
    };
    if (!pacingAllows(state, partySize, period.maxCoversPerSlot, period.maxPartiesPerSlot)) {
      throw new BadRequestException({
        error: {
          code: 'PACING_FULL',
          message: 'Kapacita pro tento čas je vyčerpaná. Zvol jiný čas.',
        },
      });
    }
  }

  private async loadPeriod(tx: Database, tenantId: string, servicePeriodId: string) {
    const [period] = await tx
      .select()
      .from(schema.servicePeriods)
      .where(
        and(
          eq(schema.servicePeriods.id, servicePeriodId),
          eq(schema.servicePeriods.tenantId, tenantId),
          isNull(schema.servicePeriods.deletedAt),
        ),
      )
      .limit(1);
    if (!period) {
      throw new NotFoundException({
        error: { code: 'PERIOD_NOT_FOUND', message: 'Směna nenalezena.' },
      });
    }
    return period;
  }

  private isExcludeViolation(err: unknown): boolean {
    const e = err as { code?: string; cause?: { code?: string } };
    return (e.code ?? e.cause?.code) === '23P01';
  }

  private async setStatus(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    status: 'seated' | 'completed' | 'no_show' | 'cancelled',
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.tableReservations)
        .set({ status, updatedAt: new Date() })
        .where(
          and(eq(schema.tableReservations.id, id), eq(schema.tableReservations.tenantId, tenantId)),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'RESERVATION_NOT_FOUND', message: 'Rezervace nenalezena.' },
        });
      }
      // Zrcadli stav do obsazení stolů (uvolní stůl při cancel/no_show).
      await tx
        .update(schema.tableReservationTables)
        .set({ status })
        .where(
          and(
            eq(schema.tableReservationTables.reservationId, id),
            eq(schema.tableReservationTables.tenantId, tenantId),
          ),
        );
      return updated;
    });
  }

  seat(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'seated');
  }
  complete(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'completed');
  }
  noShow(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'no_show');
  }
  cancel(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.setStatus(tenantId, userId, role, id, 'cancelled');
  }
}
