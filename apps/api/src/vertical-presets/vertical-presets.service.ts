// VerticalPresetsService — one-click setup oboru (sprint 10.11).

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { resolveCapacity } from '../services/archetypes.js';
import { BookingRulesSchema, extractBookingRules } from '../settings/settings.types.js';
import {
  VERTICAL_PRESETS,
  listVerticalPresets,
  verticalPresetIds,
  type VerticalPresetId,
} from './presets.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

@Injectable()
export class VerticalPresetsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  list() {
    return listVerticalPresets();
  }

  async apply(tenantId: string, userId: string, role: AppRole, presetId: string) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: {
          code: 'INSUFFICIENT_ROLE',
          message: 'Pouze owner nebo manager může nastavit obor.',
        },
      });
    }
    if (!verticalPresetIds.includes(presetId as VerticalPresetId)) {
      throw new NotFoundException({
        error: { code: 'PRESET_NOT_FOUND', message: 'Preset oboru nenalezen.' },
      });
    }
    const preset = VERTICAL_PRESETS[presetId as VerticalPresetId];

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const summary = {
        preset: preset.id,
        servicesCreated: 0,
        servicesSkipped: 0,
        resourcesCreated: 0,
        resourcesSkipped: 0,
        formsCreated: 0,
        formsSkipped: 0,
      };

      // Default pobočka (pro zdroje).
      const [branch] = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.tenantId, tenantId))
        .limit(1);
      const branchId = branch?.id ?? null;

      // 1. Služby (skip existující dle názvu).
      for (const s of preset.services) {
        const existing = await tx
          .select({ id: schema.services.id })
          .from(schema.services)
          .where(
            and(
              eq(schema.services.tenantId, tenantId),
              eq(schema.services.name, s.name),
              isNull(schema.services.deletedAt),
            ),
          )
          .limit(1);
        if (existing.length > 0) {
          summary.servicesSkipped++;
          continue;
        }
        await tx.insert(schema.services).values({
          tenantId,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceHellers: s.priceHellers,
          capacity: resolveCapacity(s.archetype, null),
          archetype: s.archetype,
        });
        summary.servicesCreated++;
      }

      // 2. Zdroje / přístroje (skip existující dle názvu).
      if (preset.resources && branchId) {
        for (const r of preset.resources) {
          const existing = await tx
            .select({ id: schema.resources.id })
            .from(schema.resources)
            .where(
              and(
                eq(schema.resources.tenantId, tenantId),
                eq(schema.resources.name, r.name),
                isNull(schema.resources.deletedAt),
              ),
            )
            .limit(1);
          if (existing.length > 0) {
            summary.resourcesSkipped++;
            continue;
          }
          await tx
            .insert(schema.resources)
            .values({ tenantId, branchId, name: r.name, type: r.type });
          summary.resourcesCreated++;
        }
      }

      // 3. Intake formuláře (skip existující dle názvu).
      if (preset.intakeForms) {
        for (const f of preset.intakeForms) {
          const existing = await tx
            .select({ id: schema.intakeForms.id })
            .from(schema.intakeForms)
            .where(
              and(
                eq(schema.intakeForms.tenantId, tenantId),
                eq(schema.intakeForms.name, f.name),
                isNull(schema.intakeForms.deletedAt),
              ),
            )
            .limit(1);
          if (existing.length > 0) {
            summary.formsSkipped++;
            continue;
          }
          await tx.insert(schema.intakeForms).values({ tenantId, name: f.name, fields: f.fields });
          summary.formsCreated++;
        }
      }

      // 4. Booking pravidla (merge do tenant.settings).
      if (preset.bookingRules) {
        const [t] = await tx
          .select({ settings: schema.tenants.settings })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, tenantId))
          .limit(1);
        const current = (t?.settings as Record<string, unknown> | null) ?? {};
        const merged = BookingRulesSchema.parse({
          ...extractBookingRules(current),
          ...preset.bookingRules,
        });
        await tx
          .update(schema.tenants)
          .set({ settings: { ...current, bookingRules: merged }, updatedAt: new Date() })
          .where(eq(schema.tenants.id, tenantId));
      }

      return summary;
    });
  }
}
