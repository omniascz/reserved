// External API read-only katalog: služby, zaměstnanci, pobočky, dostupnost.
// Pro tenant integrace — vidí pouze svoje data (chráněno scopem).

import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { Public } from '../auth/decorators/public.decorator.js';
import { DbService } from '../db/db.service.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { ApiKeyGuard, requireScope } from '../api-keys/api-key.guard.js';

@Public()
@UseGuards(ApiKeyGuard)
@Controller('external/v1')
export class ExternalCatalogController {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
  ) {}

  @Get('services')
  async services(@Req() req: Request) {
    requireScope(req.apiKey, 'services:read');
    const tenantId = req.apiKey!.tenantId;
    const data = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
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
          capacity: schema.services.capacity,
          isPublic: schema.services.isPublic,
          isActive: schema.services.isActive,
        })
        .from(schema.services)
        .where(and(eq(schema.services.tenantId, tenantId), isNull(schema.services.deletedAt)))
        .orderBy(asc(schema.services.sortOrder), asc(schema.services.name));
    });
    return { data };
  }

  @Get('employees')
  async employees(@Req() req: Request) {
    requireScope(req.apiKey, 'employees:read');
    const tenantId = req.apiKey!.tenantId;
    const data = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          id: schema.employees.id,
          firstName: schema.employees.firstName,
          lastName: schema.employees.lastName,
          displayName: schema.employees.displayName,
          email: schema.employees.email,
          color: schema.employees.color,
          isActive: schema.employees.isActive,
          isPublic: schema.employees.isPublic,
        })
        .from(schema.employees)
        .where(and(eq(schema.employees.tenantId, tenantId), isNull(schema.employees.deletedAt)))
        .orderBy(asc(schema.employees.sortOrder), asc(schema.employees.lastName));
    });
    return { data };
  }

  @Get('branches')
  async branches(@Req() req: Request) {
    requireScope(req.apiKey, 'branches:read');
    const tenantId = req.apiKey!.tenantId;
    const data = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
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
        })
        .from(schema.branches)
        .where(eq(schema.branches.tenantId, tenantId))
        .orderBy(asc(schema.branches.name));
    });
    return { data };
  }

  /**
   * GET /external/v1/availability?serviceId=&date=YYYY-MM-DD&employeeId=&branchId=&timezone=
   * Vrací dostupné sloty pro daný den a službu.
   */
  @Get('availability')
  async availabilityHandler(
    @Req() req: Request,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('employeeId') employeeId?: string,
    @Query('branchId') branchId?: string,
    @Query('timezone') timezone?: string,
  ) {
    requireScope(req.apiKey, 'availability:read');
    const tenantId = req.apiKey!.tenantId;

    // Načti timezone z tenanta pokud nezadán explicitně
    const tz =
      timezone ??
      (await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
        const [t] = await tx
          .select({ timezone: schema.tenants.timezone })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, tenantId))
          .limit(1);
        return t?.timezone ?? 'Europe/Prague';
      }));

    const data = await this.availability.query({
      tenantId,
      serviceId,
      date,
      employeeId: employeeId ?? null,
      branchId: branchId ?? null,
      timezone: tz,
    });
    return { data };
  }
}
