// AccessService — vstup bez personálu (sprint 10.32).
//
// Vydá vstupní KÓD ke slotu (rezervaci) nebo členství/permanentce (open gym) a
// ověří ho při pokusu o vstup (zámek/turniket přes external API access:validate).
// Každý pokus se loguje do access_events.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService, type Database } from '../db/db.service.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
    });
  }
}

export type ValidateResult =
  | {
      granted: true;
      grantId: string;
      kind: string;
      customerName: string | null;
      usesRemaining: number | null;
    }
  | {
      granted: false;
      reason: 'not_found' | 'revoked' | 'not_yet_valid' | 'expired' | 'used_up' | 'wrong_branch';
    };

@Injectable()
export class AccessService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** 6místný numerický kód, unikátní v rámci tenanta (retry na kolizi). */
  private async generateUniqueCode(tx: Database, tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = String(randomInt(100000, 1000000));
      const existing = await tx
        .select({ id: schema.accessGrants.id })
        .from(schema.accessGrants)
        .where(and(eq(schema.accessGrants.tenantId, tenantId), eq(schema.accessGrants.code, code)))
        .limit(1);
      if (existing.length === 0) return code;
    }
    // Fallback — delší kód při smůle.
    return String(randomInt(10000000, 100000000));
  }

  /** Vydá kód ke konkrétní rezervaci (slot). Platí v okně rezervace ± buffer. */
  async issueForBooking(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: { bookingId: string; bufferMinutes?: number; maxUses?: number },
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [b] = await tx
        .select({
          id: schema.bookings.id,
          branchId: schema.bookings.branchId,
          customerId: schema.bookings.customerId,
          customerName: schema.bookings.customerName,
          startsAt: schema.bookings.startsAt,
          endsAt: schema.bookings.endsAt,
        })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, input.bookingId), eq(schema.bookings.tenantId, tenantId)))
        .limit(1);
      if (!b) {
        throw new NotFoundException({
          error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
        });
      }
      const buffer = (input.bufferMinutes ?? 15) * 60_000;
      const validFrom = new Date(b.startsAt.getTime() - buffer);
      const validUntil = new Date(b.endsAt.getTime() + buffer);
      const code = await this.generateUniqueCode(tx, tenantId);

      const [grant] = await tx
        .insert(schema.accessGrants)
        .values({
          tenantId,
          branchId: b.branchId,
          bookingId: b.id,
          customerId: b.customerId,
          customerName: b.customerName,
          code,
          kind: 'booking',
          validFrom,
          validUntil,
          maxUses: input.maxUses ?? 1,
        })
        .returning();
      return grant!;
    });
  }

  /**
   * Vydá kód pro open gym / členství / permanentku — platí v zadaném období,
   * volitelně víc vstupů (maxUses=0 = neomezeně v rámci platnosti).
   */
  async issueGeneral(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: {
      customerId?: string | null;
      customerName?: string | null;
      branchId?: string | null;
      validFrom: string;
      validUntil: string;
      maxUses?: number;
      kind?: 'membership' | 'open_gym';
    },
  ) {
    assertCanManage(role);
    const from = new Date(input.validFrom);
    const until = new Date(input.validUntil);
    if (!(until > from)) {
      throw new BadRequestException({
        error: { code: 'INVALID_RANGE', message: 'valid_until musí být po valid_from.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const code = await this.generateUniqueCode(tx, tenantId);
      const [grant] = await tx
        .insert(schema.accessGrants)
        .values({
          tenantId,
          branchId: input.branchId ?? null,
          customerId: input.customerId ?? null,
          customerName: input.customerName ?? null,
          code,
          kind: input.kind ?? 'membership',
          validFrom: from,
          validUntil: until,
          maxUses: input.maxUses ?? 0,
        })
        .returning();
      return grant!;
    });
  }

  async list(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.accessGrants)
        .where(eq(schema.accessGrants.tenantId, tenantId))
        .orderBy(desc(schema.accessGrants.createdAt))
        .limit(200);
    });
  }

  async revoke(tenantId: string, userId: string, role: AppRole, grantId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .update(schema.accessGrants)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(and(eq(schema.accessGrants.id, grantId), eq(schema.accessGrants.tenantId, tenantId)))
        .returning({ id: schema.accessGrants.id });
      if (!row) {
        throw new NotFoundException({
          error: { code: 'GRANT_NOT_FOUND', message: 'Kód nenalezen.' },
        });
      }
      return { id: row.id, status: 'revoked' as const };
    });
  }

  /**
   * Ověří kód při pokusu o vstup. Volá zámek/turniket přes external API.
   * Běží v service kontextu (volá ho API klíč zařízení), tenantId z API klíče.
   * Při úspěchu inkrementuje uses_count a loguje granted; jinak loguje denied.
   */
  async validate(
    tenantId: string,
    input: { code: string; branchId?: string | null },
  ): Promise<ValidateResult> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const log = async (
        result: 'granted' | 'denied',
        reason: string | null,
        grantId: string | null,
      ) => {
        await tx.insert(schema.accessEvents).values({
          tenantId,
          grantId,
          code: input.code,
          branchId: input.branchId ?? null,
          result,
          reason,
        });
      };

      const [grant] = await tx
        .select()
        .from(schema.accessGrants)
        .where(
          and(eq(schema.accessGrants.tenantId, tenantId), eq(schema.accessGrants.code, input.code)),
        )
        .limit(1);

      if (!grant) {
        await log('denied', 'not_found', null);
        return { granted: false, reason: 'not_found' };
      }
      if (grant.status === 'revoked') {
        await log('denied', 'revoked', grant.id);
        return { granted: false, reason: 'revoked' };
      }
      const now = new Date();
      if (now < grant.validFrom) {
        await log('denied', 'not_yet_valid', grant.id);
        return { granted: false, reason: 'not_yet_valid' };
      }
      if (now > grant.validUntil) {
        await log('denied', 'expired', grant.id);
        return { granted: false, reason: 'expired' };
      }
      // maxUses 0 = neomezeně; jinak hlídej limit.
      if (grant.maxUses > 0 && grant.usesCount >= grant.maxUses) {
        await log('denied', 'used_up', grant.id);
        return { granted: false, reason: 'used_up' };
      }
      // Pokud má grant pobočku a zařízení hlásí jinou — odmítni.
      if (grant.branchId && input.branchId && grant.branchId !== input.branchId) {
        await log('denied', 'wrong_branch', grant.id);
        return { granted: false, reason: 'wrong_branch' };
      }

      const newUses = grant.usesCount + 1;
      const reachedLimit = grant.maxUses > 0 && newUses >= grant.maxUses;
      await tx
        .update(schema.accessGrants)
        .set({
          usesCount: newUses,
          status: reachedLimit ? 'used' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.accessGrants.id, grant.id));

      await log('granted', null, grant.id);
      return {
        granted: true,
        grantId: grant.id,
        kind: grant.kind,
        customerName: grant.customerName,
        usesRemaining: grant.maxUses > 0 ? grant.maxUses - newUses : null,
      };
    });
  }
}
