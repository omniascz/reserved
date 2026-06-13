// SmartService — proaktivní automatizace (sprint 10.13).
//
// Posouvá rules engine z reaktivního na proaktivní. Staví na existujícím
// no-show skórování (NoShowRiskService):
//   1. Výzva k potvrzení účasti (magic-link confirm/decline) — hlavně u
//      rizikových klientů. Klient odmítne / nepotvrdí → místo se uvolní
//      (a u skupinové lekce naskočí první z pořadníku).
//   2. Optimal-send-time — výzva/připomínka se naplánuje na hodinu, kdy klient
//      podle historie nejčastěji rezervuje (proxy "kdy je nejspíš online").
//   3. Hromadná proaktivní výzva pro nadcházející rizikové rezervace.
//   4. Sweep — nepotvrzené výzvy po X hodinách → uvolnění míst (overbooking
//      pojistka před no-show).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gt, gte, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext, serviceContext } from '@reserved/rls-multitenancy';
import type { Database } from '../db/db.service.js';
import { DbService } from '../db/db.service.js';
import { NoShowRiskService, type RiskLevel } from '../customers/no-show-risk.service.js';
import { ClassSessionsService } from '../class-sessions/class-sessions.service.js';
import { TimePacksService } from '../time-packs/time-packs.service.js';
import { BundlePacksService } from '../bundle-packs/bundle-packs.service.js';
import { CreditPacksService } from '../credit-packs/credit-packs.service.js';
import type { RequestConfirmationsDto, SweepUnconfirmedDto } from './dto/smart.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'employee', 'receptionist'];
const ACTIVE_STATUSES = ['pending', 'confirmed'] as const;
const LEVEL_RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
const DEFAULT_SEND_HOUR = 18; // 18:00 UTC — rozumný default pro v1.
const HISTORY_WINDOW = 10;

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

type HistoryRow = { status: string; createdAt: Date };

@Injectable()
export class SmartService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(NoShowRiskService) private readonly noShowRisk: NoShowRiskService,
    @Inject(ClassSessionsService) private readonly classSessions: ClassSessionsService,
    @Inject(TimePacksService) private readonly timePacks: TimePacksService,
    @Inject(BundlePacksService) private readonly bundlePacks: BundlePacksService,
    @Inject(CreditPacksService) private readonly creditPacks: CreditPacksService,
  ) {}

  // ─── Optimal-send-time ───────────────────────────────────────────────

  /** Z historie rezervací zákazníka odvodí preferovanou hodinu (mód getUTCHours). */
  optimalSendHour(history: HistoryRow[]): number {
    if (history.length === 0) return DEFAULT_SEND_HOUR;
    const counts = new Map<number, number>();
    for (const row of history) {
      const h = row.createdAt.getUTCHours();
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    let bestHour = DEFAULT_SEND_HOUR;
    let bestCount = -1;
    for (const [hour, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestHour = hour;
      }
    }
    return bestHour;
  }

  /** Nejbližší budoucí čas v dané hodině (UTC). Alespoň 1 min dopředu. */
  private nextOccurrenceOfHour(hour: number, from: Date): Date {
    const target = new Date(from);
    target.setUTCHours(hour, 0, 0, 0);
    if (target.getTime() <= from.getTime() + 60_000) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    return target;
  }

  private async loadCustomerHistory(
    tx: Database,
    customerId: string | null,
  ): Promise<HistoryRow[]> {
    if (!customerId) return [];
    const rows = await tx
      .select({ status: schema.bookings.status, createdAt: schema.bookings.createdAt })
      .from(schema.bookings)
      .where(eq(schema.bookings.customerId, customerId))
      .orderBy(desc(schema.bookings.startsAt))
      .limit(HISTORY_WINDOW);
    return rows;
  }

  // ─── Výzva k potvrzení (jednotlivá) ──────────────────────────────────

  async requestConfirmation(
    tenantId: string,
    userId: string,
    role: AppRole,
    bookingId: string,
    channel: 'email' | 'sms',
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [booking] = await tx
        .select()
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenantId, tenantId)))
        .limit(1);
      if (!booking) {
        throw new NotFoundException({
          error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
        });
      }
      if (!(ACTIVE_STATUSES as readonly string[]).includes(booking.status)) {
        throw new BadRequestException({
          error: {
            code: 'BOOKING_NOT_ACTIVE',
            message: 'Potvrzení lze vyžádat jen u aktivní rezervace.',
          },
        });
      }
      if (booking.confirmationStatus === 'confirmed') {
        throw new BadRequestException({
          error: { code: 'ALREADY_CONFIRMED', message: 'Rezervace už je potvrzená.' },
        });
      }

      const history = await this.loadCustomerHistory(tx, booking.customerId);
      const sendAt = this.nextOccurrenceOfHour(this.optimalSendHour(history), new Date());
      const token = await this.markRequested(tx, tenantId, bookingId);
      await this.enqueueConfirmation(tx, tenantId, booking, token, channel, sendAt);

      return { bookingId, confirmationToken: token, scheduledAt: sendAt, channel };
    });
  }

  /** Hromadná proaktivní výzva pro nadcházející rizikové rezervace. */
  async requestForUpcoming(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: RequestConfirmationsDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const now = new Date();
      const until = new Date(now.getTime() + dto.withinHours * 3_600_000);
      const candidates = await tx
        .select()
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.tenantId, tenantId),
            eq(schema.bookings.confirmationStatus, 'none'),
            gte(schema.bookings.startsAt, now),
            lte(schema.bookings.startsAt, until),
            sql`${schema.bookings.status} IN ('pending', 'confirmed')`,
            sql`${schema.bookings.customerId} IS NOT NULL`,
          ),
        );

      let requested = 0;
      for (const booking of candidates) {
        const history = await this.loadCustomerHistory(tx, booking.customerId);
        const risk = this.noShowRisk.scoreFromHistory(history);
        if (LEVEL_RANK[risk.level] < LEVEL_RANK[dto.minLevel]) continue;

        const sendAt = this.nextOccurrenceOfHour(this.optimalSendHour(history), now);
        const token = await this.markRequested(tx, tenantId, booking.id);
        await this.enqueueConfirmation(tx, tenantId, booking, token, dto.channel, sendAt);
        requested++;
      }
      return { requested, scanned: candidates.length };
    });
  }

  /** Nadcházející rezervace s rizikem (medium+) — přehled pro admina. */
  async listAtRisk(tenantId: string, userId: string, role: AppRole, withinHours: number) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const now = new Date();
      const until = new Date(now.getTime() + withinHours * 3_600_000);
      const upcoming = await tx
        .select({
          id: schema.bookings.id,
          customerId: schema.bookings.customerId,
          customerName: schema.bookings.customerName,
          startsAt: schema.bookings.startsAt,
          confirmationStatus: schema.bookings.confirmationStatus,
        })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.tenantId, tenantId),
            gte(schema.bookings.startsAt, now),
            lte(schema.bookings.startsAt, until),
            sql`${schema.bookings.status} IN ('pending', 'confirmed')`,
          ),
        )
        .orderBy(schema.bookings.startsAt);

      const out: Array<{
        bookingId: string;
        customerName: string;
        startsAt: Date;
        confirmationStatus: string;
        risk: { score: number; level: RiskLevel; reasons: string[] };
      }> = [];
      for (const b of upcoming) {
        const history = await this.loadCustomerHistory(tx, b.customerId);
        const risk = this.noShowRisk.scoreFromHistory(history);
        if (risk.level === 'low') continue;
        out.push({
          bookingId: b.id,
          customerName: b.customerName,
          startsAt: b.startsAt,
          confirmationStatus: b.confirmationStatus,
          risk: { score: risk.score, level: risk.level, reasons: risk.reasons },
        });
      }
      out.sort((a, b) => b.risk.score - a.risk.score);
      return out;
    });
  }

  // ─── Veřejná odpověď klienta ─────────────────────────────────────────

  async respondByToken(tenantId: string, token: string, action: 'confirm' | 'decline') {
    const booking = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [b] = await tx
        .select()
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.tenantId, tenantId),
            eq(schema.bookings.confirmationToken, token),
            eq(schema.bookings.confirmationStatus, 'requested'),
          ),
        )
        .limit(1);
      if (!b) return null;

      await tx
        .update(schema.bookings)
        .set({
          confirmationStatus: action === 'confirm' ? 'confirmed' : 'declined',
          confirmationRespondedAt: new Date(),
          confirmationToken: null, // token je jednorázový
          updatedAt: new Date(),
        })
        .where(eq(schema.bookings.id, b.id));

      await tx.insert(schema.bookingStatusHistory).values({
        tenantId,
        bookingId: b.id,
        fromStatus: b.status,
        toStatus: b.status, // stav rezervace zatím beze změny (uvolnění řešíme níže)
        changedBy: 'customer',
        reason: action === 'confirm' ? 'smart_confirmed' : 'smart_declined',
        metadata: { kind: 'smart_confirmation', action },
      });
      return b;
    });

    if (!booking) {
      throw new NotFoundException({
        error: {
          code: 'INVALID_OR_USED_TOKEN',
          message: 'Odkaz pro potvrzení je neplatný nebo už byl použit.',
        },
      });
    }

    if (action === 'confirm') {
      return { status: 'confirmed' as const, freedSpot: false };
    }

    // Odmítnutí → uvolni místo (po commitu, vlastní transakce).
    await this.freeSpot(tenantId, booking, 'smart_declined');
    return { status: 'declined' as const, freedSpot: true };
  }

  // ─── Sweep nepotvrzených ─────────────────────────────────────────────

  async sweepUnconfirmed(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: SweepUnconfirmedDto,
  ) {
    assertCanManage(role);
    const now = new Date();
    const cutoff = new Date(now.getTime() - dto.olderThanHours * 3_600_000);

    const toFree = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const rows = await tx
          .select()
          .from(schema.bookings)
          .where(
            and(
              eq(schema.bookings.tenantId, tenantId),
              eq(schema.bookings.confirmationStatus, 'requested'),
              lte(schema.bookings.confirmationRequestedAt, cutoff),
              gt(schema.bookings.startsAt, now),
              sql`${schema.bookings.status} IN ('pending', 'confirmed')`,
            ),
          );
        if (rows.length > 0) {
          await tx
            .update(schema.bookings)
            .set({ confirmationStatus: 'declined', confirmationRespondedAt: now, updatedAt: now })
            .where(
              and(
                eq(schema.bookings.tenantId, tenantId),
                sql`${schema.bookings.id} IN (${sql.join(
                  rows.map((r) => sql`${r.id}`),
                  sql`, `,
                )})`,
              ),
            );
        }
        return rows;
      },
    );

    for (const booking of toFree) {
      await this.freeSpot(tenantId, booking, 'smart_unconfirmed_sweep');
    }
    return { freed: toFree.length };
  }

  // ─── Pomocné ─────────────────────────────────────────────────────────

  private async markRequested(tx: Database, tenantId: string, bookingId: string): Promise<string> {
    const token = randomUUID();
    await tx
      .update(schema.bookings)
      .set({
        confirmationStatus: 'requested',
        confirmationToken: token,
        confirmationRequestedAt: new Date(),
        confirmationRespondedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenantId, tenantId)));
    return token;
  }

  private async enqueueConfirmation(
    tx: Database,
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
    token: string,
    channel: 'email' | 'sms',
    sendAt: Date,
  ): Promise<void> {
    const recipient = channel === 'sms' ? booking.customerPhone : booking.customerEmail;
    if (!recipient) return; // bez kontaktu nelze poslat — výzva zůstane „requested"
    const confirmPath = `/confirm/${token}`;
    const body =
      channel === 'sms'
        ? `Potvrďte prosím účast na rezervaci ${booking.referenceCode}. Potvrdit: ${confirmPath}`
        : `Dobrý den,\n\npotvrďte prosím svou účast na rezervaci ${booking.referenceCode}.\n` +
          `Potvrdit účast: ${confirmPath}\n\nDěkujeme.`;
    await tx.insert(schema.notifications).values({
      tenantId,
      channel,
      templateCode: 'booking_confirmation',
      recipient,
      subject: channel === 'email' ? 'Potvrďte prosím svou účast' : null,
      body,
      relatedBookingId: booking.id,
      status: 'pending',
      scheduledAt: sendAt,
      metadata: { kind: 'smart_confirmation', confirmationToken: token },
    });
  }

  /** Uvolní místo po odmítnutí/nepotvrzení. Deleguje na správnou logiku. */
  private async freeSpot(
    tenantId: string,
    booking: typeof schema.bookings.$inferSelect,
    reason: string,
  ): Promise<void> {
    if (booking.sessionId) {
      await this.classSessions.leaveSystem(tenantId, booking.sessionId, booking.id, reason);
      return;
    }
    // 1:1 rezervace — zruš a vrať případnou permanentku.
    const cancelled = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [updated] = await tx
        .update(schema.bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.bookings.id, booking.id),
            eq(schema.bookings.tenantId, tenantId),
            sql`${schema.bookings.status} IN ('pending', 'confirmed')`,
          ),
        )
        .returning({ id: schema.bookings.id });
      if (!updated) return null;
      await tx.insert(schema.bookingStatusHistory).values({
        tenantId,
        bookingId: booking.id,
        fromStatus: booking.status,
        toStatus: 'cancelled',
        changedBy: 'system',
        reason,
      });
      return updated;
    });
    if (!cancelled) return;
    await this.refundPacks(tenantId, booking.id);
  }

  private async refundPacks(tenantId: string, bookingId: string): Promise<void> {
    try {
      await this.timePacks.refundForBooking({ tenantId, bookingId, performedBy: null });
    } catch {
      // ignoruj
    }
    try {
      await this.bundlePacks.refundForBooking({ tenantId, bookingId, performedBy: null });
    } catch {
      // ignoruj
    }
    try {
      await this.creditPacks.refundForBooking({ tenantId, bookingId, performedBy: null });
    } catch {
      // ignoruj
    }
  }
}
