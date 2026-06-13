// ResourcesService — CRUD pro zdroje (přístroje) pro EMS (sprint 10.2).

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateResourceDto, UpdateResourceDto } from './dto/resource.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager mohou spravovat zdroje.',
      },
    });
  }
}

@Injectable()
export class ResourcesService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.resources)
        .where(and(eq(schema.resources.tenantId, tenantId), isNull(schema.resources.deletedAt)))
        .orderBy(asc(schema.resources.name));
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateResourceDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Ověř, že pobočka patří tenantovi.
      const branch = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(and(eq(schema.branches.id, dto.branchId), eq(schema.branches.tenantId, tenantId)))
        .limit(1);
      if (!branch[0]) {
        throw new NotFoundException({
          error: { code: 'BRANCH_NOT_FOUND', message: 'Pobočka nenalezena.' },
        });
      }
      const [row] = await tx
        .insert(schema.resources)
        .values({ tenantId, branchId: dto.branchId, name: dto.name, type: dto.type })
        .returning();
      return row;
    });
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    resourceId: string,
    dto: UpdateResourceDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.resources)
        .set({
          ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.resources.id, resourceId), eq(schema.resources.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Zdroj nenalezen.' },
        });
      }
      return row;
    });
  }

  async remove(tenantId: string, userId: string, role: AppRole, resourceId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.resources)
        .set({ deletedAt: new Date(), isActive: false })
        .where(and(eq(schema.resources.id, resourceId), eq(schema.resources.tenantId, tenantId)))
        .returning({ id: schema.resources.id });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'RESOURCE_NOT_FOUND', message: 'Zdroj nenalezen.' },
        });
      }
    });
  }
}
