// TableCombinationsService — správa slučitelných sestav stolů (R3 konfigurace).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type {
  CreateTableCombinationDto,
  UpdateTableCombinationDto,
} from './dto/table-combination.dto.js';

const CONFIG_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanConfigure(role: AppRole): void {
  if (!CONFIG_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Jen vlastník/manažer může spravovat sestavy.' },
    });
  }
}

@Injectable()
export class TableCombinationsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateTableCombinationDto) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await this.assertTablesExist(tx, tenantId, dto.resourceIds);
      const [combo] = await tx
        .insert(schema.tableCombinations)
        .values({
          tenantId,
          branchId: dto.branchId,
          name: dto.name,
          resourceIds: dto.resourceIds,
          combinedCapacity: dto.combinedCapacity,
          minPartySize: dto.minPartySize,
        })
        .returning();
      return combo!;
    });
  }

  async list(tenantId: string, userId: string, role: AppRole, branchId?: string) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conds = [
        eq(schema.tableCombinations.tenantId, tenantId),
        isNull(schema.tableCombinations.deletedAt),
      ];
      if (branchId) conds.push(eq(schema.tableCombinations.branchId, branchId));
      return tx
        .select()
        .from(schema.tableCombinations)
        .where(and(...conds))
        .orderBy(asc(schema.tableCombinations.name));
    });
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    dto: UpdateTableCombinationDto,
  ) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      if (dto.resourceIds) await this.assertTablesExist(tx, tenantId, dto.resourceIds);
      const [updated] = await tx
        .update(schema.tableCombinations)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.resourceIds !== undefined && { resourceIds: dto.resourceIds }),
          ...(dto.combinedCapacity !== undefined && { combinedCapacity: dto.combinedCapacity }),
          ...(dto.minPartySize !== undefined && { minPartySize: dto.minPartySize }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.tableCombinations.id, id),
            eq(schema.tableCombinations.tenantId, tenantId),
            isNull(schema.tableCombinations.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'COMBINATION_NOT_FOUND', message: 'Sestava nenalezena.' },
        });
      }
      return updated;
    });
  }

  async remove(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanConfigure(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [deleted] = await tx
        .update(schema.tableCombinations)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(schema.tableCombinations.id, id),
            eq(schema.tableCombinations.tenantId, tenantId),
            isNull(schema.tableCombinations.deletedAt),
          ),
        )
        .returning({ id: schema.tableCombinations.id });
      if (!deleted) {
        throw new NotFoundException({
          error: { code: 'COMBINATION_NOT_FOUND', message: 'Sestava nenalezena.' },
        });
      }
      return { id: deleted.id, deleted: true };
    });
  }

  /** Ověří, že všechny zadané zdroje existují a jsou stoly (type='table'). */
  private async assertTablesExist(
    tx: Parameters<Parameters<DbService['withRlsContext']>[1]>[0],
    tenantId: string,
    resourceIds: string[],
  ): Promise<void> {
    const rows = await tx
      .select({ id: schema.resources.id })
      .from(schema.resources)
      .where(
        and(
          eq(schema.resources.tenantId, tenantId),
          eq(schema.resources.type, 'table'),
          isNull(schema.resources.deletedAt),
          inArray(schema.resources.id, resourceIds),
        ),
      );
    if (rows.length !== new Set(resourceIds).size) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_TABLES',
          message: 'Některý ze zadaných stolů neexistuje nebo není typu table.',
        },
      });
    }
  }
}
