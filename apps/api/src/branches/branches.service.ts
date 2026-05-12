// BranchesService — CRUD pro branches.
//
// Default branch (is_default = 'true') nelze smazat — chrání proti vytvoření
// stavu, kdy tenant má 0 poboček. Smazání obvyklé pobočky soft-delete přes
// deletedAt + isActive simulace.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat pobočky.',
      },
    });
  }
}

@Injectable()
export class BranchesService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.tenantId, tenantId), isNull(schema.branches.deletedAt)))
        .orderBy(schema.branches.name);
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [branch] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.id, id), eq(schema.branches.tenantId, tenantId)))
        .limit(1);
      if (!branch) {
        throw new NotFoundException({
          error: { code: 'BRANCH_NOT_FOUND', message: 'Pobočka nenalezena.' },
        });
      }
      return branch;
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateBranchDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Slug unique per tenant
      const [existing] = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(and(eq(schema.branches.tenantId, tenantId), eq(schema.branches.slug, dto.slug)))
        .limit(1);
      if (existing) {
        throw new ConflictException({
          error: { code: 'SLUG_TAKEN', message: `Slug "${dto.slug}" už používá jiná pobočka.` },
        });
      }

      const [created] = await tx
        .insert(schema.branches)
        .values({
          tenantId,
          name: dto.name,
          slug: dto.slug,
          address: dto.address ?? null,
          city: dto.city ?? null,
          postalCode: dto.postalCode ?? null,
          country: dto.country ?? 'CZ',
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          timezone: dto.timezone ?? null,
        })
        .returning();
      return created!;
    });
  }

  async update(tenantId: string, userId: string, role: AppRole, id: string, dto: UpdateBranchDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      if (dto.slug) {
        const [conflict] = await tx
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(and(eq(schema.branches.tenantId, tenantId), eq(schema.branches.slug, dto.slug)))
          .limit(1);
        if (conflict && conflict.id !== id) {
          throw new ConflictException({
            error: { code: 'SLUG_TAKEN', message: `Slug "${dto.slug}" už používá jiná pobočka.` },
          });
        }
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'name',
        'slug',
        'address',
        'city',
        'postalCode',
        'country',
        'phone',
        'email',
        'timezone',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }

      const [updated] = await tx
        .update(schema.branches)
        .set(updateData)
        .where(and(eq(schema.branches.id, id), eq(schema.branches.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'BRANCH_NOT_FOUND', message: 'Pobočka nenalezena.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [branch] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.id, id), eq(schema.branches.tenantId, tenantId)))
        .limit(1);
      if (!branch) {
        throw new NotFoundException({
          error: { code: 'BRANCH_NOT_FOUND', message: 'Pobočka nenalezena.' },
        });
      }
      if (branch.isDefault === 'true') {
        throw new BadRequestException({
          error: {
            code: 'CANNOT_DELETE_DEFAULT',
            message: 'Hlavní pobočku nelze smazat. Nastav jinou jako hlavní napřed.',
          },
        });
      }

      await tx
        .update(schema.branches)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.branches.id, id));
    });
  }
}
