// AvailabilityService — DB-backed wrapper kolem availability-calculator.
// Načte working hours, bookings, holds, blocks, holiday flag a předá pure
// kalkulátoru.

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, lte, inArray, or, isNull, gt } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { extractBookingRules } from '../settings/settings.types.js';
import { calculateAvailableSlots } from './availability-calculator.js';
import type { AvailableSlot, TimeRange } from './availability.types.js';

export interface QueryAvailabilityInput {
  tenantId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  /** Filtr na konkrétního zaměstnance; pokud null = všichni co umí službu. */
  employeeId?: string | null;
  /** Filtr na konkrétní pobočku. */
  branchId?: string | null;
  timezone: string;
}

export interface AvailabilityForEmployee {
  employeeId: string;
  employeeName: string;
  slots: AvailableSlot[];
}

@Injectable()
export class AvailabilityService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async query(input: QueryAvailabilityInput): Promise<AvailabilityForEmployee[]> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      // 0. Načti booking rules + check max_days_ahead / min_hours_before
      const tenantRows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, input.tenantId))
        .limit(1);
      const rules = extractBookingRules(tenantRows[0]?.settings);

      const today = new Date();
      const targetDate = new Date(`${input.date}T00:00:00Z`);
      const daysAhead = Math.floor(
        (targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (daysAhead > rules.maxDaysAhead) {
        return []; // beyond booking window
      }

      // 1. Načti službu (duration + buffers)
      const serviceRows = await tx
        .select()
        .from(schema.services)
        .where(
          and(
            eq(schema.services.id, input.serviceId),
            eq(schema.services.tenantId, input.tenantId),
            eq(schema.services.isActive, true),
          ),
        )
        .limit(1);
      const service = serviceRows[0];
      if (!service) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }

      // 2. Najdi zaměstnance, kteří umí službu
      let employeeIds: string[] = [];
      if (input.employeeId) {
        // Ověř, že daný zaměstnanec službu skutečně umí
        const link = await tx
          .select({ employeeId: schema.employeeServices.employeeId })
          .from(schema.employeeServices)
          .where(
            and(
              eq(schema.employeeServices.serviceId, input.serviceId),
              eq(schema.employeeServices.employeeId, input.employeeId),
            ),
          )
          .limit(1);
        if (link.length === 0) return [];
        employeeIds = [input.employeeId];
      } else {
        const rows = await tx
          .select({ employeeId: schema.employeeServices.employeeId })
          .from(schema.employeeServices)
          .where(eq(schema.employeeServices.serviceId, input.serviceId));
        employeeIds = rows.map((r) => r.employeeId);
      }

      if (employeeIds.length === 0) return [];

      // Filter: jen aktivní + akceptují online bookings
      const employees = await tx
        .select({
          id: schema.employees.id,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          displayName: schema.employees.displayName,
        })
        .from(schema.employees)
        .where(
          and(
            inArray(schema.employees.id, employeeIds),
            eq(schema.employees.tenantId, input.tenantId),
            eq(schema.employees.isActive, true),
            eq(schema.employees.acceptsOnlineBookings, true),
            isNull(schema.employees.deletedAt),
          ),
        );
      if (employees.length === 0) return [];
      const activeEmpIds = employees.map((e) => e.id);

      // 3. Day of week
      const dayDate = new Date(`${input.date}T00:00:00Z`);
      const dow = dayDate.getUTCDay() === 0 ? 7 : dayDate.getUTCDay(); // ISO: 1=Mon, 7=Sun

      // 4. Working hours pro daný den
      const workingHoursRows = await tx
        .select()
        .from(schema.employeeWorkingHours)
        .where(
          and(
            eq(schema.employeeWorkingHours.tenantId, input.tenantId),
            eq(schema.employeeWorkingHours.dayOfWeek, dow),
            eq(schema.employeeWorkingHours.isActive, true),
            inArray(schema.employeeWorkingHours.employeeId, activeEmpIds),
            input.branchId
              ? or(
                  eq(schema.employeeWorkingHours.branchId, input.branchId),
                  isNull(schema.employeeWorkingHours.branchId),
                )
              : undefined,
          ),
        );

      // 5. Bookings pro daný den (per zaměstnanec)
      const dayStart = new Date(`${input.date}T00:00:00Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      const bookingRows = await tx
        .select({
          employeeId: schema.bookings.employeeId,
          bufferStartsAt: schema.bookings.bufferStartsAt,
          bufferEndsAt: schema.bookings.bufferEndsAt,
        })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.tenantId, input.tenantId),
            inArray(schema.bookings.employeeId, activeEmpIds),
            inArray(schema.bookings.status, ['pending', 'confirmed', 'completed']),
            lte(schema.bookings.bufferStartsAt, dayEnd),
            gte(schema.bookings.bufferEndsAt, dayStart),
          ),
        );

      // 6. Active holds
      const holdRows = await tx
        .select({
          employeeId: schema.slotHolds.employeeId,
          bufferStartsAt: schema.slotHolds.bufferStartsAt,
          bufferEndsAt: schema.slotHolds.bufferEndsAt,
          expiresAt: schema.slotHolds.expiresAt,
        })
        .from(schema.slotHolds)
        .where(
          and(
            eq(schema.slotHolds.tenantId, input.tenantId),
            eq(schema.slotHolds.status, 'active'),
            gt(schema.slotHolds.expiresAt, new Date()),
            inArray(schema.slotHolds.employeeId, activeEmpIds),
            lte(schema.slotHolds.bufferStartsAt, dayEnd),
            gte(schema.slotHolds.bufferEndsAt, dayStart),
          ),
        );

      // 7. Manual blocks
      const blockRows = await tx
        .select({
          employeeId: schema.availabilityBlocks.employeeId,
          startsAt: schema.availabilityBlocks.startsAt,
          endsAt: schema.availabilityBlocks.endsAt,
        })
        .from(schema.availabilityBlocks)
        .where(
          and(
            eq(schema.availabilityBlocks.tenantId, input.tenantId),
            lte(schema.availabilityBlocks.startsAt, dayEnd),
            gte(schema.availabilityBlocks.endsAt, dayStart),
          ),
        );

      // 8. Holiday check
      const holidays = await tx
        .select()
        .from(schema.holidays)
        .where(
          and(
            eq(schema.holidays.tenantId, input.tenantId),
            eq(schema.holidays.date, dayDate),
            eq(schema.holidays.isOpen, false),
          ),
        )
        .limit(1);
      const isHoliday = holidays.length > 0;

      // 9. Pro každého zaměstnance zavolej kalkulátor
      const results: AvailabilityForEmployee[] = [];
      for (const emp of employees) {
        const empWorkingHours = workingHoursRows
          .filter((wh) => wh.employeeId === emp.id)
          .map((wh) => ({
            dayOfWeek: wh.dayOfWeek,
            startTime: wh.startTime,
            endTime: wh.endTime,
            breakStartTime: wh.breakStartTime,
            breakEndTime: wh.breakEndTime,
            branchId: wh.branchId,
          }));

        const empBookings: TimeRange[] = bookingRows
          .filter((b) => b.employeeId === emp.id)
          .map((b) => ({ startsAt: b.bufferStartsAt, endsAt: b.bufferEndsAt }));

        const empHolds: TimeRange[] = holdRows
          .filter((h) => h.employeeId === emp.id)
          .map((h) => ({ startsAt: h.bufferStartsAt, endsAt: h.bufferEndsAt }));

        const empBlocks: TimeRange[] = blockRows
          .filter((b) => b.employeeId === null || b.employeeId === emp.id)
          .map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt }));

        const slots = calculateAvailableSlots({
          date: input.date,
          serviceDurationMinutes: service.durationMinutes,
          bufferBeforeMinutes: service.bufferBeforeMinutes,
          bufferAfterMinutes: service.bufferAfterMinutes,
          workingHours: empWorkingHours,
          existingBookings: empBookings,
          activeHolds: empHolds,
          blocks: empBlocks,
          isHoliday,
          slotIntervalMinutes: rules.slotIntervalMinutes,
          timezone: input.timezone,
        });

        // Filter slots by minHoursBefore (cutoff)
        const minStartMs = today.getTime() + rules.minHoursBefore * 60 * 60 * 1000;
        const filtered = slots.filter((s) => s.startsAt.getTime() >= minStartMs);

        results.push({
          employeeId: emp.id,
          employeeName: emp.displayName ?? `${emp.firstName} ${emp.lastName}`,
          slots: filtered,
        });
      }

      return results;
    });
  }

  /**
   * Měsíční přehled dostupnosti (sprint 10.18) — pro vkládací kalendář.
   * Pro každý den měsíce spočítá počet volných slotů (napříč zaměstnanci).
   * Jeden request místo ~30 z klienta.
   */
  async availableDays(input: {
    tenantId: string;
    serviceId: string;
    employeeId?: string | null;
    branchId?: string | null;
    month: string; // YYYY-MM
    timezone: string;
  }): Promise<Array<{ date: string; slotCount: number }>> {
    const [yStr, mStr] = input.month.split('-');
    const y = Number(yStr);
    const m = Number(mStr); // 1-based
    // Date.UTC(y, m, 0) = poslední den měsíce m (m jako 0-based index = další měsíc, den 0).
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    const out: Array<{ date: string; slotCount: number }> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${input.month}-${String(d).padStart(2, '0')}`;
      const perEmp = await this.query({
        tenantId: input.tenantId,
        serviceId: input.serviceId,
        employeeId: input.employeeId ?? null,
        branchId: input.branchId ?? null,
        date,
        timezone: input.timezone,
      });
      const slotCount = perEmp.reduce((sum, e) => sum + e.slots.length, 0);
      out.push({ date, slotCount });
    }
    return out;
  }
}
