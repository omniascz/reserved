// Sprint 8.1 — tenant theme settings pro widget.
//
// Theme je jsonb sloupec na tenants tabulce. Tato service ho cte a updatuje.
// Widget cte theme pres GET /public/:slug.

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

export type BorderRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type FontFamily = 'system' | 'serif' | 'sans';

export interface TenantTheme {
  primaryColor?: string | null;
  borderRadius?: BorderRadius | null;
  logoUrl?: string | null;
  fontFamily?: FontFamily | null;
  /** Barva pozadí widgetu — hex #RRGGBB. */
  backgroundColor?: string | null;
  /** Volitelné custom CSS, vložené do <style> ve widgetu. Max 10 kB. */
  customCss?: string | null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const VALID_RADIUS: BorderRadius[] = ['none', 'sm', 'md', 'lg', 'xl'];
const VALID_FONT: FontFamily[] = ['system', 'serif', 'sans'];

@Injectable()
export class ThemeService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async get(tenantId: string): Promise<TenantTheme> {
    const rows = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({ theme: schema.tenants.theme })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
    });
    if (!rows[0]) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
      });
    }
    return (rows[0].theme ?? {}) as TenantTheme;
  }

  async update(tenantId: string, patch: TenantTheme): Promise<TenantTheme> {
    // Validace
    if (patch.primaryColor !== undefined && patch.primaryColor !== null) {
      if (!HEX_COLOR.test(patch.primaryColor)) {
        throw new BadRequestException({
          error: { code: 'INVALID_COLOR', message: 'Barva musí být ve formátu #RRGGBB.' },
        });
      }
    }
    if (
      patch.borderRadius !== undefined &&
      patch.borderRadius !== null &&
      !VALID_RADIUS.includes(patch.borderRadius)
    ) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_RADIUS',
          message: `borderRadius musí být jedno z: ${VALID_RADIUS.join(', ')}.`,
        },
      });
    }
    if (
      patch.fontFamily !== undefined &&
      patch.fontFamily !== null &&
      !VALID_FONT.includes(patch.fontFamily)
    ) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_FONT',
          message: `fontFamily musí být jedno z: ${VALID_FONT.join(', ')}.`,
        },
      });
    }
    if (patch.logoUrl !== undefined && patch.logoUrl !== null && patch.logoUrl.length > 2000) {
      throw new BadRequestException({
        error: { code: 'LOGO_URL_TOO_LONG', message: 'Logo URL je moc dlouhé.' },
      });
    }
    if (
      patch.backgroundColor !== undefined &&
      patch.backgroundColor !== null &&
      !HEX_COLOR.test(patch.backgroundColor)
    ) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_BACKGROUND_COLOR',
          message: 'Barva pozadí musí být ve formátu #RRGGBB.',
        },
      });
    }
    if (patch.customCss !== undefined && patch.customCss !== null) {
      if (patch.customCss.length > 10_000) {
        throw new BadRequestException({
          error: { code: 'CUSTOM_CSS_TOO_LONG', message: 'Custom CSS max 10 000 znaků.' },
        });
      }
      // Bezpecnostni sanitizace: blokuje <script>, javascript:, @import, expression()
      const lower = patch.customCss.toLowerCase();
      const blockedPatterns = ['<script', 'javascript:', '@import', 'expression(', 'behavior:'];
      for (const pattern of blockedPatterns) {
        if (lower.includes(pattern)) {
          throw new BadRequestException({
            error: {
              code: 'CUSTOM_CSS_UNSAFE',
              message: `Custom CSS nesmí obsahovat: ${pattern}`,
            },
          });
        }
      }
    }

    const current = await this.get(tenantId);
    // Merge — undefined fields zachovají existující hodnotu; null je explicitní reset.
    const next: TenantTheme = { ...current };
    for (const key of [
      'primaryColor',
      'borderRadius',
      'logoUrl',
      'fontFamily',
      'backgroundColor',
      'customCss',
    ] as const) {
      if (key in patch) {
        const value = patch[key];
        if (value === null) {
          delete next[key];
        } else if (value !== undefined) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (next as any)[key] = value;
        }
      }
    }

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.tenants)
        .set({ theme: next, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));
    });

    return next;
  }
}
