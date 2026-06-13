// BookingsService — všechna logika kolem rezervací:
//   - confirmFromHold: konverze slot_hold → booking (public flow)
//   - adminCreate, cancel, reschedule, list (admin flow)
//   - status historie + email queue v jedné transakci

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { Database } from '../db/db.service.js';
import { type AppRole, type TenantContext, serviceContext } from '@reserved/rls-multitenancy';
import { randomBytes } from 'node:crypto';
import { BundlePacksService } from '../bundle-packs/bundle-packs.service.js';
import { CreditPacksService } from '../credit-packs/credit-packs.service.js';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { TimePacksService } from '../time-packs/time-packs.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsScheduler } from '../email/notifications-scheduler.service.js';
import { OnboardingService } from '../onboarding/onboarding.service.js';
import { extractNotificationSettings } from '../settings/settings.types.js';
import { EventBus } from '../rules/events.bus.js';
import type { BookingEventPayload, TriggerEvent } from '@reserved/rules-engine';
import type {
  AdminCreateBookingDto,
  CancelBookingDto,
  ConfirmBookingDto,
  RescheduleBookingDto,
} from './dto/booking.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze zaměstnanec, recepce, manager nebo owner mohou spravovat rezervace.',
      },
    });
  }
}

function generateReferenceCode(): string {
  // Krátký lidsky čitelný kód, např. "B-K3F9-2L7M"
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `B-${part()}-${part()}`;
}

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(EventBus) private readonly eventBus: EventBus,
    @Inject(CreditPacksService) private readonly creditPacks: CreditPacksService,
    @Inject(BundlePacksService) private readonly bundlePacks: BundlePacksService,
    @Inject(TimePacksService) private readonly timePacks: TimePacksService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
    @Inject(GoogleCalendarService) private readonly googleCal: GoogleCalendarService,
    @Inject(NotificationsScheduler) private readonly scheduler: NotificationsScheduler,
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
    @Inject(LoyaltyService) private readonly loyalty: LoyaltyService,
  ) {}

  /**
   * Naplanuje pripomínky pro novou rezervaci podle tenant settings.
   * Vola se po confirmFromHold + adminCreate.
   */
  private async scheduleBookingReminders(input: {
    tenantId: string;
    bookingId: string;
    startsAt: Date;
    endsAt: Date;
    customerEmail: string;
    customerName: string;
    customerPhone: string | null;
    serviceName: string;
    employeeName: string;
    tenantName: string;
    referenceCode: string;
    onlineMeetingUrl: string | null;
  }): Promise<void> {
    // Načti tenant settings pro notifikace
    const tenantRows = await this.dbService.withRlsContext(
      serviceContext(input.tenantId),
      async (tx) => {
        return tx
          .select({ settings: schema.tenants.settings })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, input.tenantId))
          .limit(1);
      },
    );
    const settings = extractNotificationSettings(tenantRows[0]?.settings);
    if (settings.reminderHoursBefore === 0) return;

    const reminderTime = new Date(
      input.startsAt.getTime() - settings.reminderHoursBefore * 3600_000,
    );
    if (reminderTime.getTime() <= Date.now()) {
      // Rezervace je tak brzy, ze nas reminder by uz mel byt v minulosti — preskakujeme
      return;
    }

    const emailVars = {
      customerName: input.customerName,
      serviceName: input.serviceName,
      employeeName: input.employeeName,
      tenantName: input.tenantName,
      startsAt: input.startsAt.toLocaleString('cs-CZ'),
      endsAt: input.endsAt.toLocaleString('cs-CZ'),
      referenceCode: input.referenceCode,
      onlineMeetingUrl: input.onlineMeetingUrl,
    };

    // Primární kanál podle settings
    if (settings.primaryChannel === 'email' || !settings.smsEnabled || !input.customerPhone) {
      await this.scheduler.scheduleEmail({
        tenantId: input.tenantId,
        templateCode: 'booking_reminder',
        recipient: input.customerEmail,
        vars: emailVars,
        scheduledAt: reminderTime,
        relatedBookingId: input.bookingId,
      });
    }
    if (settings.smsEnabled && input.customerPhone) {
      const smsBody =
        `Pripominka rezervace v ${input.tenantName}: ${input.serviceName} ${input.startsAt.toLocaleString('cs-CZ')}. ` +
        `Kod: ${input.referenceCode}. Stornovat min ${settings.reminderHoursBefore}h predem.`;
      await this.scheduler.scheduleSms({
        tenantId: input.tenantId,
        templateCode: 'booking_reminder',
        recipient: input.customerPhone,
        body: smsBody,
        scheduledAt: reminderTime,
        relatedBookingId: input.bookingId,
      });
    }

    // Onboarding: prvni rezervace prijata (idempotent)
    void this.onboarding.markStep(input.tenantId, 'firstBookingReceived').catch(() => undefined);
  }

  private async emitBookingEvent(
    eventType: TriggerEvent,
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
    triggeredBy: 'customer' | 'admin' | 'system' = 'admin',
    reason?: string | null,
  ): Promise<void> {
    const payload: BookingEventPayload = {
      bookingId: booking.id,
      customerId: booking.customerId,
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
      serviceId: booking.serviceId,
      employeeId: booking.employeeId,
      branchId: booking.branchId,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      status: booking.status,
      pricePaidHellers: booking.pricePaidHellers,
      hoursUntilStart: (booking.startsAt.getTime() - Date.now()) / 3_600_000,
      triggeredBy,
      reason: reason ?? null,
    };
    await this.eventBus.emit({ tenantId, type: eventType, payload });
  }

  // ─── Public: confirm from hold ───────────────────────────────────────

  async confirmFromHold(tenantId: string, dto: ConfirmBookingDto) {
    return this.dbService
      .withRlsContext(serviceContext(tenantId), async (tx) => {
        // 1. Najdi hold
        const holdRows = await tx
          .select()
          .from(schema.slotHolds)
          .where(
            and(
              eq(schema.slotHolds.tenantId, tenantId),
              eq(schema.slotHolds.sessionToken, dto.sessionToken),
              eq(schema.slotHolds.status, 'active'),
            ),
          )
          .limit(1);
        const hold = holdRows[0];

        if (!hold) {
          throw new NotFoundException({
            error: { code: 'HOLD_NOT_FOUND', message: 'Hold neexistuje nebo už byl použit.' },
          });
        }

        if (hold.expiresAt.getTime() < Date.now()) {
          await tx
            .update(schema.slotHolds)
            .set({ status: 'expired' })
            .where(eq(schema.slotHolds.id, hold.id));
          throw new BadRequestException({
            error: {
              code: 'HOLD_EXPIRED',
              message: 'Hold vypršel (10 min limit). Začni znovu výběrem termínu.',
            },
          });
        }

        // 2. Načti service (pro priceHellers)
        const svcRows = await tx
          .select()
          .from(schema.services)
          .where(eq(schema.services.id, hold.serviceId))
          .limit(1);
        const service = svcRows[0]!;

        // 2b. Najdi nebo vytvoř customer entity (sprint 1.7 CRM)
        const nameParts = dto.customerName.trim().split(/\s+/);
        const firstName = nameParts[0] ?? dto.customerName;
        const lastName = nameParts.slice(1).join(' ') || firstName;
        const { id: customerId } = await this.customers.findOrCreate(tx, tenantId, {
          firstName,
          lastName,
          email: dto.customerEmail,
          phone: dto.customerPhone ?? null,
        });

        // 2c. Subscription benefity: discount % + exclusive access check.
        const discount = await this.subscriptions.getBookingDiscountFor({
          tenantId,
          customerId,
          serviceId: hold.serviceId,
          basePriceHellers: service.priceHellers,
        });
        if (discount.requiresExclusiveAccess) {
          throw new ForbiddenException({
            error: {
              code: 'EXCLUSIVE_SERVICE_REQUIRES_SUBSCRIPTION',
              message: 'Tato služba je dostupná pouze pro držitele aktivního předplatného.',
            },
          });
        }

        // 3. Vytvoř booking
        const refCode = generateReferenceCode();
        const [booking] = await tx
          .insert(schema.bookings)
          .values({
            tenantId,
            branchId: hold.branchId,
            serviceId: hold.serviceId,
            employeeId: hold.employeeId,
            customerUserId: dto.customerUserId ?? null,
            customerId,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone ?? null,
            startsAt: hold.startsAt,
            endsAt: hold.endsAt,
            bufferStartsAt: hold.bufferStartsAt,
            bufferEndsAt: hold.bufferEndsAt,
            status: 'confirmed',
            pricePaidHellers: discount.finalPriceHellers,
            currency: service.currency,
            customerNote: dto.customerNote ?? null,
            referenceCode: refCode,
            onlineMeetingUrl: service.isOnline ? service.defaultOnlineMeetingUrl : null,
            metadata: {
              source: 'public_widget',
              ...(discount.discountPercent > 0 && {
                subscriptionDiscountPercent: discount.discountPercent,
                originalPriceHellers: service.priceHellers,
              }),
            },
          })
          .returning();

        // 4. Mark hold as converted
        await tx
          .update(schema.slotHolds)
          .set({ status: 'converted', convertedToBookingId: booking!.id })
          .where(eq(schema.slotHolds.id, hold.id));

        // 5. Status history
        await tx.insert(schema.bookingStatusHistory).values({
          tenantId,
          bookingId: booking!.id,
          fromStatus: null,
          toStatus: 'confirmed',
          changedBy: 'customer',
          metadata: { source: 'public_widget' },
        });

        return { booking: booking!, service };
      })
      .then(async (result) => {
        // 6. Pošli confirmation email (mimo transakci)
        const empRows = await this.dbService.withRlsContext(
          serviceContext(tenantId),
          async (tx) => {
            return tx
              .select()
              .from(schema.employees)
              .where(eq(schema.employees.id, result.booking.employeeId!))
              .limit(1);
          },
        );
        const emp = empRows[0];

        const tenantRows = await this.dbService.withRlsContext(
          serviceContext(tenantId),
          async (tx) => {
            return tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
          },
        );
        const tenant = tenantRows[0]!;

        const employeeName = emp
          ? (emp.displayName ?? `${emp.firstName} ${emp.lastName}`)
          : 'Zaměstnanec';

        await this.email.enqueue({
          tenantId,
          templateCode: 'booking_confirmed',
          recipient: dto.customerEmail,
          relatedBookingId: result.booking.id,
          vars: {
            customerName: dto.customerName,
            serviceName: result.service.name,
            employeeName,
            tenantName: tenant.name,
            startsAt: result.booking.startsAt.toISOString(),
            endsAt: result.booking.endsAt.toISOString(),
            referenceCode: result.booking.referenceCode,
            onlineMeetingUrl: result.booking.onlineMeetingUrl,
          },
        });

        // Naplánuj připomínku podle tenant settings (default 24h před)
        await this.scheduleBookingReminders({
          tenantId,
          bookingId: result.booking.id,
          startsAt: result.booking.startsAt,
          endsAt: result.booking.endsAt,
          customerEmail: dto.customerEmail,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone ?? null,
          serviceName: result.service.name,
          employeeName,
          tenantName: tenant.name,
          referenceCode: result.booking.referenceCode,
          onlineMeetingUrl: result.booking.onlineMeetingUrl,
        });

        // Auto-odpocet z balicku (priorita: time-pack > bundle > credit-pack).
        // Time-pack = subscription "neomezeno po dobu X" — ma prednost,
        //   protoze zakaznik plati prave za nelimitovany pristup.
        // Bundle = konkretni svazek sluzeb (specificky zavazek).
        // Credit-pack = generic kredity (flexibilnejsi).
        try {
          const timeHit = await this.timePacks.deductForBooking({
            tenantId,
            customerId: result.booking.customerId!,
            bookingId: result.booking.id,
            serviceId: result.booking.serviceId,
            branchId: result.booking.branchId,
            bookingStartsAt: result.booking.startsAt,
            performedBy: null,
          });
          if (!timeHit) {
            const bundleHit = await this.bundlePacks.deductForBooking({
              tenantId,
              customerId: result.booking.customerId!,
              bookingId: result.booking.id,
              serviceId: result.booking.serviceId,
              branchId: result.booking.branchId,
              performedBy: null,
            });
            if (!bundleHit) {
              await this.creditPacks.deductForBooking({
                tenantId,
                customerId: result.booking.customerId!,
                bookingId: result.booking.id,
                serviceId: result.booking.serviceId,
                branchId: result.booking.branchId,
                performedBy: null,
              });
            }
          }
        } catch {
          // Selhani odpoctu neblokuje rezervaci — zakaznik plati normalne.
        }

        // Emit booking_created event pro Rules Engine
        await this.emitBookingEvent('booking_created', tenantId, result.booking, 'customer');

        // Google Calendar sync (faze C1) — best-effort, errors swallowed
        if (result.booking.employeeId) {
          this.googleCal.syncBookingCreated({
            tenantId,
            bookingId: result.booking.id,
            employeeId: result.booking.employeeId,
            booking: {
              id: result.booking.id,
              startsAt: result.booking.startsAt,
              endsAt: result.booking.endsAt,
              customerName: result.booking.customerName,
              customerEmail: result.booking.customerEmail,
              customerPhone: result.booking.customerPhone,
              serviceName: result.service.name,
              referenceCode: result.booking.referenceCode,
            },
          });
        }

        return result.booking;
      });
  }

  // ─── Admin endpointy ────────────────────────────────────────────────

  async listForAdmin(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: { from?: string; to?: string; status?: string },
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [eq(schema.bookings.tenantId, tenantId)];
      if (filters.from) {
        conditions.push(gte(schema.bookings.startsAt, new Date(filters.from)));
      }
      if (filters.to) {
        conditions.push(lte(schema.bookings.startsAt, new Date(filters.to)));
      }
      if (filters.status) {
        conditions.push(eq(schema.bookings.status, filters.status));
      }

      return tx
        .select()
        .from(schema.bookings)
        .where(and(...conditions))
        .orderBy(asc(schema.bookings.startsAt))
        .limit(200);
    });
  }

  async getForAdmin(tenantId: string, userId: string, role: AppRole, bookingId: string) {
    const rows = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenantId, tenantId)))
        .limit(1);
    });
    if (!rows[0]) {
      throw new NotFoundException({
        error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
      });
    }
    return rows[0];
  }

  async adminCreate(tenantId: string, userId: string, role: AppRole, dto: AdminCreateBookingDto) {
    assertCanManage(role);
    return this.dbService
      .withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
        // 1. Load service
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

        // 2. Resolve branch
        let branchId = dto.branchId ?? null;
        if (!branchId) {
          const empBranchRows = await tx
            .select({ branchId: schema.employeeBranches.branchId })
            .from(schema.employeeBranches)
            .where(eq(schema.employeeBranches.employeeId, dto.employeeId))
            .limit(1);
          branchId = empBranchRows[0]?.branchId ?? null;
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

        // 3. Compute times + insert
        const startsAt = new Date(dto.startsAt);
        const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
        const bufferStartsAt = new Date(startsAt.getTime() - service.bufferBeforeMinutes * 60_000);
        const bufferEndsAt = new Date(endsAt.getTime() + service.bufferAfterMinutes * 60_000);
        const refCode = generateReferenceCode();

        // 3a. Subscription benefity: najdi customer podle emailu (mozna existuje)
        // a aplikuj discount/exclusive check.
        const existingCustomer = await tx
          .select({ id: schema.customers.id })
          .from(schema.customers)
          .where(
            and(
              eq(schema.customers.tenantId, tenantId),
              eq(schema.customers.email, dto.customerEmail),
            ),
          )
          .limit(1);
        const existingCustomerId = existingCustomer[0]?.id ?? null;

        const discount = await this.subscriptions.getBookingDiscountFor({
          tenantId,
          customerId: existingCustomerId,
          serviceId: dto.serviceId,
          basePriceHellers: service.priceHellers,
        });
        if (discount.requiresExclusiveAccess) {
          throw new ForbiddenException({
            error: {
              code: 'EXCLUSIVE_SERVICE_REQUIRES_SUBSCRIPTION',
              message: 'Tato služba je dostupná pouze pro držitele aktivního předplatného.',
            },
          });
        }

        try {
          const [booking] = await tx
            .insert(schema.bookings)
            .values({
              tenantId,
              branchId,
              serviceId: dto.serviceId,
              employeeId: dto.employeeId,
              customerName: dto.customerName,
              customerEmail: dto.customerEmail,
              customerPhone: dto.customerPhone ?? null,
              startsAt,
              endsAt,
              bufferStartsAt,
              bufferEndsAt,
              status: 'confirmed',
              pricePaidHellers: discount.finalPriceHellers,
              currency: service.currency,
              customerNote: dto.customerNote ?? null,
              internalNote: dto.internalNote ?? null,
              referenceCode: refCode,
              onlineMeetingUrl: service.isOnline ? service.defaultOnlineMeetingUrl : null,
              metadata: {
                source: 'admin',
                createdByUserId: userId,
                ...(discount.discountPercent > 0 && {
                  subscriptionDiscountPercent: discount.discountPercent,
                  originalPriceHellers: service.priceHellers,
                }),
              },
            })
            .returning();

          await tx.insert(schema.bookingStatusHistory).values({
            tenantId,
            bookingId: booking!.id,
            fromStatus: null,
            toStatus: 'confirmed',
            changedBy: userId,
            metadata: { source: 'admin' },
          });

          // Motor 1 (10.21): navázané zdroje (místnost, technika…) — zamkni je.
          if (dto.resourceIds.length > 0) {
            await this.attachResources(
              tx,
              tenantId,
              booking!.id,
              dto.resourceIds,
              bufferStartsAt,
              bufferEndsAt,
            );
          }

          return { booking: booking!, service, skipEmail: dto.skipEmail };
        } catch (err) {
          const e = err as { code?: string; message?: string; cause?: unknown };
          const cause = e.cause as { code?: string; message?: string } | undefined;
          const pgCode = e.code ?? cause?.code;
          if (pgCode === '23P01') {
            throw new BadRequestException({
              error: {
                code: 'SLOT_TAKEN',
                message: 'V tomto čase už zaměstnanec rezervaci má. Vyber jiný čas.',
              },
            });
          }
          throw err;
        }
      })
      .then(async (result) => {
        if (result.skipEmail) return result.booking;

        const empRows = await this.dbService.withRlsContext(
          serviceContext(tenantId),
          async (tx) => {
            return tx
              .select()
              .from(schema.employees)
              .where(eq(schema.employees.id, result.booking.employeeId!))
              .limit(1);
          },
        );
        const emp = empRows[0];

        const tenantRows = await this.dbService.withRlsContext(
          serviceContext(tenantId),
          async (tx) => {
            return tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
          },
        );

        const employeeName = emp
          ? (emp.displayName ?? `${emp.firstName} ${emp.lastName}`)
          : 'Zaměstnanec';
        const tenantName = tenantRows[0]!.name;

        await this.email.enqueue({
          tenantId,
          templateCode: 'booking_confirmed',
          recipient: result.booking.customerEmail,
          relatedBookingId: result.booking.id,
          vars: {
            customerName: result.booking.customerName,
            serviceName: result.service.name,
            employeeName,
            tenantName,
            startsAt: result.booking.startsAt.toISOString(),
            endsAt: result.booking.endsAt.toISOString(),
            referenceCode: result.booking.referenceCode,
            onlineMeetingUrl: result.booking.onlineMeetingUrl,
          },
        });

        // Naplánuj připomínku podle tenant settings
        await this.scheduleBookingReminders({
          tenantId,
          bookingId: result.booking.id,
          startsAt: result.booking.startsAt,
          endsAt: result.booking.endsAt,
          customerEmail: result.booking.customerEmail,
          customerName: result.booking.customerName,
          customerPhone: result.booking.customerPhone ?? null,
          serviceName: result.service.name,
          employeeName,
          tenantName,
          referenceCode: result.booking.referenceCode,
          onlineMeetingUrl: result.booking.onlineMeetingUrl,
        });

        return result.booking;
      });
  }

  async cancel(
    tenantId: string,
    userId: string,
    role: AppRole,
    bookingId: string,
    dto: CancelBookingDto,
  ) {
    assertCanManage(role);
    const result = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const rows = await tx
          .select()
          .from(schema.bookings)
          .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenantId, tenantId)))
          .limit(1);
        const existing = rows[0];
        if (!existing) {
          throw new NotFoundException({
            error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
          });
        }
        if (existing.status === 'cancelled') {
          throw new BadRequestException({
            error: { code: 'ALREADY_CANCELLED', message: 'Rezervace už je zrušena.' },
          });
        }

        const [updated] = await tx
          .update(schema.bookings)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledReason: dto.reason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.bookings.id, bookingId))
          .returning();

        await tx.insert(schema.bookingStatusHistory).values({
          tenantId,
          bookingId,
          fromStatus: existing.status,
          toStatus: 'cancelled',
          changedBy: userId,
          reason: dto.reason ?? null,
        });

        // Motor 1 (10.21): uvolni navázané zdroje.
        await tx
          .update(schema.bookingResources)
          .set({ status: 'cancelled' })
          .where(eq(schema.bookingResources.bookingId, bookingId));

        return updated!;
      },
    );

    if (dto.notifyCustomer) {
      await this.sendBookingEmail(tenantId, result, 'booking_cancelled', { reason: dto.reason });
    }

    // Refund pokud byl drive odpocteny (time/bundle/credit-pack — co matchne).
    // Vsechna volani jsou idempotentni; jen ten typ co matchne vrati neco.
    try {
      await this.timePacks.refundForBooking({
        tenantId,
        bookingId: result.id,
        performedBy: userId,
      });
    } catch {
      // ignoruj — neblokuje cancel
    }
    try {
      await this.bundlePacks.refundForBooking({
        tenantId,
        bookingId: result.id,
        performedBy: userId,
      });
    } catch {
      // ignoruj — neblokuje cancel
    }
    try {
      await this.creditPacks.refundForBooking({
        tenantId,
        bookingId: result.id,
        performedBy: userId,
      });
    } catch {
      // ignoruj — neblokuje cancel
    }

    await this.emitBookingEvent('booking_cancelled', tenantId, result, 'admin', dto.reason);

    // Google Calendar sync — smaz event (best-effort, errors swallowed)
    this.googleCal.syncBookingCancelled({ tenantId, bookingId: result.id });

    return result;
  }

  async reschedule(
    tenantId: string,
    userId: string,
    role: AppRole,
    bookingId: string,
    dto: RescheduleBookingDto,
  ) {
    assertCanManage(role);

    const result = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const rows = await tx
          .select()
          .from(schema.bookings)
          .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenantId, tenantId)))
          .limit(1);
        const existing = rows[0];
        if (!existing) {
          throw new NotFoundException({
            error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
          });
        }
        if (existing.status === 'cancelled' || existing.status === 'completed') {
          throw new BadRequestException({
            error: {
              code: 'CANNOT_RESCHEDULE',
              message: 'Zrušenou nebo dokončenou rezervaci nelze přesunout.',
            },
          });
        }

        // Načti service pro buffer čas
        const svcRows = await tx
          .select()
          .from(schema.services)
          .where(eq(schema.services.id, existing.serviceId))
          .limit(1);
        const service = svcRows[0]!;

        const newStartsAt = new Date(dto.newStartsAt);
        const newEndsAt = new Date(newStartsAt.getTime() + service.durationMinutes * 60_000);
        const newBufferStartsAt = new Date(
          newStartsAt.getTime() - service.bufferBeforeMinutes * 60_000,
        );
        const newBufferEndsAt = new Date(newEndsAt.getTime() + service.bufferAfterMinutes * 60_000);

        try {
          const [updated] = await tx
            .update(schema.bookings)
            .set({
              startsAt: newStartsAt,
              endsAt: newEndsAt,
              bufferStartsAt: newBufferStartsAt,
              bufferEndsAt: newBufferEndsAt,
              employeeId: dto.newEmployeeId ?? existing.employeeId,
              updatedAt: new Date(),
            })
            .where(eq(schema.bookings.id, bookingId))
            .returning();

          await tx.insert(schema.bookingStatusHistory).values({
            tenantId,
            bookingId,
            fromStatus: existing.status,
            toStatus: existing.status, // status sám se nemění
            changedBy: userId,
            reason: dto.reason ?? 'reschedule',
            metadata: {
              action: 'rescheduled',
              oldStartsAt: existing.startsAt.toISOString(),
              newStartsAt: newStartsAt.toISOString(),
            },
          });

          // Motor 1 (10.21): posuň zámky navázaných zdrojů na nový čas
          // (EXCLUDE odhalí kolizi → 23P01 → SLOT_TAKEN).
          await tx
            .update(schema.bookingResources)
            .set({ bufferStartsAt: newBufferStartsAt, bufferEndsAt: newBufferEndsAt })
            .where(
              and(
                eq(schema.bookingResources.bookingId, bookingId),
                eq(schema.bookingResources.status, 'active'),
              ),
            );

          return { booking: updated!, oldStartsAt: existing.startsAt };
        } catch (err) {
          const e = err as { code?: string; cause?: { code?: string } };
          const pgCode = e.code ?? e.cause?.code;
          if (pgCode === '23P01') {
            throw new BadRequestException({
              error: {
                code: 'SLOT_TAKEN',
                message: 'Nový čas je obsazený, vyber jiný.',
              },
            });
          }
          throw err;
        }
      },
    );

    if (dto.notifyCustomer) {
      await this.sendBookingEmail(tenantId, result.booking, 'booking_rescheduled', {
        oldStartsAt: result.oldStartsAt.toISOString(),
      });
    }

    await this.emitBookingEvent(
      'booking_rescheduled',
      tenantId,
      result.booking,
      'admin',
      dto.reason,
    );

    return result.booking;
  }

  // ─── Mark no-show + completed (sprint 2.5 phase 2) ──────────────────

  async markNoShow(tenantId: string, userId: string, role: AppRole, bookingId: string) {
    return this.changeStatus(tenantId, userId, role, bookingId, 'no_show', 'booking_no_show');
  }

  async markCompleted(tenantId: string, userId: string, role: AppRole, bookingId: string) {
    return this.changeStatus(tenantId, userId, role, bookingId, 'completed', 'booking_completed');
  }

  private async changeStatus(
    tenantId: string,
    userId: string,
    role: AppRole,
    bookingId: string,
    newStatus: 'no_show' | 'completed',
    eventType: TriggerEvent,
  ) {
    assertCanManage(role);
    const result = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const rows = await tx
          .select()
          .from(schema.bookings)
          .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenantId, tenantId)))
          .limit(1);
        const existing = rows[0];
        if (!existing) {
          throw new NotFoundException({
            error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
          });
        }
        if (existing.status === newStatus) {
          throw new BadRequestException({
            error: {
              code: 'INVALID_STATUS_CHANGE',
              message: `Rezervace už má stav '${newStatus}'.`,
            },
          });
        }
        if (existing.status === 'cancelled') {
          throw new BadRequestException({
            error: {
              code: 'INVALID_STATUS_CHANGE',
              message: 'Zrušenou rezervaci nelze označit jako dokončenou/no-show.',
            },
          });
        }

        const [updated] = await tx
          .update(schema.bookings)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(schema.bookings.id, bookingId))
          .returning();

        await tx.insert(schema.bookingStatusHistory).values({
          tenantId,
          bookingId,
          fromStatus: existing.status,
          toStatus: newStatus,
          changedBy: userId,
          reason: newStatus === 'no_show' ? 'admin_marked_no_show' : 'admin_marked_completed',
        });

        // Věrnostní body za dokončenou rezervaci (sprint 10.8) — idempotentní.
        if (newStatus === 'completed' && existing.customerId) {
          await this.loyalty.awardForBooking(tx, tenantId, existing.customerId, bookingId);
        }

        return updated!;
      },
    );

    await this.emitBookingEvent(eventType, tenantId, result, 'admin');
    return result;
  }

  // ─── Helper: email odeslání s lookup employee/tenant ────────────────

  private async sendBookingEmail(
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
    templateCode: string,
    extraVars: { reason?: string | null; oldStartsAt?: string } = {},
  ): Promise<void> {
    const data = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const empRows = booking.employeeId
        ? await tx
            .select()
            .from(schema.employees)
            .where(eq(schema.employees.id, booking.employeeId))
            .limit(1)
        : [];
      const svcRows = await tx
        .select()
        .from(schema.services)
        .where(eq(schema.services.id, booking.serviceId))
        .limit(1);
      const tenantRows = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return {
        employee: empRows[0],
        service: svcRows[0]!,
        tenant: tenantRows[0]!,
      };
    });

    await this.email.enqueue({
      tenantId,
      templateCode,
      recipient: booking.customerEmail,
      relatedBookingId: booking.id,
      vars: {
        customerName: booking.customerName,
        serviceName: data.service.name,
        employeeName: data.employee
          ? (data.employee.displayName ?? `${data.employee.firstName} ${data.employee.lastName}`)
          : 'Zaměstnanec',
        tenantName: data.tenant.name,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        referenceCode: booking.referenceCode,
        reason: extraVars.reason ?? undefined,
        oldStartsAt: extraVars.oldStartsAt,
      },
    });
  }

  // ─── Motor 1 (10.21): vícezdrojové navázání ──────────────────────────

  /** Naváže zdroje na rezervaci s ochranou proti překryvu (pre-check + DB EXCLUDE). */
  private async attachResources(
    tx: Database,
    tenantId: string,
    bookingId: string,
    resourceIds: string[],
    bufferStartsAt: Date,
    bufferEndsAt: Date,
  ): Promise<void> {
    const unique = [...new Set(resourceIds)];
    for (const resourceId of unique) {
      const [resource] = await tx
        .select({ id: schema.resources.id, name: schema.resources.name })
        .from(schema.resources)
        .where(
          and(
            eq(schema.resources.id, resourceId),
            eq(schema.resources.tenantId, tenantId),
            isNull(schema.resources.deletedAt),
          ),
        )
        .limit(1);
      if (!resource) {
        throw new NotFoundException({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Zdroj nenalezen.' },
        });
      }
      // Překryv: existující.start < nový.konec && existující.konec > nový.start.
      const clash = await tx
        .select({ id: schema.bookingResources.id })
        .from(schema.bookingResources)
        .where(
          and(
            eq(schema.bookingResources.tenantId, tenantId),
            eq(schema.bookingResources.resourceId, resourceId),
            eq(schema.bookingResources.status, 'active'),
            lt(schema.bookingResources.bufferStartsAt, bufferEndsAt),
            gt(schema.bookingResources.bufferEndsAt, bufferStartsAt),
          ),
        )
        .limit(1);
      if (clash.length > 0) {
        throw new BadRequestException({
          error: {
            code: 'RESOURCE_BUSY',
            message: `Zdroj „${resource.name}" je v daném čase obsazený.`,
          },
        });
      }
      await tx.insert(schema.bookingResources).values({
        tenantId,
        bookingId,
        resourceId,
        bufferStartsAt,
        bufferEndsAt,
        status: 'active',
      });
    }
  }

  /** Vrátí zdroje navázané na rezervaci. */
  async listResources(tenantId: string, userId: string, role: AppRole, bookingId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select({
          id: schema.bookingResources.id,
          resourceId: schema.bookingResources.resourceId,
          resourceName: schema.resources.name,
          status: schema.bookingResources.status,
        })
        .from(schema.bookingResources)
        .leftJoin(schema.resources, eq(schema.resources.id, schema.bookingResources.resourceId))
        .where(
          and(
            eq(schema.bookingResources.bookingId, bookingId),
            eq(schema.bookingResources.tenantId, tenantId),
          ),
        );
    });
  }
}
