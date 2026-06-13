// SettingsService — čtení/zápis tenants.settings (booking rules, atd.)

import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import {
  BookingRulesSchema,
  DEFAULT_BOOKING_RULES,
  DEFAULT_NOTIFICATION_SETTINGS,
  LoyaltySettingsSchema,
  NotificationSettingsSchema,
  extractBookingRules,
  extractLoyaltySettings,
  extractNotificationSettings,
  type BookingRules,
  type LoyaltySettings,
  type NotificationSettings,
} from './settings.types.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může měnit nastavení.',
      },
    });
  }
}

@Injectable()
export class SettingsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async getBookingRules(tenantId: string, userId: string, role: AppRole): Promise<BookingRules> {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return extractBookingRules(rows[0]?.settings);
    });
  }

  async updateBookingRules(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: Partial<BookingRules>,
  ): Promise<BookingRules> {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const current = (rows[0]?.settings as Record<string, unknown> | null) ?? {};
      const currentRules = extractBookingRules(current);
      const merged = BookingRulesSchema.parse({ ...currentRules, ...input });
      const newSettings = { ...current, bookingRules: merged };

      await tx
        .update(schema.tenants)
        .set({ settings: newSettings, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));

      return merged;
    });
  }

  // ─── Notifications ──────────────────────────────────────────────────

  async getNotificationSettings(
    tenantId: string,
    userId: string,
    role: AppRole,
  ): Promise<NotificationSettings> {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return extractNotificationSettings(rows[0]?.settings);
    });
  }

  async updateNotificationSettings(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: Partial<NotificationSettings>,
  ): Promise<NotificationSettings> {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const current = (rows[0]?.settings as Record<string, unknown> | null) ?? {};
      const currentSettings = extractNotificationSettings(current);
      const merged = NotificationSettingsSchema.parse({ ...currentSettings, ...input });
      const newSettings = { ...current, notifications: merged };

      await tx
        .update(schema.tenants)
        .set({ settings: newSettings, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));

      return merged;
    });
  }

  // ─── Loyalty (sprint 10.8) ──────────────────────────────────────────

  async getLoyaltySettings(
    tenantId: string,
    userId: string,
    role: AppRole,
  ): Promise<LoyaltySettings> {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return extractLoyaltySettings(rows[0]?.settings);
    });
  }

  async updateLoyaltySettings(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: Partial<LoyaltySettings>,
  ): Promise<LoyaltySettings> {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const current = (rows[0]?.settings as Record<string, unknown> | null) ?? {};
      const merged = LoyaltySettingsSchema.parse({ ...extractLoyaltySettings(current), ...input });
      const newSettings = { ...current, loyalty: merged };
      await tx
        .update(schema.tenants)
        .set({ settings: newSettings, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));
      return merged;
    });
  }
}

export { DEFAULT_BOOKING_RULES, DEFAULT_NOTIFICATION_SETTINGS };
