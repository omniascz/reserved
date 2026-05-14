// ServicesService — CRUD pro službu a kategorie. Zápis a čtení vždy v
// withRlsContext s aktuální tenant_id a rolí, takže RLS izoluje tenant.

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type {
  CreateServiceCategoryDto,
  CreateServiceDto,
  UpdateServiceCategoryDto,
  UpdateServiceDto,
} from './dto/service.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager mohou spravovat katalog služeb.',
      },
    });
  }
}

@Injectable()
export class ServicesService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── Kategorie ────────────────────────────────────────────────────────

  async listCategories(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.serviceCategories)
        .where(
          and(
            eq(schema.serviceCategories.tenantId, tenantId),
            isNull(schema.serviceCategories.deletedAt),
          ),
        )
        .orderBy(asc(schema.serviceCategories.sortOrder), asc(schema.serviceCategories.name));
    });
  }

  async createCategory(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: CreateServiceCategoryDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.serviceCategories)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          color: dto.color ?? null,
          icon: dto.icon ?? null,
          sortOrder: dto.sortOrder,
        })
        .returning();
      return row;
    });
  }

  async updateCategory(
    tenantId: string,
    userId: string,
    role: AppRole,
    categoryId: string,
    dto: UpdateServiceCategoryDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.serviceCategories)
        .set({
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.serviceCategories.id, categoryId),
            eq(schema.serviceCategories.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Kategorie nenalezena.' },
        });
      }
      return row;
    });
  }

  async deleteCategory(tenantId: string, userId: string, role: AppRole, categoryId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.serviceCategories)
        .set({ deletedAt: new Date(), isActive: false })
        .where(
          and(
            eq(schema.serviceCategories.id, categoryId),
            eq(schema.serviceCategories.tenantId, tenantId),
          ),
        )
        .returning({ id: schema.serviceCategories.id });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'CATEGORY_NOT_FOUND', message: 'Kategorie nenalezena.' },
        });
      }
    });
  }

  // ─── Služby ──────────────────────────────────────────────────────────

  async listServices(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.services)
        .where(and(eq(schema.services.tenantId, tenantId), isNull(schema.services.deletedAt)))
        .orderBy(asc(schema.services.sortOrder), asc(schema.services.name));
    });
  }

  async getService(tenantId: string, userId: string, role: AppRole, serviceId: string) {
    const rows = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.services)
        .where(and(eq(schema.services.id, serviceId), eq(schema.services.tenantId, tenantId)))
        .limit(1);
    });
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
      });
    }
    return row;
  }

  async createService(tenantId: string, userId: string, role: AppRole, dto: CreateServiceDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.services)
        .values({
          tenantId,
          categoryId: dto.categoryId ?? null,
          name: dto.name,
          description: dto.description ?? null,
          durationMinutes: dto.durationMinutes,
          bufferAfterMinutes: dto.bufferAfterMinutes,
          bufferBeforeMinutes: dto.bufferBeforeMinutes,
          priceHellers: dto.priceHellers,
          currency: dto.currency,
          color: dto.color ?? null,
          imageUrl: dto.imageUrl ?? null,
          isPublic: dto.isPublic,
          depositPercent: dto.depositPercent ?? null,
          capacity: dto.capacity,
          sortOrder: dto.sortOrder,
          isOnline: dto.isOnline,
          defaultOnlineMeetingUrl: dto.defaultOnlineMeetingUrl ?? null,
        })
        .returning();
      return row;
    });
  }

  async updateService(
    tenantId: string,
    userId: string,
    role: AppRole,
    serviceId: string,
    dto: UpdateServiceDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.services)
        .set({
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.bufferAfterMinutes !== undefined
            ? { bufferAfterMinutes: dto.bufferAfterMinutes }
            : {}),
          ...(dto.bufferBeforeMinutes !== undefined
            ? { bufferBeforeMinutes: dto.bufferBeforeMinutes }
            : {}),
          ...(dto.priceHellers !== undefined ? { priceHellers: dto.priceHellers } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
          ...(dto.depositPercent !== undefined ? { depositPercent: dto.depositPercent } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isOnline !== undefined ? { isOnline: dto.isOnline } : {}),
          ...(dto.defaultOnlineMeetingUrl !== undefined
            ? { defaultOnlineMeetingUrl: dto.defaultOnlineMeetingUrl }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.services.id, serviceId), eq(schema.services.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }
      return row;
    });
  }

  async deleteService(tenantId: string, userId: string, role: AppRole, serviceId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.services)
        .set({ deletedAt: new Date(), isActive: false })
        .where(and(eq(schema.services.id, serviceId), eq(schema.services.tenantId, tenantId)))
        .returning({ id: schema.services.id });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }
    });
  }
}
