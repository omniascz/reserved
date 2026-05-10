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
import { DrizzleTenantLookup } from '../tenant/tenant-lookup.service.js';
import { randomUUID, randomBytes } from 'node:crypto';

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
  ) {}

  /** GET /api/v1/public/:slug — info o tenant (název, currency, timezone). */
  @Public()
  @Get()
  async info(@Param('slug') slug: string) {
    const tenant = await this.resolveTenant(slug);
    return {
      data: {
        slug: tenant.slug,
        name: tenant.name,
        // Pro UI nepotřebujeme všechno — schválně vrátíme jen veřejně vhodné.
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

  /** GET /api/v1/public/:slug/employees */
  @Public()
  @Get('employees')
  async listEmployees(@Param('slug') slug: string) {
    const tenant = await this.resolveTenant(slug);
    const data = await this.dbService.withRlsContext(serviceContext(tenant.id), async (tx) => {
      return tx
        .select({
          id: schema.employees.id,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          displayName: schema.employees.displayName,
          title: schema.employees.title,
          bio: schema.employees.bio,
          avatarUrl: schema.employees.avatarUrl,
          color: schema.employees.color,
        })
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.tenantId, tenant.id),
            eq(schema.employees.isPublic, true),
            eq(schema.employees.isActive, true),
            eq(schema.employees.acceptsOnlineBookings, true),
            isNull(schema.employees.deletedAt),
          ),
        )
        .orderBy(asc(schema.employees.sortOrder), asc(schema.employees.lastName));
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
