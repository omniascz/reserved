import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { OnboardingService } from '../onboarding/onboarding.service.js';
import type {
  CreateEmployeeDto,
  SetWorkingHoursDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager mohou spravovat zaměstnance.',
      },
    });
  }
}

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
  ) {}

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.employees)
        .where(and(eq(schema.employees.tenantId, tenantId), isNull(schema.employees.deletedAt)))
        .orderBy(asc(schema.employees.sortOrder), asc(schema.employees.lastName));
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, employeeId: string) {
    const result = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const empRows = await tx
          .select()
          .from(schema.employees)
          .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
          .limit(1);
        const employee = empRows[0];
        if (!employee) return null;

        const branches = await tx
          .select({
            branchId: schema.employeeBranches.branchId,
            isPrimary: schema.employeeBranches.isPrimary,
          })
          .from(schema.employeeBranches)
          .where(eq(schema.employeeBranches.employeeId, employeeId));

        const services = await tx
          .select({
            serviceId: schema.employeeServices.serviceId,
            customPriceHellers: schema.employeeServices.customPriceHellers,
            customDurationMinutes: schema.employeeServices.customDurationMinutes,
          })
          .from(schema.employeeServices)
          .where(eq(schema.employeeServices.employeeId, employeeId));

        return { employee, branches, services };
      },
    );

    if (!result) {
      throw new NotFoundException({
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
      });
    }
    return result;
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateEmployeeDto) {
    assertCanManage(role);
    const created = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [employee] = await tx
          .insert(schema.employees)
          .values({
            tenantId,
            userId: dto.userId ?? null,
            firstName: dto.firstName,
            lastName: dto.lastName,
            displayName: dto.displayName ?? null,
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            bio: dto.bio ?? null,
            avatarUrl: dto.avatarUrl ?? null,
            color: dto.color ?? null,
            title: dto.title ?? null,
            isPublic: dto.isPublic,
            acceptsOnlineBookings: dto.acceptsOnlineBookings,
            sortOrder: dto.sortOrder,
          })
          .returning();
        if (!employee) throw new Error('Failed to create employee');

        // Many-to-many: pobočky
        if (dto.branchIds.length > 0) {
          await tx.insert(schema.employeeBranches).values(
            dto.branchIds.map((branchId, idx) => ({
              tenantId,
              employeeId: employee.id,
              branchId,
              isPrimary: idx === 0, // první pobočka = primární
            })),
          );
        }

        // Many-to-many: služby
        if (dto.serviceIds.length > 0) {
          await tx.insert(schema.employeeServices).values(
            dto.serviceIds.map((serviceId) => ({
              tenantId,
              employeeId: employee.id,
              serviceId,
            })),
          );
        }

        return employee;
      },
    );

    // Onboarding: tym byl pozvan
    void this.onboarding.markStep(tenantId, 'teamInvited').catch(() => undefined);

    return created;
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    employeeId: string,
    dto: UpdateEmployeeDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.employees)
        .set({
          ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
          ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
          ...(dto.acceptsOnlineBookings !== undefined
            ? { acceptsOnlineBookings: dto.acceptsOnlineBookings }
            : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
        });
      }

      // Aktualizace many-to-many vazeb (jen pokud byly v requestu)
      if (dto.branchIds !== undefined) {
        await tx
          .delete(schema.employeeBranches)
          .where(eq(schema.employeeBranches.employeeId, employeeId));
        if (dto.branchIds.length > 0) {
          await tx.insert(schema.employeeBranches).values(
            dto.branchIds.map((branchId, idx) => ({
              tenantId,
              employeeId,
              branchId,
              isPrimary: idx === 0,
            })),
          );
        }
      }

      if (dto.serviceIds !== undefined) {
        await tx
          .delete(schema.employeeServices)
          .where(eq(schema.employeeServices.employeeId, employeeId));
        if (dto.serviceIds.length > 0) {
          await tx.insert(schema.employeeServices).values(
            dto.serviceIds.map((serviceId) => ({
              tenantId,
              employeeId,
              serviceId,
            })),
          );
        }
      }

      return row;
    });
  }

  async deactivate(tenantId: string, userId: string, role: AppRole, employeeId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.employees)
        .set({ deletedAt: new Date(), isActive: false })
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .returning({ id: schema.employees.id });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
        });
      }
    });
  }

  // ─── Pracovní doba ───────────────────────────────────────────────────

  async getSchedule(tenantId: string, userId: string, role: AppRole, employeeId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.employeeWorkingHours)
        .where(
          and(
            eq(schema.employeeWorkingHours.tenantId, tenantId),
            eq(schema.employeeWorkingHours.employeeId, employeeId),
            eq(schema.employeeWorkingHours.isActive, true),
          ),
        )
        .orderBy(
          asc(schema.employeeWorkingHours.dayOfWeek),
          asc(schema.employeeWorkingHours.startTime),
        );
    });
  }

  async setSchedule(
    tenantId: string,
    userId: string,
    role: AppRole,
    employeeId: string,
    dto: SetWorkingHoursDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Nejdřív ověř, že employee existuje a patří tenantovi
      const empRows = await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .limit(1);
      if (empRows.length === 0) {
        throw new NotFoundException({
          error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
        });
      }

      // Drop stávající
      await tx
        .delete(schema.employeeWorkingHours)
        .where(eq(schema.employeeWorkingHours.employeeId, employeeId));

      // Insert nové
      if (dto.schedule.length > 0) {
        await tx.insert(schema.employeeWorkingHours).values(
          dto.schedule.map((d) => ({
            tenantId,
            employeeId,
            branchId: d.branchId ?? null,
            dayOfWeek: d.dayOfWeek,
            startTime: d.startTime,
            endTime: d.endTime,
            breakStartTime: d.breakStartTime ?? null,
            breakEndTime: d.breakEndTime ?? null,
          })),
        );
      }

      return this.getSchedule(tenantId, userId, role, employeeId);
    });
  }
}
