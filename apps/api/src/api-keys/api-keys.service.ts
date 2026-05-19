// ApiKeysService — správa API klíčů pro tenant business integrace.
//
// Klíč má formát "rsk_<32 hex>" (Reserved Secret Key, 32 znaků = 128 bitů
// entropie z crypto.randomBytes(16)). V DB ukládáme SHA-256 hash + prefix
// (pro UI identifikaci bez zveřejnění tajemství).

import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { schema, type ApiKeyScope, API_KEY_SCOPES } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

const PREFIX = 'rsk_';

export interface CreateKeyDto {
  name: string;
  scopes?: ApiKeyScope[];
  expiresAt?: Date | null;
}

export interface ApiKeyView {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  lastUsedAt: Date | null;
  usageCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedKey extends ApiKeyView {
  /** PLNÝ KLÍČ — vrátí se pouze pri create, nikdy víc. */
  rawKey: string;
}

export function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function isValidScopeList(scopes: unknown): scopes is ApiKeyScope[] {
  if (!Array.isArray(scopes)) return false;
  return scopes.every(
    (s) => s === '*' || (API_KEY_SCOPES as readonly string[]).includes(s as string),
  );
}

@Injectable()
export class ApiKeysService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(tenantId: string, userId: string, dto: CreateKeyDto): Promise<CreatedKey> {
    if (!dto.name || dto.name.length < 3) {
      throw new BadRequestException({
        error: { code: 'INVALID_NAME', message: 'Nazev klice musi mit min. 3 znaky.' },
      });
    }
    const scopes = dto.scopes && dto.scopes.length > 0 ? dto.scopes : (['*'] as ApiKeyScope[]);

    // Generuj 32-hex (128 bitu entropie)
    const rawSuffix = randomBytes(16).toString('hex');
    const rawKey = `${PREFIX}${rawSuffix}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = `${PREFIX}${rawSuffix.slice(0, 8)}`;

    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [row] = await tx
        .insert(schema.apiKeys)
        .values({
          tenantId,
          name: dto.name,
          keyHash,
          keyPrefix,
          scopes,
          expiresAt: dto.expiresAt ?? null,
          createdBy: userId,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to insert api key.');
      }

      return {
        id: row.id,
        name: row.name,
        keyPrefix: row.keyPrefix,
        scopes: row.scopes as ApiKeyScope[],
        lastUsedAt: row.lastUsedAt,
        usageCount: row.usageCount,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        createdAt: row.createdAt,
        rawKey,
      };
    });
  }

  async list(tenantId: string): Promise<ApiKeyView[]> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const rows = await tx
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.tenantId, tenantId))
        .orderBy(desc(schema.apiKeys.createdAt));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        keyPrefix: r.keyPrefix,
        scopes: r.scopes as ApiKeyScope[],
        lastUsedAt: r.lastUsedAt,
        usageCount: r.usageCount,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
      }));
    });
  }

  async revoke(tenantId: string, id: string): Promise<void> {
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [existing] = await tx
        .select({ id: schema.apiKeys.id, revokedAt: schema.apiKeys.revokedAt })
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        throw new NotFoundException({
          error: { code: 'NOT_FOUND', message: 'Klic neexistuje.' },
        });
      }
      if (existing.revokedAt) {
        throw new BadRequestException({
          error: { code: 'ALREADY_REVOKED', message: 'Klic je jiz zneplatneny.' },
        });
      }
      await tx
        .update(schema.apiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.apiKeys.id, id));
    });
  }

  /**
   * Najde klíč podle plné string verze. Použito v ApiKeyGuard.
   * Současně bumpne `lastUsedAt` a `usageCount` (best-effort, non-atomic).
   */
  async findValidByRawKey(rawKey: string): Promise<{
    id: string;
    tenantId: string;
    scopes: ApiKeyScope[];
  } | null> {
    if (!rawKey.startsWith(PREFIX)) return null;
    const keyHash = hashKey(rawKey);

    // Tahle query musí proběhnout v service kontextu (jinak RLS odfiltruje
    // všechny tenanty).
    const result = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [row] = await tx
        .select({
          id: schema.apiKeys.id,
          tenantId: schema.apiKeys.tenantId,
          scopes: schema.apiKeys.scopes,
          expiresAt: schema.apiKeys.expiresAt,
          revokedAt: schema.apiKeys.revokedAt,
        })
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyHash, keyHash))
        .limit(1);
      if (!row) return null;
      if (row.revokedAt) return null;
      if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

      // Best-effort usage bump (atomic increment)
      await tx
        .update(schema.apiKeys)
        .set({
          lastUsedAt: new Date(),
          usageCount: sql`${schema.apiKeys.usageCount} + 1`,
        })
        .where(eq(schema.apiKeys.id, row.id));

      return {
        id: row.id,
        tenantId: row.tenantId,
        scopes: row.scopes as ApiKeyScope[],
      };
    });

    return result;
  }
}
