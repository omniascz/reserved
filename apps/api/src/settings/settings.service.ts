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
  MeetingSettingsSchema,
  NotificationSettingsSchema,
  extractBookingRules,
  extractLoyaltySettings,
  extractMeetingSettings,
  extractNotificationSettings,
  type BookingRules,
  type LoyaltySettings,
  type MeetingSettings,
  type NotificationSettings,
} from './settings.types.js';
import {
  CancellationPolicySchema,
  DEFAULT_CANCELLATION_POLICY,
  resolveCancellationPolicy,
  type CancellationPolicy,
} from './cancellation-policy.js';

/** Páčky storno politiky (mimo `preset`) — pro auto-přepnutí na `custom`. */
const CANCELLATION_KNOB_KEYS = [
  'freeCancelHours',
  'lateCancel',
  'makeupValidDays',
  'noShow',
  'rolloverEnabled',
  'rolloverMax',
  'rolloverUnlimited',
  'rolloverExtendDays',
] as const;

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

  // ─── Storno & bonus politika ────────────────────────────────────────

  async getCancellationPolicy(
    tenantId: string,
    userId: string,
    role: AppRole,
  ): Promise<CancellationPolicy> {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const raw = (rows[0]?.settings as Record<string, unknown> | null)?.cancellationPolicy;
      return resolveCancellationPolicy(raw ?? DEFAULT_CANCELLATION_POLICY);
    });
  }

  async updateCancellationPolicy(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: Partial<CancellationPolicy>,
  ): Promise<CancellationPolicy> {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const current = (rows[0]?.settings as Record<string, unknown> | null) ?? {};
      const storedRaw = current.cancellationPolicy;
      const base = CancellationPolicySchema.safeParse(storedRaw);
      const baseline = base.success ? base.data : DEFAULT_CANCELLATION_POLICY;

      const merged: Record<string, unknown> = { ...baseline, ...input };
      // Doladění páčky bez explicitního presetu = přechod na `custom`
      // (jinak by resolve páčku ignoroval ve prospěch hodnot presetu).
      const touchedKnob = CANCELLATION_KNOB_KEYS.some((k) => k in input);
      if (touchedKnob && input.preset === undefined) {
        merged.preset = 'custom';
      }

      const parsed = CancellationPolicySchema.parse(merged);
      const newSettings = { ...current, cancellationPolicy: parsed };

      await tx
        .update(schema.tenants)
        .set({ settings: newSettings, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));

      // Vrať EFEKTIVNÍ politiku (preset → hodnoty presetu).
      return resolveCancellationPolicy(parsed);
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

  async getMeetingSettings(
    tenantId: string,
    userId: string,
    role: AppRole,
  ): Promise<MeetingSettings> {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return extractMeetingSettings(rows[0]?.settings);
    });
  }

  async updateMeetingSettings(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: Partial<MeetingSettings>,
  ): Promise<MeetingSettings> {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const current = (rows[0]?.settings as Record<string, unknown> | null) ?? {};
      const merged = MeetingSettingsSchema.parse({ ...extractMeetingSettings(current), ...input });
      const newSettings = { ...current, meeting: merged };
      await tx
        .update(schema.tenants)
        .set({ settings: newSettings, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));
      return merged;
    });
  }
}

export { DEFAULT_BOOKING_RULES, DEFAULT_NOTIFICATION_SETTINGS };
