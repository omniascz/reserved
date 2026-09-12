// AppointmentRecordsService — záznamy o návštěvě/ošetření (sprint 10.42).
// Praktik po appointment službě (spa/fyzio/masáž) zapíše, co se provedlo;
// vzniká historie návštěv zákazníka. Klient vidí summary v portálu (ne private_note).

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

// Záznam smí psát personál (vč. zaměstnance/praktika), ne klient.
const WRITE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist', 'employee'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanWrite(role: AppRole): void {
  if (!WRITE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Záznam smí psát jen personál.' },
    });
  }
}

@Injectable()
export class AppointmentRecordsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Praktik zapíše záznam o provedené návštěvě. Data klienta se vezmou z rezervace. */
  async create(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: {
      bookingId: string;
      summary: string;
      privateNote?: string | null;
      followUpAt?: string | null;
    },
  ) {
    assertCanWrite(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [b] = await tx
        .select({
          customerId: schema.bookings.customerId,
          customerName: schema.bookings.customerName,
          customerEmail: schema.bookings.customerEmail,
          employeeId: schema.bookings.employeeId,
        })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, dto.bookingId), eq(schema.bookings.tenantId, tenantId)))
        .limit(1);
      if (!b) {
        throw new NotFoundException({
          error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
        });
      }
      const [row] = await tx
        .insert(schema.appointmentRecords)
        .values({
          tenantId,
          bookingId: dto.bookingId,
          customerId: b.customerId,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          employeeId: b.employeeId,
          summary: dto.summary,
          privateNote: dto.privateNote ?? null,
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
          createdBy: userId,
        })
        .returning();
      return row!;
    });
  }

  /** Záznamy ke konkrétní návštěvě. */
  async listForBooking(tenantId: string, userId: string, role: AppRole, bookingId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.appointmentRecords)
        .where(
          and(
            eq(schema.appointmentRecords.tenantId, tenantId),
            eq(schema.appointmentRecords.bookingId, bookingId),
          ),
        )
        .orderBy(desc(schema.appointmentRecords.createdAt));
    });
  }

  /** Historie návštěv zákazníka (admin/personál — vč. privátních poznámek). */
  async historyForCustomer(tenantId: string, userId: string, role: AppRole, customerEmail: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.appointmentRecords)
        .where(
          and(
            eq(schema.appointmentRecords.tenantId, tenantId),
            eq(schema.appointmentRecords.customerEmail, customerEmail),
          ),
        )
        .orderBy(desc(schema.appointmentRecords.createdAt))
        .limit(200);
    });
  }

  /** Veřejná/portálová historie — jen summary + follow-up (BEZ privátních poznámek). */
  async publicHistory(tenantId: string, customerEmail: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          id: schema.appointmentRecords.id,
          summary: schema.appointmentRecords.summary,
          followUpAt: schema.appointmentRecords.followUpAt,
          createdAt: schema.appointmentRecords.createdAt,
        })
        .from(schema.appointmentRecords)
        .where(
          and(
            eq(schema.appointmentRecords.tenantId, tenantId),
            eq(schema.appointmentRecords.customerEmail, customerEmail),
          ),
        )
        .orderBy(desc(schema.appointmentRecords.createdAt))
        .limit(100);
    });
  }
}
