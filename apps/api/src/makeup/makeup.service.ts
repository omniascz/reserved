// MakeupService — náhrady za zameškané lekce (sprint 10.40).
// Vznikají: (a) automaticky když studio zruší lekci, (b) ručně adminem.
// Klient si pak může náhradou zdarma rezervovat jinou lekci.

import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
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

@Injectable()
export class MakeupService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Vydá náhradu (admin). validDays = za kolik dní vyprší (default 60). */
  async issue(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: {
      customerEmail: string;
      customerName: string;
      customerId?: string | null;
      reason?: 'studio_cancelled' | 'client_cancelled' | 'admin_granted';
      originBookingId?: string | null;
      validDays?: number;
    },
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const validUntil = new Date(Date.now() + (dto.validDays ?? 60) * 86400_000);
      const [row] = await tx
        .insert(schema.makeupCredits)
        .values({
          tenantId,
          customerId: dto.customerId ?? null,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          reason: dto.reason ?? 'admin_granted',
          originBookingId: dto.originBookingId ?? null,
          validUntil,
        })
        .returning();
      return row!;
    });
  }

  /**
   * Automatické vydání náhrad účastníkům zrušené lekce. Volá se ze studio-cancel
   * (chyba je na straně studia) se SEZNAMEM účastníků zachyceným PŘED zrušením.
   * Běží v předané transakci.
   */
  async issueForParticipants(
    tx: Database,
    tenantId: string,
    participants: Array<{
      id: string;
      customerId: string | null;
      customerName: string;
      customerEmail: string;
    }>,
  ): Promise<number> {
    if (participants.length === 0) return 0;
    const validUntil = new Date(Date.now() + 60 * 86400_000);
    await tx.insert(schema.makeupCredits).values(
      participants.map((p) => ({
        tenantId,
        customerId: p.customerId,
        customerName: p.customerName,
        customerEmail: p.customerEmail,
        reason: 'studio_cancelled' as const,
        originBookingId: p.id,
        validUntil,
      })),
    );
    return participants.length;
  }

  /**
   * Vydá náhradu při zrušení/no-show podle storno politiky (volá portál/admin
   * po commitu zrušení). Bez role-gate (serviceContext) — důvod 'client_cancelled'.
   */
  async issueForCancel(
    tenantId: string,
    dto: {
      customerEmail: string;
      customerName: string;
      customerId?: string | null;
      originBookingId?: string | null;
      validDays: number;
    },
  ) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const validUntil = new Date(Date.now() + dto.validDays * 86400_000);
      const [row] = await tx
        .insert(schema.makeupCredits)
        .values({
          tenantId,
          customerId: dto.customerId ?? null,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          reason: 'client_cancelled',
          originBookingId: dto.originBookingId ?? null,
          validUntil,
        })
        .returning();
      return row!;
    });
  }

  /** Dostupné náhrady zákazníka (dle e-mailu). */
  async listForCustomer(tenantId: string, customerEmail: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select()
        .from(schema.makeupCredits)
        .where(
          and(
            eq(schema.makeupCredits.tenantId, tenantId),
            sql`lower(${schema.makeupCredits.customerEmail}) = lower(${customerEmail})`,
            eq(schema.makeupCredits.status, 'available'),
          ),
        )
        .orderBy(schema.makeupCredits.validUntil);
    });
  }

  async listAdmin(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.makeupCredits)
        .where(eq(schema.makeupCredits.tenantId, tenantId))
        .orderBy(desc(schema.makeupCredits.createdAt))
        .limit(500);
    });
  }

  /**
   * Najde a spotřebuje dostupnou náhradu zákazníka (FIFO dle expirace).
   * Vrací true pokud spotřebována. Běží v předané transakci (z join flow).
   */
  async consumeForBooking(
    tx: Database,
    tenantId: string,
    customerEmail: string,
    bookingId: string,
  ): Promise<boolean> {
    const [credit] = await tx
      .select({ id: schema.makeupCredits.id })
      .from(schema.makeupCredits)
      .where(
        and(
          eq(schema.makeupCredits.tenantId, tenantId),
          sql`lower(${schema.makeupCredits.customerEmail}) = lower(${customerEmail})`,
          eq(schema.makeupCredits.status, 'available'),
          sql`(${schema.makeupCredits.validUntil} IS NULL OR ${schema.makeupCredits.validUntil} > now())`,
        ),
      )
      .orderBy(schema.makeupCredits.validUntil)
      .limit(1)
      .for('update');
    if (!credit) return false;
    await tx
      .update(schema.makeupCredits)
      .set({ status: 'used', usedBookingId: bookingId, usedAt: new Date() })
      .where(eq(schema.makeupCredits.id, credit.id));
    return true;
  }
}
