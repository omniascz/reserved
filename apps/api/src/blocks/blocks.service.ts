// BlocksService — manuální blokace času (úklid, školení, atd.)

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { CreateBlockDto, UpdateBlockDto } from './dto/block.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner/manager mohou blokovat čas.' },
    });
  }
}

@Injectable()
export class BlocksService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async list(
    tenantId: string,
    userId: string,
    role: AppRole,
    range: { from?: string; to?: string },
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [eq(schema.availabilityBlocks.tenantId, tenantId)];
      if (range.from) {
        conditions.push(gte(schema.availabilityBlocks.endsAt, new Date(range.from)));
      }
      if (range.to) {
        conditions.push(lte(schema.availabilityBlocks.startsAt, new Date(range.to)));
      }
      return tx
        .select()
        .from(schema.availabilityBlocks)
        .where(and(...conditions))
        .orderBy(asc(schema.availabilityBlocks.startsAt))
        .limit(500);
    });
  }

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateBlockDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.availabilityBlocks)
        .values({
          tenantId,
          branchId: dto.branchId ?? null,
          employeeId: dto.employeeId ?? null,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          blockType: dto.blockType,
          title: dto.title ?? null,
          note: dto.note ?? null,
          createdBy: userId,
        })
        .returning();
      return row!;
    });
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    blockId: string,
    dto: UpdateBlockDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.availabilityBlocks)
        .set({
          ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
          ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
          ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
          ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
          ...(dto.blockType !== undefined ? { blockType: dto.blockType } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.availabilityBlocks.id, blockId),
            eq(schema.availabilityBlocks.tenantId, tenantId),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'BLOCK_NOT_FOUND', message: 'Blokace nenalezena.' },
        });
      }
      return row;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, blockId: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .delete(schema.availabilityBlocks)
        .where(
          and(
            eq(schema.availabilityBlocks.id, blockId),
            eq(schema.availabilityBlocks.tenantId, tenantId),
          ),
        );
    });
  }
}
