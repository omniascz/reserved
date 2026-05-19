// PlatformAuditService — zapisuje akce master adminu do platform_admin_actions.
//
// Pouziti: po kazde mutating operaci (suspend, plan change, impersonate, atd.)
// zavolat log(). Cteni jen pro audit GET endpoint.

import { Inject, Injectable } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { PlatformActionType } from '@reserved/db';

export interface PlatformAuditEntry {
  adminId: string;
  action: PlatformActionType;
  targetType: 'tenant' | 'platform_admin';
  targetId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PlatformAuditService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async log(entry: PlatformAuditEntry): Promise<void> {
    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx.insert(schema.platformAdminActions).values({
        adminId: entry.adminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        payload: entry.payload ?? {},
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      });
    });
  }

  async list(filters: {
    adminId?: string;
    targetId?: string;
    action?: string;
    limit?: number;
  }): Promise<(typeof schema.platformAdminActions.$inferSelect & { adminEmail: string | null })[]> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const limit = Math.min(filters.limit ?? 100, 500);
      const conditions = [];
      if (filters.adminId)
        conditions.push(eq(schema.platformAdminActions.adminId, filters.adminId));
      if (filters.targetId)
        conditions.push(eq(schema.platformAdminActions.targetId, filters.targetId));
      if (filters.action) conditions.push(eq(schema.platformAdminActions.action, filters.action));

      const where =
        conditions.length === 0
          ? undefined
          : conditions.length === 1
            ? conditions[0]
            : and(...conditions);

      const rows = await tx
        .select({
          id: schema.platformAdminActions.id,
          adminId: schema.platformAdminActions.adminId,
          action: schema.platformAdminActions.action,
          targetType: schema.platformAdminActions.targetType,
          targetId: schema.platformAdminActions.targetId,
          payload: schema.platformAdminActions.payload,
          ipAddress: schema.platformAdminActions.ipAddress,
          userAgent: schema.platformAdminActions.userAgent,
          createdAt: schema.platformAdminActions.createdAt,
          adminEmail: schema.platformAdmins.email,
        })
        .from(schema.platformAdminActions)
        .leftJoin(
          schema.platformAdmins,
          eq(schema.platformAdmins.id, schema.platformAdminActions.adminId),
        )
        .where(where)
        .orderBy(desc(schema.platformAdminActions.createdAt))
        .limit(limit);

      return rows;
    });
  }
}
