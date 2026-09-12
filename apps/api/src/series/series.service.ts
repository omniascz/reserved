// SeriesService — série opakovaných 1:1 rezervací (sprint 10.14).
//
// Pravidelné termíny (týdně / 14 dní / měsíčně). Série je šablona; jednotlivé
// výskyty jsou normální bookings se series_id. Kolizní výskyty (zaměstnanec už
// má v daném čase rezervaci — chrání EXCLUDE constraint) se přeskočí a nahlásí,
// zbytek série se vytvoří. U online služeb se může automaticky vygenerovat
// video odkaz (Jitsi — bez API klíče).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext, serviceContext } from '@reserved/rls-multitenancy';
import type { Database } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { TimePacksService } from '../time-packs/time-packs.service.js';
import { BundlePacksService } from '../bundle-packs/bundle-packs.service.js';
import { CreditPacksService } from '../credit-packs/credit-packs.service.js';
import { extractMeetingSettings, type MeetingSettings } from '../settings/settings.types.js';
import type { CreateSeriesDto } from './dto/series.dto.js';

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
function generateReferenceCode(): string {
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `S-${part()}-${part()}`;
}

/** Vrací další výskyt podle frekvence (UTC). */
function addOccurrence(base: Date, frequency: string, index: number): Date {
  const d = new Date(base);
  if (frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7 * index);
  else if (frequency === 'biweekly') d.setUTCDate(d.getUTCDate() + 14 * index);
  else if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + index);
  return d;
}

@Injectable()
export class SeriesService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(TimePacksService) private readonly timePacks: TimePacksService,
    @Inject(BundlePacksService) private readonly bundlePacks: BundlePacksService,
    @Inject(CreditPacksService) private readonly creditPacks: CreditPacksService,
  ) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateSeriesDto) {
    assertCanManage(role);
    return this.runCreate(ctxFor(tenantId, userId, role), tenantId, userId, dto);
  }

  /**
   * Self-service: přihlášený zákazník si z portálu založí opakovanou rezervaci
   * („držím si úterý 18:00"). Identita se bere z jeho účtu, běží v service kontextu.
   */
  async createSelfService(
    tenantId: string,
    customerId: string,
    dto: {
      serviceId: string;
      employeeId: string;
      startsAt: string;
      frequency: 'weekly' | 'biweekly' | 'monthly';
      occurrences: number;
      customerNote?: string | null;
    },
  ) {
    const cust = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [c] = await tx
        .select({
          firstName: schema.customers.firstName,
          lastName: schema.customers.lastName,
          email: schema.customers.email,
          phone: schema.customers.phone,
        })
        .from(schema.customers)
        .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
        .limit(1);
      return c;
    });
    if (!cust) {
      throw new NotFoundException({
        error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
      });
    }
    const fullDto: CreateSeriesDto = {
      serviceId: dto.serviceId,
      employeeId: dto.employeeId,
      customerName: `${cust.firstName} ${cust.lastName}`.trim(),
      customerEmail: cust.email,
      customerPhone: cust.phone ?? null,
      startsAt: dto.startsAt,
      frequency: dto.frequency,
      occurrences: dto.occurrences,
      customerNote: dto.customerNote ?? null,
    };
    return this.runCreate(serviceContext(tenantId), tenantId, customerId, fullDto);
  }

  private async runCreate(
    ctx: TenantContext,
    tenantId: string,
    actorId: string,
    dto: CreateSeriesDto,
  ) {
    return this.dbService.withRlsContext(ctx, async (tx) => {
      // 1. Služba
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
      if (service.capacity > 1) {
        throw new BadRequestException({
          error: {
            code: 'SERIES_NOT_1_1',
            message: 'Série je jen pro individuální (1:1) služby, ne pro skupinové lekce.',
          },
        });
      }

      // 2. Pobočka
      let branchId = dto.branchId ?? null;
      if (!branchId) {
        const empBranch = await tx
          .select({ branchId: schema.employeeBranches.branchId })
          .from(schema.employeeBranches)
          .where(eq(schema.employeeBranches.employeeId, dto.employeeId))
          .limit(1);
        branchId = empBranch[0]?.branchId ?? null;
        if (!branchId) {
          const def = await tx
            .select({ id: schema.branches.id })
            .from(schema.branches)
            .where(eq(schema.branches.tenantId, tenantId))
            .limit(1);
          branchId = def[0]?.id ?? null;
        }
      }
      if (!branchId) {
        throw new BadRequestException({
          error: { code: 'BRANCH_REQUIRED', message: 'Nelze určit pobočku — vyber.' },
        });
      }

      // 3. Zákazník + nastavení video odkazu
      const nameParts = dto.customerName.trim().split(/\s+/);
      const firstName = nameParts[0] ?? dto.customerName;
      const lastName = nameParts.slice(1).join(' ') || firstName;
      const { id: customerId } = await this.customers.findOrCreate(tx, tenantId, {
        firstName,
        lastName,
        email: dto.customerEmail,
        phone: dto.customerPhone ?? null,
      });

      const [tenant] = await tx
        .select({ slug: schema.tenants.slug, settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const meeting = extractMeetingSettings(tenant?.settings);
      const slug = tenant?.slug ?? 'reserved';

      // 4. Záznam série
      const firstStart = new Date(dto.startsAt);
      const [series] = await tx
        .insert(schema.bookingSeries)
        .values({
          tenantId,
          serviceId: dto.serviceId,
          employeeId: dto.employeeId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone ?? null,
          frequency: dto.frequency,
          startsAt: firstStart,
          occurrenceCount: dto.occurrences,
          status: 'active',
          metadata: { createdByUserId: actorId },
        })
        .returning();

      // 5. Generuj výskyty; kolize přeskoč.
      const created: Array<{ id: string; startsAt: Date; onlineMeetingUrl: string | null }> = [];
      const skipped: Array<{ startsAt: Date }> = [];

      for (let i = 0; i < dto.occurrences; i++) {
        const startsAt = addOccurrence(firstStart, dto.frequency, i);
        const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
        const bufferStartsAt = new Date(startsAt.getTime() - service.bufferBeforeMinutes * 60_000);
        const bufferEndsAt = new Date(endsAt.getTime() + service.bufferAfterMinutes * 60_000);
        const refCode = generateReferenceCode();
        const onlineMeetingUrl = this.meetingUrlFor(meeting, slug, refCode, service);

        try {
          // Savepoint na každý výskyt — kolize (23P01) tak neotráví celou
          // transakci série, jen se přeskočí daný termín.
          const booking = await tx.transaction(async (sp) => {
            const [b] = await sp
              .insert(schema.bookings)
              .values({
                tenantId,
                branchId,
                serviceId: dto.serviceId,
                employeeId: dto.employeeId,
                seriesId: series!.id,
                customerId,
                customerName: dto.customerName,
                customerEmail: dto.customerEmail,
                customerPhone: dto.customerPhone ?? null,
                startsAt,
                endsAt,
                bufferStartsAt,
                bufferEndsAt,
                status: 'confirmed',
                pricePaidHellers: service.priceHellers,
                currency: service.currency,
                customerNote: dto.customerNote ?? null,
                referenceCode: refCode,
                onlineMeetingUrl,
                metadata: { source: 'series', seriesId: series!.id, occurrence: i + 1 },
              })
              .returning();
            await sp.insert(schema.bookingStatusHistory).values({
              tenantId,
              bookingId: b!.id,
              fromStatus: null,
              toStatus: 'confirmed',
              changedBy: actorId,
              metadata: { source: 'series' },
            });
            return b!;
          });
          created.push({ id: booking.id, startsAt, onlineMeetingUrl });
        } catch (err) {
          const e = err as { code?: string; cause?: { code?: string } };
          if ((e.code ?? e.cause?.code) === '23P01') {
            skipped.push({ startsAt });
            continue;
          }
          throw err;
        }
      }

      // 6. Souhrnný e-mail (jedna zpráva za celou sérii).
      if (created.length > 0) {
        const lines = created.map((c, idx) => `${idx + 1}. ${c.startsAt.toISOString()}`).join('\n');
        await tx.insert(schema.notifications).values({
          tenantId,
          channel: 'email',
          templateCode: 'booking_series_confirmed',
          recipient: dto.customerEmail,
          subject: `Potvrzení série termínů — ${service.name}`,
          body:
            `Dobrý den,\n\npotvrzujeme sérii ${created.length} termínů (${service.name}):\n` +
            `${lines}\n\nTěšíme se na vás.`,
          status: 'pending',
          scheduledAt: new Date(),
          metadata: { kind: 'series', seriesId: series!.id },
        });
      }

      return {
        seriesId: series!.id,
        frequency: dto.frequency,
        requested: dto.occurrences,
        created: created.length,
        skipped: skipped.length,
        bookings: created,
        skippedSlots: skipped,
      };
    });
  }

  async list(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.bookingSeries)
        .where(eq(schema.bookingSeries.tenantId, tenantId))
        .orderBy(desc(schema.bookingSeries.createdAt));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, seriesId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [series] = await tx
        .select()
        .from(schema.bookingSeries)
        .where(
          and(eq(schema.bookingSeries.id, seriesId), eq(schema.bookingSeries.tenantId, tenantId)),
        )
        .limit(1);
      if (!series) {
        throw new NotFoundException({
          error: { code: 'SERIES_NOT_FOUND', message: 'Série nenalezena.' },
        });
      }
      const bookings = await tx
        .select({
          id: schema.bookings.id,
          startsAt: schema.bookings.startsAt,
          status: schema.bookings.status,
          referenceCode: schema.bookings.referenceCode,
          onlineMeetingUrl: schema.bookings.onlineMeetingUrl,
        })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.seriesId, seriesId), eq(schema.bookings.tenantId, tenantId)))
        .orderBy(schema.bookings.startsAt);
      return { ...series, bookings };
    });
  }

  /** Zruší celou sérii — všechny budoucí termíny. Proběhlé/minulé nechá být. */
  async cancelSeries(tenantId: string, userId: string, role: AppRole, seriesId: string) {
    assertCanManage(role);
    const now = new Date();
    const cancelledIds = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [series] = await tx
          .select({ id: schema.bookingSeries.id })
          .from(schema.bookingSeries)
          .where(
            and(eq(schema.bookingSeries.id, seriesId), eq(schema.bookingSeries.tenantId, tenantId)),
          )
          .limit(1);
        if (!series) {
          throw new NotFoundException({
            error: { code: 'SERIES_NOT_FOUND', message: 'Série nenalezena.' },
          });
        }

        await tx
          .update(schema.bookingSeries)
          .set({ status: 'cancelled', updatedAt: now })
          .where(eq(schema.bookingSeries.id, seriesId));

        const cancelled = await tx
          .update(schema.bookings)
          .set({
            status: 'cancelled',
            cancelledAt: now,
            cancelledReason: 'series_cancelled',
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.bookings.tenantId, tenantId),
              eq(schema.bookings.seriesId, seriesId),
              gt(schema.bookings.startsAt, now),
              sql`${schema.bookings.status} IN ('pending', 'confirmed')`,
            ),
          )
          .returning({ id: schema.bookings.id });

        for (const c of cancelled) {
          await tx.insert(schema.bookingStatusHistory).values({
            tenantId,
            bookingId: c.id,
            fromStatus: 'confirmed',
            toStatus: 'cancelled',
            changedBy: userId,
            reason: 'series_cancelled',
          });
        }
        return cancelled.map((c) => c.id);
      },
    );

    // Po commitu: vrať případné permanentky.
    for (const id of cancelledIds) {
      await this.refundPacks(tenantId, id);
    }
    return { cancelledBookings: cancelledIds.length };
  }

  // ─── Pomocné ─────────────────────────────────────────────────────────

  private meetingUrlFor(
    meeting: MeetingSettings,
    slug: string,
    refCode: string,
    service: typeof schema.services.$inferSelect,
  ): string | null {
    if (!service.isOnline) return null;
    // Statický odkaz nastavený u služby má přednost.
    if (service.defaultOnlineMeetingUrl) return service.defaultOnlineMeetingUrl;
    if (meeting.provider === 'jitsi') {
      const room = `${slug}-${refCode}`.replace(/[^a-zA-Z0-9-]/g, '');
      return `https://meet.jit.si/${room}`;
    }
    // zoom / teams vyžadují propojení účtu (externí OAuth) — zatím bez odkazu.
    return null;
  }

  private async refundPacks(tenantId: string, bookingId: string): Promise<void> {
    try {
      await this.timePacks.refundForBooking({ tenantId, bookingId, performedBy: null });
    } catch {
      // ignoruj
    }
    try {
      await this.bundlePacks.refundForBooking({ tenantId, bookingId, performedBy: null });
    } catch {
      // ignoruj
    }
    try {
      await this.creditPacks.refundForBooking({ tenantId, bookingId, performedBy: null });
    } catch {
      // ignoruj
    }
  }
}
