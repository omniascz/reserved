// ClassSessionsService — skupinové lekce (sprint 10.0).
//
// Skupinová lekce = jeden trenér, kapacita N. Účastník = booking se session_id.
// Kapacitu hlídáme atomicky podmíněným UPDATE:
//   UPDATE class_sessions SET booked_count = booked_count + 1
//   WHERE id=? AND status='open' AND booked_count < capacity RETURNING ...
// UPDATE zamkne řádek a znovu vyhodnotí podmínku, takže dva souběžní zájemci
// o poslední místo nemohou projít oba (druhý dostane 0 řádků → SESSION_FULL).
// Dvojí přihlášení blokuje partial UNIQUE index bookings_session_customer_uniq.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext, serviceContext } from '@reserved/rls-multitenancy';
import type { Database } from '../db/db.service.js';
import { randomBytes } from 'node:crypto';
import { DbService } from '../db/db.service.js';
import { CustomersService } from '../customers/customers.service.js';
import type { CreateClassSessionDto, JoinClassSessionDto } from './dto/class-session.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze zaměstnanec, recepce, manager nebo owner mohou spravovat lekce.',
      },
    });
  }
}

function generateReferenceCode(): string {
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `L-${part()}-${part()}`;
}

@Injectable()
export class ClassSessionsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CustomersService) private readonly customers: CustomersService,
  ) {}

  // ─── Vypsání lekce ──────────────────────────────────────────────────

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateClassSessionDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const svcRows = await tx
        .select()
        .from(schema.services)
        .where(and(eq(schema.services.id, dto.serviceId), eq(schema.services.tenantId, tenantId)))
        .limit(1);
      const service = svcRows[0];
      if (!service) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }

      const capacity = dto.capacity ?? service.capacity;
      const isEms = !!dto.resourceId;
      if (capacity < 2 && !isEms) {
        throw new BadRequestException({
          error: {
            code: 'CAPACITY_TOO_LOW',
            message:
              'Skupinová lekce potřebuje kapacitu ≥ 2. EMS lekci vytvoř s přístrojem (resourceId); ' +
              'pro individuální termín 1:1 použij běžnou rezervaci.',
          },
        });
      }

      // EMS: ověř, že přístroj patří tenantovi a je aktivní.
      let resourceBranchId: string | null = null;
      if (dto.resourceId) {
        const r = await tx
          .select({ branchId: schema.resources.branchId })
          .from(schema.resources)
          .where(
            and(
              eq(schema.resources.id, dto.resourceId),
              eq(schema.resources.tenantId, tenantId),
              isNull(schema.resources.deletedAt),
            ),
          )
          .limit(1);
        if (!r[0]) {
          throw new NotFoundException({
            error: { code: 'RESOURCE_NOT_FOUND', message: 'Přístroj/zdroj nenalezen.' },
          });
        }
        resourceBranchId = r[0].branchId;
      }

      // Resolve branch: explicitní > pobočka trenéra > pobočka přístroje > default tenanta.
      let branchId = dto.branchId ?? null;
      if (!branchId && dto.employeeId) {
        const empBranch = await tx
          .select({ branchId: schema.employeeBranches.branchId })
          .from(schema.employeeBranches)
          .where(eq(schema.employeeBranches.employeeId, dto.employeeId))
          .limit(1);
        branchId = empBranch[0]?.branchId ?? null;
      }
      if (!branchId) branchId = resourceBranchId;
      if (!branchId) {
        const def = await tx
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenantId))
          .limit(1);
        branchId = def[0]?.id ?? null;
      }
      if (!branchId) {
        throw new BadRequestException({
          error: { code: 'BRANCH_REQUIRED', message: 'Nelze určit pobočku — vyber.' },
        });
      }

      const startsAt = new Date(dto.startsAt);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
      const bufferStartsAt = new Date(startsAt.getTime() - service.bufferBeforeMinutes * 60_000);
      const bufferEndsAt = new Date(endsAt.getTime() + service.bufferAfterMinutes * 60_000);

      try {
        const [session] = await tx
          .insert(schema.classSessions)
          .values({
            tenantId,
            branchId,
            serviceId: dto.serviceId,
            employeeId: dto.employeeId ?? null,
            resourceId: dto.resourceId ?? null,
            startsAt,
            endsAt,
            bufferStartsAt,
            bufferEndsAt,
            capacity,
            bookedCount: 0,
            status: 'open',
          })
          .returning();

        return session!;
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        const pgCode = e.code ?? e.cause?.code;
        if (pgCode === '23P01') {
          // EXCLUDE class_sessions_resource_no_overlap — přístroj je v tom čase obsazený.
          throw new BadRequestException({
            error: {
              code: 'MACHINE_TAKEN',
              message:
                'Tento přístroj má v daném čase už vypsanou lekci. Vyber jiný čas nebo přístroj.',
            },
          });
        }
        throw err;
      }
    });
  }

  // ─── Čtení ──────────────────────────────────────────────────────────

  async get(tenantId: string, userId: string, role: AppRole, sessionId: string) {
    const rows = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.classSessions)
        .where(
          and(eq(schema.classSessions.id, sessionId), eq(schema.classSessions.tenantId, tenantId)),
        )
        .limit(1);
    });
    if (!rows[0]) {
      throw new NotFoundException({
        error: { code: 'SESSION_NOT_FOUND', message: 'Lekce nenalezena.' },
      });
    }
    return rows[0];
  }

  /** Otevřené lekce s volnými místy v daném období (pro výběr termínu). */
  async listOpen(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: { serviceId?: string; from?: string; to?: string },
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [
        eq(schema.classSessions.tenantId, tenantId),
        eq(schema.classSessions.status, 'open'),
        sql`${schema.classSessions.bookedCount} < ${schema.classSessions.capacity}`,
      ];
      if (filters.serviceId) {
        conditions.push(eq(schema.classSessions.serviceId, filters.serviceId));
      }
      if (filters.from) {
        conditions.push(gte(schema.classSessions.startsAt, new Date(filters.from)));
      }
      if (filters.to) {
        conditions.push(lte(schema.classSessions.startsAt, new Date(filters.to)));
      }
      return tx
        .select()
        .from(schema.classSessions)
        .where(and(...conditions))
        .orderBy(asc(schema.classSessions.startsAt))
        .limit(200);
    });
  }

  // ─── Přihlášení účastníka (atomicky) ────────────────────────────────

  /**
   * Jádro přihlášení — atomicky rezervuje místo a vloží účastníka. Sdílené
   * admin i veřejnou cestou. Musí běžet uvnitř withRlsContext transakce.
   */
  private async performJoin(
    tx: Database,
    tenantId: string,
    sessionId: string,
    dto: JoinClassSessionDto,
    opts: { changedBy: string; source: 'admin' | 'public_widget' },
  ) {
    const sessRows = await tx
      .select()
      .from(schema.classSessions)
      .where(
        and(eq(schema.classSessions.id, sessionId), eq(schema.classSessions.tenantId, tenantId)),
      )
      .limit(1);
    const session = sessRows[0];
    if (!session) {
      return { ok: false as const, reason: 'not_found' as const };
    }

    // Už je klient v lekci? Zjisti DŘÍV než kontrolu kapacity — i u plné lekce
    // chceme vrátit „už jsi přihlášený", ne „plno".
    const existing = await tx
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.tenantId, tenantId),
          eq(schema.bookings.sessionId, sessionId),
          sql`lower(${schema.bookings.customerEmail}) = lower(${dto.customerEmail})`,
          sql`${schema.bookings.status} NOT IN ('cancelled', 'no_show')`,
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      return { ok: false as const, reason: 'already' as const };
    }

    // Atomická rezervace místa: projde jen pokud je lekce otevřená a má volno.
    const reserved = await tx
      .update(schema.classSessions)
      .set({ bookedCount: sql`${schema.classSessions.bookedCount} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(schema.classSessions.id, sessionId),
          eq(schema.classSessions.tenantId, tenantId),
          eq(schema.classSessions.status, 'open'),
          sql`${schema.classSessions.bookedCount} < ${schema.classSessions.capacity}`,
        ),
      )
      .returning({ bookedCount: schema.classSessions.bookedCount });

    if (reserved.length === 0) {
      return { ok: false as const, reason: 'full' as const };
    }

    // Resolve customer (find-or-create) — účastník musí mít customer entitu.
    const nameParts = dto.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? dto.customerName;
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const { id: customerId } = await this.customers.findOrCreate(tx, tenantId, {
      firstName,
      lastName,
      email: dto.customerEmail,
      phone: dto.customerPhone ?? null,
    });

    const svcRows = await tx
      .select()
      .from(schema.services)
      .where(eq(schema.services.id, session.serviceId))
      .limit(1);
    const service = svcRows[0]!;

    try {
      // Vnořená transakce = SAVEPOINT: kolize „klient už v lekci" se vrátí jen sem,
      // vnější transakce zůstane použitelná pro korekci obsazenosti.
      const booking = await tx.transaction(async (sp) => {
        const [b] = await sp
          .insert(schema.bookings)
          .values({
            tenantId,
            branchId: session.branchId,
            serviceId: session.serviceId,
            employeeId: session.employeeId,
            sessionId: session.id,
            customerId,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone ?? null,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            bufferStartsAt: session.bufferStartsAt,
            bufferEndsAt: session.bufferEndsAt,
            status: 'confirmed',
            pricePaidHellers: service.priceHellers,
            currency: service.currency,
            customerNote: dto.customerNote ?? null,
            referenceCode: generateReferenceCode(),
            metadata: { source: opts.source, kind: 'class_session' },
          })
          .returning();

        await sp.insert(schema.bookingStatusHistory).values({
          tenantId,
          bookingId: b!.id,
          fromStatus: null,
          toStatus: 'confirmed',
          changedBy: opts.changedBy,
          metadata: { source: opts.source, kind: 'class_session' },
        });

        return b!;
      });

      return { ok: true as const, booking };
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      const pgCode = e.code ?? e.cause?.code;
      if (pgCode === '23505') {
        // partial unique (session_id, customer_id): klient už v lekci je → vrať místo.
        await tx
          .update(schema.classSessions)
          .set({
            bookedCount: sql`GREATEST(${schema.classSessions.bookedCount} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(schema.classSessions.id, sessionId));
        return { ok: false as const, reason: 'already' as const };
      }
      throw err;
    }
  }

  /** Admin přihlásí klienta do lekce. */
  async join(
    tenantId: string,
    userId: string,
    role: AppRole,
    sessionId: string,
    dto: JoinClassSessionDto,
  ) {
    assertCanManage(role);
    const outcome = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), (tx) =>
      this.performJoin(tx, tenantId, sessionId, dto, { changedBy: userId, source: 'admin' }),
    );
    return this.unwrapJoin(outcome);
  }

  /** Veřejné self-service přihlášení z widgetu (bez admin role). */
  async joinPublic(tenantId: string, sessionId: string, dto: JoinClassSessionDto) {
    const outcome = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      this.performJoin(tx, tenantId, sessionId, dto, {
        changedBy: 'customer',
        source: 'public_widget',
      }),
    );
    return this.unwrapJoin(outcome);
  }

  /**
   * Převede výsledek performJoin na HTTP odpověď. Výjimky se vyhazují AŽ ZDE,
   * mimo DB transakci — vyhození skrz hranici postgres-js transakce shazuje proces.
   */
  private unwrapJoin(
    outcome:
      | { ok: true; booking: typeof schema.bookings.$inferSelect }
      | { ok: false; reason: 'not_found' | 'full' | 'already' },
  ) {
    if (outcome.ok) return outcome.booking;
    if (outcome.reason === 'not_found') {
      throw new NotFoundException({
        error: { code: 'SESSION_NOT_FOUND', message: 'Lekce nenalezena.' },
      });
    }
    if (outcome.reason === 'full') {
      throw new BadRequestException({
        error: { code: 'SESSION_FULL', message: 'Lekce je plná nebo už není otevřená.' },
      });
    }
    throw new BadRequestException({
      error: { code: 'ALREADY_JOINED', message: 'Tento klient už je v lekci přihlášený.' },
    });
  }

  /** Otevřené lekce s volnými místy — veřejná varianta (pro widget). */
  async listOpenPublic(
    tenantId: string,
    filters: { serviceId?: string; from?: string; to?: string },
  ) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const conditions = [
        eq(schema.classSessions.tenantId, tenantId),
        eq(schema.classSessions.status, 'open'),
        sql`${schema.classSessions.bookedCount} < ${schema.classSessions.capacity}`,
      ];
      if (filters.serviceId) {
        conditions.push(eq(schema.classSessions.serviceId, filters.serviceId));
      }
      if (filters.from) {
        conditions.push(gte(schema.classSessions.startsAt, new Date(filters.from)));
      }
      if (filters.to) {
        conditions.push(lte(schema.classSessions.startsAt, new Date(filters.to)));
      }
      const rows = await tx
        .select({
          id: schema.classSessions.id,
          serviceId: schema.classSessions.serviceId,
          branchId: schema.classSessions.branchId,
          employeeId: schema.classSessions.employeeId,
          employeeFirstName: schema.employees.firstName,
          employeeLastName: schema.employees.lastName,
          employeeDisplayName: schema.employees.displayName,
          startsAt: schema.classSessions.startsAt,
          endsAt: schema.classSessions.endsAt,
          capacity: schema.classSessions.capacity,
          bookedCount: schema.classSessions.bookedCount,
        })
        .from(schema.classSessions)
        .leftJoin(schema.employees, eq(schema.classSessions.employeeId, schema.employees.id))
        .where(and(...conditions))
        .orderBy(asc(schema.classSessions.startsAt))
        .limit(200);

      return rows.map((r) => ({
        id: r.id,
        serviceId: r.serviceId,
        branchId: r.branchId,
        employeeId: r.employeeId,
        employeeName:
          r.employeeDisplayName ??
          ([r.employeeFirstName, r.employeeLastName].filter(Boolean).join(' ') || null),
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        capacity: r.capacity,
        bookedCount: r.bookedCount,
        freeSpots: r.capacity - r.bookedCount,
      }));
    });
  }

  // ─── Odhlášení účastníka ────────────────────────────────────────────

  async leave(
    tenantId: string,
    userId: string,
    role: AppRole,
    sessionId: string,
    bookingId: string,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.bookings.id, bookingId),
            eq(schema.bookings.tenantId, tenantId),
            eq(schema.bookings.sessionId, sessionId),
            sql`${schema.bookings.status} NOT IN ('cancelled', 'no_show')`,
          ),
        )
        .returning();

      if (!updated) {
        throw new NotFoundException({
          error: {
            code: 'PARTICIPANT_NOT_FOUND',
            message: 'Účastník v této lekci nenalezen nebo už je odhlášený.',
          },
        });
      }

      // Uvolni místo (nikdy pod 0).
      await tx
        .update(schema.classSessions)
        .set({
          bookedCount: sql`GREATEST(${schema.classSessions.bookedCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.classSessions.id, sessionId), eq(schema.classSessions.tenantId, tenantId)),
        );

      await tx.insert(schema.bookingStatusHistory).values({
        tenantId,
        bookingId,
        fromStatus: updated.status === 'cancelled' ? 'confirmed' : updated.status,
        toStatus: 'cancelled',
        changedBy: userId,
        reason: 'left_class_session',
      });

      // Auto-promote z pořadníku — uvolnilo se místo, povýš prvního čekajícího.
      const [sessionRow] = await tx
        .select()
        .from(schema.classSessions)
        .where(
          and(eq(schema.classSessions.id, sessionId), eq(schema.classSessions.tenantId, tenantId)),
        )
        .limit(1);
      if (sessionRow) {
        await this.promoteFromWaitlist(tx, tenantId, sessionRow);
      }

      return updated;
    });
  }

  // ─── Zrušení celé lekce ─────────────────────────────────────────────

  async cancelSession(tenantId: string, userId: string, role: AppRole, sessionId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const sessRows = await tx
        .select()
        .from(schema.classSessions)
        .where(
          and(eq(schema.classSessions.id, sessionId), eq(schema.classSessions.tenantId, tenantId)),
        )
        .limit(1);
      const session = sessRows[0];
      if (!session) {
        throw new NotFoundException({
          error: { code: 'SESSION_NOT_FOUND', message: 'Lekce nenalezena.' },
        });
      }
      if (session.status === 'cancelled') {
        throw new BadRequestException({
          error: { code: 'ALREADY_CANCELLED', message: 'Lekce už je zrušená.' },
        });
      }

      // Zruš všechny aktivní účastníky.
      await tx
        .update(schema.bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: 'class_session_cancelled',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.bookings.tenantId, tenantId),
            eq(schema.bookings.sessionId, sessionId),
            sql`${schema.bookings.status} NOT IN ('cancelled', 'no_show')`,
          ),
        );

      const [updated] = await tx
        .update(schema.classSessions)
        .set({
          status: 'cancelled',
          bookedCount: 0,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.classSessions.id, sessionId))
        .returning();

      return updated!;
    });
  }

  // ─── Pořadník / waitlist (sprint 10.5) ──────────────────────────────

  /** Jádro zařazení do pořadníku. Běží uvnitř withRlsContext transakce. */
  private async performWaitlistJoin(
    tx: Database,
    tenantId: string,
    sessionId: string,
    dto: JoinClassSessionDto,
  ) {
    const [session] = await tx
      .select()
      .from(schema.classSessions)
      .where(
        and(eq(schema.classSessions.id, sessionId), eq(schema.classSessions.tenantId, tenantId)),
      )
      .limit(1);
    if (!session) return { ok: false as const, reason: 'not_found' as const };
    if (session.status !== 'open') return { ok: false as const, reason: 'closed' as const };
    if (session.bookedCount < session.capacity)
      return { ok: false as const, reason: 'has_space' as const };

    // Už je účastníkem? Pak nemá smysl pořadník.
    const participant = await tx
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.tenantId, tenantId),
          eq(schema.bookings.sessionId, sessionId),
          sql`lower(${schema.bookings.customerEmail}) = lower(${dto.customerEmail})`,
          sql`${schema.bookings.status} NOT IN ('cancelled', 'no_show')`,
        ),
      )
      .limit(1);
    if (participant.length > 0) return { ok: false as const, reason: 'already_joined' as const };

    const nameParts = dto.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? dto.customerName;
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const { id: customerId } = await this.customers.findOrCreate(tx, tenantId, {
      firstName,
      lastName,
      email: dto.customerEmail,
      phone: dto.customerPhone ?? null,
    });

    const posRows = await tx
      .select({
        maxPos: sql<number>`COALESCE(MAX(${schema.classSessionWaitlist.position}), 0)`,
      })
      .from(schema.classSessionWaitlist)
      .where(
        and(
          eq(schema.classSessionWaitlist.sessionId, sessionId),
          eq(schema.classSessionWaitlist.status, 'waiting'),
        ),
      );
    const nextPos = Number(posRows[0]?.maxPos ?? 0) + 1;

    try {
      const [entry] = await tx
        .insert(schema.classSessionWaitlist)
        .values({
          tenantId,
          sessionId,
          customerId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone ?? null,
          position: nextPos,
          status: 'waiting',
        })
        .returning();
      return { ok: true as const, entry: entry! };
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e.code ?? e.cause?.code) === '23505') {
        return { ok: false as const, reason: 'already_waitlisted' as const };
      }
      throw err;
    }
  }

  private unwrapWaitlist(
    outcome:
      | { ok: true; entry: typeof schema.classSessionWaitlist.$inferSelect }
      | {
          ok: false;
          reason: 'not_found' | 'closed' | 'has_space' | 'already_joined' | 'already_waitlisted';
        },
  ) {
    if (outcome.ok) return outcome.entry;
    switch (outcome.reason) {
      case 'not_found':
        throw new NotFoundException({
          error: { code: 'SESSION_NOT_FOUND', message: 'Lekce nenalezena.' },
        });
      case 'closed':
        throw new BadRequestException({
          error: { code: 'SESSION_CLOSED', message: 'Lekce není otevřená.' },
        });
      case 'has_space':
        throw new BadRequestException({
          error: {
            code: 'SESSION_HAS_SPACE',
            message: 'Lekce má volná místa — přihlas se přímo, pořadník není potřeba.',
          },
        });
      case 'already_joined':
        throw new BadRequestException({
          error: { code: 'ALREADY_JOINED', message: 'Tento klient už je v lekci přihlášený.' },
        });
      default:
        throw new BadRequestException({
          error: { code: 'ALREADY_WAITLISTED', message: 'Tento klient už je v pořadníku.' },
        });
    }
  }

  /** Admin zařadí klienta do pořadníku. */
  async joinWaitlist(
    tenantId: string,
    userId: string,
    role: AppRole,
    sessionId: string,
    dto: JoinClassSessionDto,
  ) {
    assertCanManage(role);
    const outcome = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), (tx) =>
      this.performWaitlistJoin(tx, tenantId, sessionId, dto),
    );
    return this.unwrapWaitlist(outcome);
  }

  /** Veřejné self-service zařazení do pořadníku z widgetu. */
  async joinWaitlistPublic(tenantId: string, sessionId: string, dto: JoinClassSessionDto) {
    const outcome = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      this.performWaitlistJoin(tx, tenantId, sessionId, dto),
    );
    return this.unwrapWaitlist(outcome);
  }

  /** Seznam čekajících v pořadníku (admin). */
  async listWaitlist(tenantId: string, userId: string, role: AppRole, sessionId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.classSessionWaitlist)
        .where(
          and(
            eq(schema.classSessionWaitlist.tenantId, tenantId),
            eq(schema.classSessionWaitlist.sessionId, sessionId),
            eq(schema.classSessionWaitlist.status, 'waiting'),
          ),
        )
        .orderBy(asc(schema.classSessionWaitlist.position));
    });
  }

  /** Odebrání z pořadníku (admin). */
  async leaveWaitlist(
    tenantId: string,
    userId: string,
    role: AppRole,
    sessionId: string,
    waitlistId: string,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.classSessionWaitlist)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(schema.classSessionWaitlist.id, waitlistId),
            eq(schema.classSessionWaitlist.sessionId, sessionId),
            eq(schema.classSessionWaitlist.tenantId, tenantId),
            eq(schema.classSessionWaitlist.status, 'waiting'),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'WAITLIST_ENTRY_NOT_FOUND', message: 'Záznam v pořadníku nenalezen.' },
        });
      }
      return updated;
    });
  }

  /**
   * Povýší prvního čekajícího z pořadníku na rezervaci, pokud je volné místo.
   * Volá se uvnitř transakce po uvolnění místa (leave). Vrací true, pokud povýšil.
   */
  private async promoteFromWaitlist(
    tx: Database,
    tenantId: string,
    session: typeof schema.classSessions.$inferSelect,
  ): Promise<boolean> {
    if (session.status !== 'open') return false;

    const [entry] = await tx
      .select()
      .from(schema.classSessionWaitlist)
      .where(
        and(
          eq(schema.classSessionWaitlist.tenantId, tenantId),
          eq(schema.classSessionWaitlist.sessionId, session.id),
          eq(schema.classSessionWaitlist.status, 'waiting'),
        ),
      )
      .orderBy(asc(schema.classSessionWaitlist.position))
      .limit(1);
    if (!entry) return false;

    // Atomicky zarezervuj uvolněné místo.
    const reserved = await tx
      .update(schema.classSessions)
      .set({ bookedCount: sql`${schema.classSessions.bookedCount} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(schema.classSessions.id, session.id),
          eq(schema.classSessions.tenantId, tenantId),
          eq(schema.classSessions.status, 'open'),
          sql`${schema.classSessions.bookedCount} < ${schema.classSessions.capacity}`,
        ),
      )
      .returning({ bookedCount: schema.classSessions.bookedCount });
    if (reserved.length === 0) return false;

    const nameParts = entry.customerName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? entry.customerName;
    const lastName = nameParts.slice(1).join(' ') || firstName;
    const { id: customerId } = await this.customers.findOrCreate(tx, tenantId, {
      firstName,
      lastName,
      email: entry.customerEmail,
      phone: entry.customerPhone ?? null,
    });

    const [service] = await tx
      .select()
      .from(schema.services)
      .where(eq(schema.services.id, session.serviceId))
      .limit(1);

    try {
      await tx.transaction(async (sp) => {
        const [b] = await sp
          .insert(schema.bookings)
          .values({
            tenantId,
            branchId: session.branchId,
            serviceId: session.serviceId,
            employeeId: session.employeeId,
            sessionId: session.id,
            customerId,
            customerName: entry.customerName,
            customerEmail: entry.customerEmail,
            customerPhone: entry.customerPhone ?? null,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            bufferStartsAt: session.bufferStartsAt,
            bufferEndsAt: session.bufferEndsAt,
            status: 'confirmed',
            pricePaidHellers: service?.priceHellers ?? 0,
            currency: service?.currency ?? 'CZK',
            referenceCode: generateReferenceCode(),
            metadata: { source: 'waitlist_promote', kind: 'class_session' },
          })
          .returning();
        await sp.insert(schema.bookingStatusHistory).values({
          tenantId,
          bookingId: b!.id,
          fromStatus: null,
          toStatus: 'confirmed',
          changedBy: 'system',
          metadata: { source: 'waitlist_promote', kind: 'class_session' },
        });
      });

      await tx
        .update(schema.classSessionWaitlist)
        .set({ status: 'promoted', updatedAt: new Date() })
        .where(eq(schema.classSessionWaitlist.id, entry.id));
      return true;
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if ((e.code ?? e.cause?.code) === '23505') {
        // Čekající je už účastníkem — vrať místo a vyřaď ho z pořadníku.
        await tx
          .update(schema.classSessions)
          .set({
            bookedCount: sql`GREATEST(${schema.classSessions.bookedCount} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(schema.classSessions.id, session.id));
        await tx
          .update(schema.classSessionWaitlist)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(schema.classSessionWaitlist.id, entry.id));
        return false;
      }
      throw err;
    }
  }
}
