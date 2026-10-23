// BookingRemindersService — připomínky termínu na jednom místě.
//
// Plánuje připomínku podle nastavení tenanta a ruší naplánované zprávy při
// stornu / přesunu (vzor `cancelWithReference` z cal.com — viz
// booking-notifications.ts). Používají ho admin rezervace i zákaznický portál;
// běží v service kontextu, protože zákazník do fronty notifikací nesmí.

import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { extractNotificationSettings } from '../settings/settings.types.js';
import { cancelPendingBookingNotifications, PRE_VISIT_TEMPLATES } from './booking-notifications.js';
import { NotificationsScheduler } from './notifications-scheduler.service.js';

export interface ReminderInput {
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
}

@Injectable()
export class BookingRemindersService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(NotificationsScheduler) private readonly scheduler: NotificationsScheduler,
  ) {}

  /** Naplánuje připomínku podle tenant settings. Vrací false, když se neplánovala. */
  async schedule(input: ReminderInput): Promise<boolean> {
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
    if (settings.reminderHoursBefore === 0) return false;

    const reminderTime = new Date(
      input.startsAt.getTime() - settings.reminderHoursBefore * 3600_000,
    );
    if (reminderTime.getTime() <= Date.now()) {
      // Rezervace je tak brzy, ze nas reminder by uz mel byt v minulosti — preskakujeme
      return false;
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
    // Podle tohohle worker pozná, že rezervace byla mezitím přesunuta.
    const metadata = { bookingStartsAt: input.startsAt.toISOString() };

    // Primární kanál podle settings
    if (settings.primaryChannel === 'email' || !settings.smsEnabled || !input.customerPhone) {
      await this.scheduler.scheduleEmail({
        tenantId: input.tenantId,
        templateCode: 'booking_reminder',
        recipient: input.customerEmail,
        vars: emailVars,
        scheduledAt: reminderTime,
        relatedBookingId: input.bookingId,
        metadata,
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
        metadata,
      });
    }
    return true;
  }

  /**
   * Naplánuje připomínku pro existující rezervaci (např. po přesunu). Jména
   * služby, zaměstnance a provozovny si dohledá sama.
   */
  async scheduleForBooking(
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
  ): Promise<boolean> {
    const names = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [svc] = await tx
        .select({ name: schema.services.name })
        .from(schema.services)
        .where(eq(schema.services.id, booking.serviceId))
        .limit(1);
      const [emp] = booking.employeeId
        ? await tx
            .select({
              displayName: schema.employees.displayName,
              firstName: schema.employees.firstName,
              lastName: schema.employees.lastName,
            })
            .from(schema.employees)
            .where(eq(schema.employees.id, booking.employeeId))
            .limit(1)
        : [undefined];
      const [tenant] = await tx
        .select({ name: schema.tenants.name })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return {
        serviceName: svc?.name ?? '',
        employeeName: emp ? (emp.displayName ?? `${emp.firstName} ${emp.lastName}`) : 'Zaměstnanec',
        tenantName: tenant?.name ?? '',
      };
    });
    return this.schedule({
      tenantId,
      bookingId: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone ?? null,
      serviceName: names.serviceName,
      employeeName: names.employeeName,
      tenantName: names.tenantName,
      referenceCode: booking.referenceCode,
      onlineMeetingUrl: booking.onlineMeetingUrl,
    });
  }

  /** Zruší čekající zprávy k rezervacím ve vlastní transakci (service kontext). */
  async cancelForBookings(
    tenantId: string,
    bookingIds: string[],
    templateCodes: readonly string[] = PRE_VISIT_TEMPLATES,
    reason = 'booking_cancelled',
  ): Promise<number> {
    if (bookingIds.length === 0) return 0;
    return this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      cancelPendingBookingNotifications(tx, tenantId, bookingIds, templateCodes, reason),
    );
  }

  /** Přesun: zruší připomínku starého termínu a naplánuje novou. */
  async replaceAfterReschedule(
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
  ): Promise<void> {
    await this.cancelForBookings(
      tenantId,
      [booking.id],
      ['booking_reminder'],
      'booking_rescheduled',
    );
    await this.scheduleForBooking(tenantId, booking);
  }
}
