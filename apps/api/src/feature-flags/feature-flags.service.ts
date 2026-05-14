// FeatureFlagsService — sprava tenant-scoped feature flagu (sprint 3.3 fáze D).
//
// Pouziti z jinych modulu:
//   const enabled = await this.flags.isEnabled(tenantId, 'beta:google_sync');
//   if (enabled) { ... }
//
// Pro typed config:
//   const config = await this.flags.getConfig<{ requiredTags: string[] }>(
//     tenantId, 'package_visibility:vip_bundle'
//   );

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { ToggleFeatureFlagDto, UpsertFeatureFlagDto } from './dto/feature-flag.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat feature flags.',
      },
    });
  }
}

@Injectable()
export class FeatureFlagsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── CRUD (admin/manager) ──────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.featureFlags)
        .where(eq(schema.featureFlags.tenantId, tenantId))
        .orderBy(asc(schema.featureFlags.key));
    });
  }

  /**
   * Upsert — pokud klic existuje, updatne; jinak vytvori.
   */
  async upsert(tenantId: string, userId: string, role: AppRole, dto: UpsertFeatureFlagDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.featureFlags)
        .where(
          and(eq(schema.featureFlags.tenantId, tenantId), eq(schema.featureFlags.key, dto.key)),
        )
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(schema.featureFlags)
          .set({
            description: dto.description ?? null,
            isEnabled: dto.isEnabled,
            config: dto.config,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.featureFlags.id, existing.id))
          .returning();
        return updated!;
      }

      const [created] = await tx
        .insert(schema.featureFlags)
        .values({
          tenantId,
          key: dto.key,
          description: dto.description ?? null,
          isEnabled: dto.isEnabled,
          config: dto.config,
          updatedBy: userId,
        })
        .returning();
      return created!;
    });
  }

  async toggle(
    tenantId: string,
    userId: string,
    role: AppRole,
    key: string,
    dto: ToggleFeatureFlagDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.featureFlags)
        .set({
          isEnabled: dto.isEnabled,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.featureFlags.tenantId, tenantId), eq(schema.featureFlags.key, key)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'FLAG_NOT_FOUND', message: `Flag '${key}' neexistuje.` },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, key: string): Promise<void> {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .delete(schema.featureFlags)
        .where(and(eq(schema.featureFlags.tenantId, tenantId), eq(schema.featureFlags.key, key)));
    });
  }

  // ─── Helper API (volaji jine services) ─────────────────────────────

  /**
   * Vrati true pokud flag existuje a je enabled. Pokud flag neexistuje,
   * vraci defaultValue (default false).
   *
   * Pouziva service context (obchazi RLS) protoze caller je zpravidla
   * jiny service, ne uzivatel.
   */
  async isEnabled(tenantId: string, key: string, defaultValue = false): Promise<boolean> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [flag] = await tx
        .select({ isEnabled: schema.featureFlags.isEnabled })
        .from(schema.featureFlags)
        .where(and(eq(schema.featureFlags.tenantId, tenantId), eq(schema.featureFlags.key, key)))
        .limit(1);
      return flag?.isEnabled ?? defaultValue;
    });
  }

  /**
   * Vrati config flagu (typed). Pokud flag neexistuje nebo neni enabled,
   * vraci null.
   */
  async getConfig<T = Record<string, unknown>>(tenantId: string, key: string): Promise<T | null> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [flag] = await tx
        .select()
        .from(schema.featureFlags)
        .where(and(eq(schema.featureFlags.tenantId, tenantId), eq(schema.featureFlags.key, key)))
        .limit(1);
      if (!flag || !flag.isEnabled) return null;
      return flag.config as T;
    });
  }
}
