// CoursesService — kurzy (hloubka B, sprint 10.26).
//
// Kurz = série lekcí (class_sessions s course_id). Klient se přihlásí JEDNOU
// → vznikne booking v každé lekci. Kapacita se hlídá na úrovni kurzu.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { ClassSessionsService } from '../class-sessions/class-sessions.service.js';
import { CustomersService } from '../customers/customers.service.js';
import type { CreateCourseDto, EnrollCourseDto } from './dto/course.dto.js';

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
  return `K-${part()}-${part()}`;
}

@Injectable()
export class CoursesService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(ClassSessionsService) private readonly classSessions: ClassSessionsService,
    @Inject(CustomersService) private readonly customers: CustomersService,
  ) {}

  /** Založí kurz + jeho lekce (class_sessions s course_id). Kolizní lekce přeskočí. */
  async create(tenantId: string, userId: string, role: AppRole, dto: CreateCourseDto) {
    assertCanManage(role);
    const course = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [c] = await tx
          .insert(schema.courses)
          .values({
            tenantId,
            branchId: dto.branchId ?? null,
            serviceId: dto.serviceId,
            employeeId: dto.employeeId ?? null,
            name: dto.name,
            description: dto.description ?? null,
            capacity: dto.capacity,
            priceHellers: dto.priceHellers,
            status: 'open',
          })
          .returning();
        return c!;
      },
    );

    const createdIds: string[] = [];
    const skipped: Array<{ startsAt: string; reason: string }> = [];
    for (const startsAt of dto.lessons) {
      try {
        const session = await this.classSessions.create(tenantId, userId, role, {
          serviceId: dto.serviceId,
          employeeId: dto.employeeId ?? null,
          branchId: dto.branchId ?? undefined,
          capacity: dto.capacity,
          startsAt,
        });
        createdIds.push(session.id);
      } catch (err) {
        const code =
          (err as { response?: { error?: { code?: string } } })?.response?.error?.code ??
          'CONFLICT';
        skipped.push({ startsAt, reason: code });
      }
    }

    if (createdIds.length > 0) {
      await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
        await tx
          .update(schema.classSessions)
          .set({ courseId: course.id })
          .where(
            and(
              eq(schema.classSessions.tenantId, tenantId),
              sql`${schema.classSessions.id} IN (${sql.join(
                createdIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          );
      });
    }

    return { courseId: course.id, name: course.name, lessonsCreated: createdIds.length, skipped };
  }

  async list(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.tenantId, tenantId))
        .orderBy(asc(schema.courses.name));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, courseId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [course] = await tx
        .select()
        .from(schema.courses)
        .where(and(eq(schema.courses.id, courseId), eq(schema.courses.tenantId, tenantId)))
        .limit(1);
      if (!course) {
        throw new NotFoundException({
          error: { code: 'COURSE_NOT_FOUND', message: 'Kurz nenalezen.' },
        });
      }
      const lessons = await tx
        .select({
          id: schema.classSessions.id,
          startsAt: schema.classSessions.startsAt,
          status: schema.classSessions.status,
        })
        .from(schema.classSessions)
        .where(eq(schema.classSessions.courseId, courseId))
        .orderBy(asc(schema.classSessions.startsAt));
      const cntRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.courseEnrollments)
        .where(
          and(
            eq(schema.courseEnrollments.courseId, courseId),
            ne(schema.courseEnrollments.status, 'cancelled'),
          ),
        );
      const count = cntRows[0]?.count ?? 0;
      return { ...course, lessons, enrolledCount: count, freeSpots: course.capacity - count };
    });
  }

  /** Zápis klienta do kurzu = booking v každé lekci. */
  async enroll(
    tenantId: string,
    userId: string,
    role: AppRole,
    courseId: string,
    dto: EnrollCourseDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [course] = await tx
        .select()
        .from(schema.courses)
        .where(and(eq(schema.courses.id, courseId), eq(schema.courses.tenantId, tenantId)))
        .limit(1);
      if (!course) {
        throw new NotFoundException({
          error: { code: 'COURSE_NOT_FOUND', message: 'Kurz nenalezen.' },
        });
      }
      if (course.status !== 'open') {
        throw new BadRequestException({
          error: { code: 'COURSE_CLOSED', message: 'Kurz není otevřený k zápisu.' },
        });
      }

      const cntRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.courseEnrollments)
        .where(
          and(
            eq(schema.courseEnrollments.courseId, courseId),
            ne(schema.courseEnrollments.status, 'cancelled'),
          ),
        );
      const count = cntRows[0]?.count ?? 0;
      if (count >= course.capacity) {
        throw new BadRequestException({
          error: { code: 'COURSE_FULL', message: 'Kurz je plný.' },
        });
      }

      const nameParts = dto.customerName.trim().split(/\s+/);
      const { id: customerId } = await this.customers.findOrCreate(tx, tenantId, {
        firstName: nameParts[0] ?? dto.customerName,
        lastName: nameParts.slice(1).join(' ') || (nameParts[0] ?? dto.customerName),
        email: dto.customerEmail,
        phone: dto.customerPhone ?? null,
      });

      let enrollment;
      try {
        [enrollment] = await tx
          .insert(schema.courseEnrollments)
          .values({
            tenantId,
            courseId,
            customerId,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            status: 'enrolled',
          })
          .returning();
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        if ((e.code ?? e.cause?.code) === '23505') {
          throw new BadRequestException({
            error: { code: 'ALREADY_ENROLLED', message: 'Klient už je v kurzu zapsaný.' },
          });
        }
        throw err;
      }

      // Booking v každé otevřené lekci kurzu.
      const lessons = await tx
        .select()
        .from(schema.classSessions)
        .where(
          and(eq(schema.classSessions.courseId, courseId), eq(schema.classSessions.status, 'open')),
        );
      let booked = 0;
      for (const lesson of lessons) {
        const inc = await tx
          .update(schema.classSessions)
          .set({ bookedCount: sql`${schema.classSessions.bookedCount} + 1`, updatedAt: new Date() })
          .where(
            and(
              eq(schema.classSessions.id, lesson.id),
              sql`${schema.classSessions.bookedCount} < ${schema.classSessions.capacity}`,
            ),
          )
          .returning({ id: schema.classSessions.id });
        if (inc.length === 0) continue; // lekce plná — přeskoč
        await tx.insert(schema.bookings).values({
          tenantId,
          branchId: lesson.branchId,
          serviceId: lesson.serviceId,
          employeeId: lesson.employeeId,
          sessionId: lesson.id,
          customerId,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone ?? null,
          startsAt: lesson.startsAt,
          endsAt: lesson.endsAt,
          bufferStartsAt: lesson.bufferStartsAt,
          bufferEndsAt: lesson.bufferEndsAt,
          status: 'confirmed',
          pricePaidHellers: 0,
          currency: 'CZK',
          referenceCode: refCode(),
          metadata: { source: 'course', courseId },
        });
        booked++;
      }

      return { enrollmentId: enrollment!.id, lessonsBooked: booked };
    });
  }

  /** Zrušení zápisu = zruší bookingy studenta ve všech lekcích kurzu + uvolní místa. */
  async cancelEnrollment(
    tenantId: string,
    userId: string,
    role: AppRole,
    courseId: string,
    enrollmentId: string,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [enr] = await tx
        .select()
        .from(schema.courseEnrollments)
        .where(
          and(
            eq(schema.courseEnrollments.id, enrollmentId),
            eq(schema.courseEnrollments.courseId, courseId),
            eq(schema.courseEnrollments.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!enr) {
        throw new NotFoundException({
          error: { code: 'ENROLLMENT_NOT_FOUND', message: 'Zápis nenalezen.' },
        });
      }
      await tx
        .update(schema.courseEnrollments)
        .set({ status: 'cancelled' })
        .where(eq(schema.courseEnrollments.id, enrollmentId));

      // Lekce kurzu.
      const lessons = await tx
        .select({ id: schema.classSessions.id })
        .from(schema.classSessions)
        .where(eq(schema.classSessions.courseId, courseId));
      const lessonIds = lessons.map((l) => l.id);
      if (lessonIds.length === 0) return { cancelledBookings: 0 };

      // Zruš aktivní bookingy studenta v těchto lekcích + uvolni místa.
      const cancelled = await tx
        .update(schema.bookings)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.bookings.tenantId, tenantId),
            eq(schema.bookings.customerId, enr.customerId!),
            inArray(schema.bookings.sessionId, lessonIds),
            sql`${schema.bookings.status} NOT IN ('cancelled', 'no_show')`,
          ),
        )
        .returning({ sessionId: schema.bookings.sessionId });

      for (const c of cancelled) {
        if (!c.sessionId) continue;
        await tx
          .update(schema.classSessions)
          .set({
            bookedCount: sql`GREATEST(${schema.classSessions.bookedCount} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(schema.classSessions.id, c.sessionId));
      }
      return { cancelledBookings: cancelled.length };
    });
  }
}
