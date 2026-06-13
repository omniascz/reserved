// Public endpointy — bez Bearer tokenu. Tenant identifikován slug-em v URL.
// Cache-friendly read-only operace + endpoint pro vytvoření holds.

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { DbService } from '../db/db.service.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { ConfirmBookingSchema, type ConfirmBookingDto } from '../bookings/dto/booking.dto.js';
import { ClassSessionsService } from '../class-sessions/class-sessions.service.js';
import {
  JoinClassSessionSchema,
  type JoinClassSessionDto,
} from '../class-sessions/dto/class-session.dto.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { SubmitReviewSchema, type SubmitReviewDto } from '../reviews/dto/review.dto.js';
import { DrizzleTenantLookup } from '../tenant/tenant-lookup.service.js';
import { randomBytes } from 'node:crypto';

const HoldSchema = z.object({
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid(),
  startsAt: z.string().datetime(),
});

@Controller('public/:slug')
export class PublicController {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(DrizzleTenantLookup) private readonly tenantLookup: DrizzleTenantLookup,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(ClassSessionsService) private readonly classSessions: ClassSessionsService,
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
  ) {}

  /** GET /api/v1/public/:slug — info o tenant (název + theme + currency, timezone). */
  @Public()
  @Get()
  async info(@Param('slug') slug: string) {
    const tenant = await this.resolveTenant(slug);
    // Načti theme z DB — používá widget pro CSS variables.
    const themeRow = await this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      const rows = await tx
        .select({ theme: schema.tenants.theme })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenant.id))
        .limit(1);
      return rows[0];
    });
    return {
      data: {
        slug: tenant.slug,
        name: tenant.name,
        theme: (themeRow?.theme ?? {}) as Record<string, unknown>,
      },
    };
  }

  /** GET /api/v1/public/:slug/services */
  @Public()
  @Get('services')
  async listServices(@Param('slug') slug: string) {
    const tenant = await this.resolveTenant(slug);
    const data = await this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      return tx
        .select({
          id: schema.services.id,
          categoryId: schema.services.categoryId,
          name: schema.services.name,
          description: schema.services.description,
          durationMinutes: schema.services.durationMinutes,
          priceHellers: schema.services.priceHellers,
          currency: schema.services.currency,
          color: schema.services.color,
          imageUrl: schema.services.imageUrl,
          capacity: schema.services.capacity,
        })
        .from(schema.services)
        .where(
          and(
            eq(schema.services.tenantId, tenant.id),
            eq(schema.services.isPublic, true),
            eq(schema.services.isActive, true),
            isNull(schema.services.deletedAt),
          ),
        )
        .orderBy(asc(schema.services.sortOrder), asc(schema.services.name));
    });
    return { data };
  }

  /** GET /api/v1/public/:slug/branches — list aktivních poboček. */
  @Public()
  @Get('branches')
  async listBranches(@Param('slug') slug: string) {
    const tenant = await this.resolveTenant(slug);
    const data = await this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      return tx
        .select({
          id: schema.branches.id,
          slug: schema.branches.slug,
          name: schema.branches.name,
          address: schema.branches.address,
          city: schema.branches.city,
          phone: schema.branches.phone,
          email: schema.branches.email,
          timezone: schema.branches.timezone,
          isDefault: schema.branches.isDefault,
        })
        .from(schema.branches)
        .where(and(eq(schema.branches.tenantId, tenant.id), isNull(schema.branches.deletedAt)))
        .orderBy(asc(schema.branches.name));
    });
    return { data };
  }

  /**
   * GET /api/v1/public/:slug/employees?branchId=...
   * Pokud branchId zadáno, filtruje jen zaměstnance přiřazené k té pobočce.
   */
  @Public()
  @Get('employees')
  async listEmployees(@Param('slug') slug: string, @Query('branchId') branchId?: string) {
    const tenant = await this.resolveTenant(slug);
    const data = await this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      const baseQuery = tx
        .selectDistinct({
          id: schema.employees.id,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          displayName: schema.employees.displayName,
          title: schema.employees.title,
          bio: schema.employees.bio,
          avatarUrl: schema.employees.avatarUrl,
          color: schema.employees.color,
          sortOrder: schema.employees.sortOrder,
        })
        .from(schema.employees);

      const query = branchId
        ? baseQuery
            .innerJoin(
              schema.employeeBranches,
              eq(schema.employees.id, schema.employeeBranches.employeeId),
            )
            .where(
              and(
                eq(schema.employees.tenantId, tenant.id),
                eq(schema.employees.isPublic, true),
                eq(schema.employees.isActive, true),
                eq(schema.employees.acceptsOnlineBookings, true),
                isNull(schema.employees.deletedAt),
                eq(schema.employeeBranches.branchId, branchId),
              ),
            )
        : baseQuery.where(
            and(
              eq(schema.employees.tenantId, tenant.id),
              eq(schema.employees.isPublic, true),
              eq(schema.employees.isActive, true),
              eq(schema.employees.acceptsOnlineBookings, true),
              isNull(schema.employees.deletedAt),
            ),
          );

      const rows = await query.orderBy(
        asc(schema.employees.sortOrder),
        asc(schema.employees.lastName),
      );
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return rows.map(({ sortOrder: _ignored, ...e }) => e);
    });
    return { data };
  }

  /** GET /api/v1/public/:slug/availability?serviceId=...&date=YYYY-MM-DD&employeeId=... */
  @Public()
  @Get('availability')
  async availabilityForDate(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const tenant = await this.resolveTenant(slug);
    if (!serviceId || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
      throw new BadRequestException({
        error: { code: 'INVALID_SERVICE_ID', message: 'serviceId je povinné a musí být UUID.' },
      });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({
        error: { code: 'INVALID_DATE', message: 'date musí být ve formátu YYYY-MM-DD.' },
      });
    }

    const tenantTz = await this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      const rows = await tx
        .select({ timezone: schema.tenants.timezone })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenant.id))
        .limit(1);
      return rows[0]?.timezone ?? 'Europe/Prague';
    });

    const data = await this.availability.query({
      tenantId: tenant.id,
      serviceId,
      date,
      employeeId: employeeId ?? null,
      timezone: tenantTz,
    });
    return { data };
  }

  // (availability query nyní volitelně přijímá branchId — viz availability.service.ts)

  /** POST /api/v1/public/:slug/holds — zamkne slot na 10 min. */
  @Public()
  @Post('holds')
  @HttpCode(201)
  async createHold(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(HoldSchema)) dto: z.infer<typeof HoldSchema>,
  ) {
    const tenant = await this.resolveTenant(slug);

    return this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      // 1. Načti službu pro durations
      const svcRows = await tx
        .select()
        .from(schema.services)
        .where(and(eq(schema.services.id, dto.serviceId), eq(schema.services.tenantId, tenant.id)))
        .limit(1);
      const service = svcRows[0];
      if (!service) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }

      // 2. Ověř employee + že umí službu
      const empRows = await tx
        .select({ id: schema.employees.id, branchId: schema.employeeBranches.branchId })
        .from(schema.employees)
        .leftJoin(
          schema.employeeBranches,
          eq(schema.employees.id, schema.employeeBranches.employeeId),
        )
        .where(
          and(eq(schema.employees.id, dto.employeeId), eq(schema.employees.tenantId, tenant.id)),
        )
        .limit(1);
      const emp = empRows[0];
      if (!emp) {
        throw new NotFoundException({
          error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
        });
      }

      // Default branch fallback: pokud zaměstnanec nemá branch, vyber default branch tenanta
      let branchId = emp.branchId;
      if (!branchId) {
        const defaultBranch = await tx
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.tenantId, tenant.id))
          .limit(1);
        branchId = defaultBranch[0]?.id ?? null;
      }
      if (!branchId) {
        throw new NotFoundException({
          error: { code: 'BRANCH_NOT_FOUND', message: 'Pobočka nenalezena.' },
        });
      }

      // 3. Spočítej časy
      const startsAt = new Date(dto.startsAt);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
      const bufferStartsAt = new Date(startsAt.getTime() - service.bufferBeforeMinutes * 60_000);
      const bufferEndsAt = new Date(endsAt.getTime() + service.bufferAfterMinutes * 60_000);
      const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 min TTL
      const sessionToken = randomBytes(24).toString('hex');

      // 4. Insert — EXCLUDE constraint zachytí kolize automaticky
      try {
        const [hold] = await tx
          .insert(schema.slotHolds)
          .values({
            tenantId: tenant.id,
            branchId,
            serviceId: dto.serviceId,
            employeeId: dto.employeeId,
            startsAt,
            endsAt,
            bufferStartsAt,
            bufferEndsAt,
            expiresAt,
            sessionToken,
            status: 'active',
          })
          .returning();

        return {
          data: {
            holdId: hold!.id,
            sessionToken,
            startsAt: hold!.startsAt,
            endsAt: hold!.endsAt,
            expiresAt: hold!.expiresAt,
          },
        };
      } catch (err) {
        const e = err as { code?: string; message?: string; cause?: unknown };
        const cause = e.cause as { code?: string; message?: string } | undefined;
        const pgCode = e.code ?? cause?.code;
        const pgMessage = e.message ?? cause?.message ?? '';
        if (pgCode === '23P01' || /exclusion|conflicting key value/i.test(pgMessage)) {
          throw new BadRequestException({
            error: {
              code: 'SLOT_TAKEN',
              message: 'Tento slot už byl mezitím zarezervován. Vyber jiný.',
            },
          });
        }
        throw err;
      }
    });
  }

  /** POST /api/v1/public/:slug/bookings — finalizuje rezervaci ze slot holdu. */
  @Public()
  @Post('bookings')
  @HttpCode(201)
  async confirmBooking(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(ConfirmBookingSchema)) dto: ConfirmBookingDto,
  ) {
    const tenant = await this.resolveTenant(slug);
    const booking = await this.bookings.confirmFromHold(tenant.id, dto);
    return {
      data: {
        id: booking.id,
        referenceCode: booking.referenceCode,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: booking.status,
      },
    };
  }

  // ─── Skupinové lekce (sprint 10.0) ──────────────────────────────────

  /** GET /api/v1/public/:slug/class-sessions?serviceId=&from=&to= — otevřené lekce s volnými místy. */
  @Public()
  @Get('class-sessions')
  async listClassSessions(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenant = await this.resolveTenant(slug);
    const data = await this.classSessions.listOpenPublic(tenant.id, { serviceId, from, to });
    return { data };
  }

  /** POST /api/v1/public/:slug/class-sessions/:id/join — self-service přihlášení do lekce. */
  @Public()
  @Post('class-sessions/:id/join')
  @HttpCode(201)
  async joinClassSession(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(JoinClassSessionSchema)) dto: JoinClassSessionDto,
  ) {
    const tenant = await this.resolveTenant(slug);
    const booking = await this.classSessions.joinPublic(tenant.id, id, dto);
    return {
      data: {
        id: booking.id,
        referenceCode: booking.referenceCode,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: booking.status,
      },
    };
  }

  /** POST /api/v1/public/:slug/class-sessions/:id/waitlist — pořadník na plnou lekci. */
  @Public()
  @Post('class-sessions/:id/waitlist')
  @HttpCode(201)
  async joinWaitlist(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(JoinClassSessionSchema)) dto: JoinClassSessionDto,
  ) {
    const tenant = await this.resolveTenant(slug);
    const entry = await this.classSessions.joinWaitlistPublic(tenant.id, id, dto);
    return { data: { id: entry.id, position: entry.position, status: entry.status } };
  }

  // ─── Recenze (sprint 10.6) ──────────────────────────────────────────

  /** POST /api/v1/public/:slug/reviews — odeslání recenze k rezervaci. */
  @Public()
  @Post('reviews')
  @HttpCode(201)
  async submitReview(
    @Param('slug') slug: string,
    @Body(new ZodValidationPipe(SubmitReviewSchema)) dto: SubmitReviewDto,
  ) {
    const tenant = await this.resolveTenant(slug);
    const review = await this.reviews.submitPublic(tenant.id, dto);
    return { data: { id: review.id, rating: review.rating, status: review.status } };
  }

  /** GET /api/v1/public/:slug/reviews?serviceId=… — publikované recenze + průměr. */
  @Public()
  @Get('reviews')
  async listReviews(@Param('slug') slug: string, @Query('serviceId') serviceId: string) {
    const tenant = await this.resolveTenant(slug);
    if (!serviceId || !/^[0-9a-f-]{36}$/i.test(serviceId)) {
      throw new BadRequestException({
        error: { code: 'INVALID_SERVICE_ID', message: 'serviceId je povinné a musí být UUID.' },
      });
    }
    const data = await this.reviews.publicForService(tenant.id, serviceId);
    return { data };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async resolveTenant(slug: string) {
    const tenant = await this.tenantLookup.bySlug(slug);
    if (!tenant) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: `Tenant "${slug}" neexistuje.` },
      });
    }
    return tenant;
  }
}
