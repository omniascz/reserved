// PortalMeService — endpointy /portal/me/* pro přihlášeného zákazníka.
//
// Cancel/Reschedule respektuje booking rules z tenant.settings (sprint 1.8).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { TenantContext } from '@reserved/rls-multitenancy';
import { BundlePacksService } from '../bundle-packs/bundle-packs.service.js';
import { CreditPacksService } from '../credit-packs/credit-packs.service.js';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';
import { EventBus } from '../rules/events.bus.js';
import { extractBookingRules } from '../settings/settings.types.js';
import type { BookingEventPayload, TriggerEvent } from '@reserved/rules-engine';
import type {
  CancelMyBookingDto,
  RescheduleMyBookingDto,
  UpdateProfileDto,
} from './dto/portal-me.dto.js';

function customerContext(tenantId: string, customerId: string): TenantContext {
  return { tenantId, userId: customerId, role: 'customer' };
}

@Injectable()
export class PortalMeService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(EventBus) private readonly eventBus: EventBus,
    @Inject(CreditPacksService) private readonly creditPacks: CreditPacksService,
    @Inject(BundlePacksService) private readonly bundlePacks: BundlePacksService,
  ) {}

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------
  async getProfile(tenantId: string, customerId: string) {
    return this.dbService.withRlsContext(customerContext(tenantId, customerId), async (tx) => {
      const [c] = await tx
        .select({
          id: schema.customers.id,
          firstName: schema.customers.firstName,
          lastName: schema.customers.lastName,
          email: schema.customers.email,
          phone: schema.customers.phone,
          marketingOptIn: schema.customers.marketingOptIn,
          hasPassword: schema.customers.passwordHash,
          emailVerifiedAt: schema.customers.emailVerifiedAt,
          createdAt: schema.customers.createdAt,
        })
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);

      if (!c)
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Profil neexistuje.' },
        });

      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        marketingOptIn: c.marketingOptIn,
        hasPassword: c.hasPassword !== null,
        emailVerifiedAt: c.emailVerifiedAt,
        createdAt: c.createdAt,
      };
    });
  }

  async updateProfile(tenantId: string, customerId: string, dto: UpdateProfileDto) {
    return this.dbService.withRlsContext(customerContext(tenantId, customerId), async (tx) => {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
      if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
      if (dto.phone !== undefined) updateData.phone = dto.phone;
      if (dto.marketingOptIn !== undefined) updateData.marketingOptIn = dto.marketingOptIn;

      await tx.update(schema.customers).set(updateData).where(eq(schema.customers.id, customerId));

      return this.getProfile(tenantId, customerId);
    });
  }

  // ---------------------------------------------------------------------------
  // Credit packs (permanentky)
  // ---------------------------------------------------------------------------
  async listMyCreditPacks(tenantId: string, customerId: string) {
    return this.creditPacks.listForCustomer(tenantId, customerId, 'customer', customerId);
  }

  // ---------------------------------------------------------------------------
  // Bookings list
  // ---------------------------------------------------------------------------
  async listBookings(tenantId: string, customerId: string) {
    return this.dbService.withRlsContext(customerContext(tenantId, customerId), async (tx) => {
      const rows = await tx
        .select({
          booking: schema.bookings,
          serviceName: schema.services.name,
          serviceDuration: schema.services.durationMinutes,
          serviceColor: schema.services.color,
          employeeFirstName: schema.employees.firstName,
          employeeLastName: schema.employees.lastName,
        })
        .from(schema.bookings)
        .leftJoin(schema.services, eq(schema.bookings.serviceId, schema.services.id))
        .leftJoin(schema.employees, eq(schema.bookings.employeeId, schema.employees.id))
        .where(
          and(eq(schema.bookings.tenantId, tenantId), eq(schema.bookings.customerId, customerId)),
        )
        .orderBy(desc(schema.bookings.startsAt));

      return rows.map((r) => ({
        id: r.booking.id,
        startsAt: r.booking.startsAt,
        endsAt: r.booking.endsAt,
        status: r.booking.status,
        referenceCode: r.booking.referenceCode,
        pricePaidHellers: r.booking.pricePaidHellers,
        currency: r.booking.currency,
        customerNote: r.booking.customerNote,
        serviceName: r.serviceName,
        serviceDuration: r.serviceDuration,
        serviceColor: r.serviceColor,
        employeeName: r.employeeFirstName
          ? `${r.employeeFirstName} ${r.employeeLastName ?? ''}`.trim()
          : null,
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------
  async cancel(tenantId: string, customerId: string, bookingId: string, dto: CancelMyBookingDto) {
    const result = await this.dbService.withRlsContext(
      customerContext(tenantId, customerId),
      async (tx) => {
        // Get tenant.settings → booking rules
        const [tenant] = await tx
          .select({ settings: schema.tenants.settings, name: schema.tenants.name })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, tenantId))
          .limit(1);
        const rules = extractBookingRules(tenant?.settings);

        const [booking] = await tx
          .select()
          .from(schema.bookings)
          .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.customerId, customerId)))
          .limit(1);

        if (!booking) {
          throw new NotFoundException({
            error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
          });
        }
        if (booking.status === 'cancelled') {
          throw new BadRequestException({
            error: { code: 'ALREADY_CANCELLED', message: 'Rezervace už je zrušena.' },
          });
        }
        if (booking.status === 'completed') {
          throw new BadRequestException({
            error: { code: 'CANNOT_CANCEL', message: 'Dokončenou rezervaci nelze zrušit.' },
          });
        }

        // Check storno deadline
        const hoursUntilStart = (booking.startsAt.getTime() - Date.now()) / 3_600_000;
        if (hoursUntilStart < rules.stornoLimitHours) {
          throw new ForbiddenException({
            error: {
              code: 'STORNO_DEADLINE_PASSED',
              message: `Storno je možné nejpozději ${rules.stornoLimitHours}h před začátkem. Kontaktujte prosím salon.`,
            },
          });
        }

        const [updated] = await tx
          .update(schema.bookings)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledReason: dto.reason ?? 'customer_cancelled',
            updatedAt: new Date(),
          })
          .where(eq(schema.bookings.id, bookingId))
          .returning();

        await tx.insert(schema.bookingStatusHistory).values({
          tenantId,
          bookingId,
          fromStatus: booking.status,
          toStatus: 'cancelled',
          changedBy: customerId,
          reason: dto.reason ?? 'customer_cancelled',
          metadata: { source: 'portal' },
        });

        return { booking: updated!, tenantName: tenant?.name ?? 'Reserved' };
      },
    );

    // Notify customer + send email confirmation
    await this.sendBookingEmail(tenantId, result.booking, 'booking_cancelled', result.tenantName, {
      reason: dto.reason,
    });

    // Refund pokud byl drive odpocteny — zkusi oba typy (bundle + credit-pack).
    try {
      await this.bundlePacks.refundForBooking({
        tenantId,
        bookingId: result.booking.id,
        performedBy: customerId,
      });
    } catch {
      // ignoruj
    }
    try {
      await this.creditPacks.refundForBooking({
        tenantId,
        bookingId: result.booking.id,
        performedBy: customerId,
      });
    } catch {
      // ignoruj
    }

    // Emit domain event → rules engine reaguje
    await this.emitBookingEvent('booking_cancelled', tenantId, result.booking, dto.reason);

    return result.booking;
  }

  // ---------------------------------------------------------------------------
  // Reschedule
  // ---------------------------------------------------------------------------
  async reschedule(
    tenantId: string,
    customerId: string,
    bookingId: string,
    dto: RescheduleMyBookingDto,
  ) {
    const result = await this.dbService.withRlsContext(
      customerContext(tenantId, customerId),
      async (tx) => {
        const [tenant] = await tx
          .select({ settings: schema.tenants.settings, name: schema.tenants.name })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, tenantId))
          .limit(1);
        const rules = extractBookingRules(tenant?.settings);

        const [booking] = await tx
          .select()
          .from(schema.bookings)
          .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.customerId, customerId)))
          .limit(1);

        if (!booking) {
          throw new NotFoundException({
            error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
          });
        }
        if (booking.status === 'cancelled' || booking.status === 'completed') {
          throw new BadRequestException({
            error: {
              code: 'CANNOT_RESCHEDULE',
              message: 'Tuto rezervaci už nelze přesunout.',
            },
          });
        }

        // Check reschedule deadline
        const hoursUntilStart = (booking.startsAt.getTime() - Date.now()) / 3_600_000;
        if (hoursUntilStart < rules.presunLimitHours) {
          throw new ForbiddenException({
            error: {
              code: 'PRESUN_DEADLINE_PASSED',
              message: `Přesun je možný nejpozději ${rules.presunLimitHours}h před začátkem. Kontaktujte prosím salon.`,
            },
          });
        }

        // Load service for buffer recalculation
        const [service] = await tx
          .select()
          .from(schema.services)
          .where(eq(schema.services.id, booking.serviceId))
          .limit(1);
        if (!service) throw new Error('Service not found');

        const newStartsAt = new Date(dto.newStartsAt);
        const newEndsAt = new Date(newStartsAt.getTime() + service.durationMinutes * 60_000);
        const newBufferStartsAt = new Date(
          newStartsAt.getTime() - service.bufferBeforeMinutes * 60_000,
        );
        const newBufferEndsAt = new Date(newEndsAt.getTime() + service.bufferAfterMinutes * 60_000);

        // Check new time is also far enough in future (respektuj minHoursBefore)
        if ((newStartsAt.getTime() - Date.now()) / 3_600_000 < rules.minHoursBefore) {
          throw new BadRequestException({
            error: {
              code: 'TOO_LATE',
              message: `Nový čas musí být alespoň ${rules.minHoursBefore}h od teď.`,
            },
          });
        }

        try {
          const [updated] = await tx
            .update(schema.bookings)
            .set({
              startsAt: newStartsAt,
              endsAt: newEndsAt,
              bufferStartsAt: newBufferStartsAt,
              bufferEndsAt: newBufferEndsAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.bookings.id, bookingId))
            .returning();

          await tx.insert(schema.bookingStatusHistory).values({
            tenantId,
            bookingId,
            fromStatus: booking.status,
            toStatus: booking.status,
            changedBy: customerId,
            reason: dto.reason ?? 'customer_reschedule',
            metadata: {
              action: 'rescheduled',
              source: 'portal',
              oldStartsAt: booking.startsAt.toISOString(),
              newStartsAt: newStartsAt.toISOString(),
            },
          });

          return {
            booking: updated!,
            oldStartsAt: booking.startsAt,
            tenantName: tenant?.name ?? 'Reserved',
          };
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

    await this.sendBookingEmail(
      tenantId,
      result.booking,
      'booking_rescheduled',
      result.tenantName,
      { oldStartsAt: result.oldStartsAt.toISOString() },
    );

    await this.emitBookingEvent('booking_rescheduled', tenantId, result.booking, dto.reason);

    return result.booking;
  }

  // ---------------------------------------------------------------------------
  // Emit domain event (rules engine input)
  // ---------------------------------------------------------------------------
  private async emitBookingEvent(
    eventType: TriggerEvent,
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
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
      triggeredBy: 'customer',
      reason: reason ?? null,
    };
    await this.eventBus.emit({ tenantId, type: eventType, payload });
  }

  // ---------------------------------------------------------------------------
  // Send email helper
  // ---------------------------------------------------------------------------
  private async sendBookingEmail(
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
    templateCode: string,
    tenantName: string,
    extra?: { reason?: string; oldStartsAt?: string },
  ): Promise<void> {
    await this.dbService.withRlsContext({ tenantId, role: 'service' }, async (tx) => {
      const [svc] = await tx
        .select({ name: schema.services.name })
        .from(schema.services)
        .where(eq(schema.services.id, booking.serviceId))
        .limit(1);
      const [emp] = booking.employeeId
        ? await tx
            .select({
              firstName: schema.employees.firstName,
              lastName: schema.employees.lastName,
            })
            .from(schema.employees)
            .where(eq(schema.employees.id, booking.employeeId))
            .limit(1)
        : [null];

      await this.email.enqueue({
        tenantId,
        templateCode,
        recipient: booking.customerEmail,
        relatedBookingId: booking.id,
        vars: {
          customerName: booking.customerName,
          serviceName: svc?.name ?? '',
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : '',
          tenantName,
          startsAt: booking.startsAt.toISOString(),
          endsAt: booking.endsAt.toISOString(),
          referenceCode: booking.referenceCode,
          ...(extra?.reason ? { reason: extra.reason } : {}),
          ...(extra?.oldStartsAt ? { oldStartsAt: extra.oldStartsAt } : {}),
        },
      });
    });
  }
}
