// ChallengesService — výzvy + leaderboard (sprint 10.38, retenční engine).
// Postup účastníka se počítá z DOKONČENÝCH rezervací v okně výzvy.
// metric 'attendance' = počet lekcí; 'minutes' = součet délek služeb.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

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
export class ChallengesService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  async create(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: {
      name: string;
      description?: string | null;
      metric: 'attendance' | 'minutes';
      goal?: number;
      startsAt: string;
      endsAt: string;
    },
  ) {
    assertCanManage(role);
    const start = new Date(dto.startsAt);
    const end = new Date(dto.endsAt);
    if (!(end > start)) {
      throw new BadRequestException({
        error: { code: 'INVALID_RANGE', message: 'Konec výzvy musí být po začátku.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.challenges)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          metric: dto.metric,
          goal: dto.goal ?? 0,
          startsAt: start,
          endsAt: end,
        })
        .returning();
      return row!;
    });
  }

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.challenges)
        .where(eq(schema.challenges.tenantId, tenantId))
        .orderBy(desc(schema.challenges.startsAt));
    });
  }

  /** Veřejné: aktivní výzvy (pro widget/portál). */
  async listPublic(tenantId: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          id: schema.challenges.id,
          name: schema.challenges.name,
          description: schema.challenges.description,
          metric: schema.challenges.metric,
          goal: schema.challenges.goal,
          startsAt: schema.challenges.startsAt,
          endsAt: schema.challenges.endsAt,
        })
        .from(schema.challenges)
        .where(
          and(eq(schema.challenges.tenantId, tenantId), eq(schema.challenges.status, 'active')),
        )
        .orderBy(desc(schema.challenges.startsAt));
    });
  }

  /** Zapsání do výzvy (veřejné — klient sám). */
  async enroll(
    tenantId: string,
    challengeId: string,
    input: { customerEmail: string; customerName: string; customerId?: string | null },
  ) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [ch] = await tx
        .select({ id: schema.challenges.id })
        .from(schema.challenges)
        .where(and(eq(schema.challenges.id, challengeId), eq(schema.challenges.tenantId, tenantId)))
        .limit(1);
      if (!ch) {
        throw new NotFoundException({
          error: { code: 'CHALLENGE_NOT_FOUND', message: 'Výzva nenalezena.' },
        });
      }
      try {
        const [row] = await tx
          .insert(schema.challengeParticipants)
          .values({
            tenantId,
            challengeId,
            customerId: input.customerId ?? null,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
          })
          .returning();
        return { enrolled: true as const, participantId: row!.id };
      } catch (err) {
        const e = err as { code?: string; cause?: { code?: string } };
        if ((e.code ?? e.cause?.code) === '23505') {
          return { enrolled: true as const, alreadyEnrolled: true as const };
        }
        throw err;
      }
    });
  }

  /** Leaderboard — žebříček účastníků dle postupu (z dokončených rezervací v okně). */
  async leaderboard(tenantId: string, challengeId: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [ch] = await tx
        .select()
        .from(schema.challenges)
        .where(and(eq(schema.challenges.id, challengeId), eq(schema.challenges.tenantId, tenantId)))
        .limit(1);
      if (!ch) {
        throw new NotFoundException({
          error: { code: 'CHALLENGE_NOT_FOUND', message: 'Výzva nenalezena.' },
        });
      }

      // Postup = počet dokončených lekcí (attendance) nebo součet minut (minutes)
      // pro každého účastníka v okně výzvy, párováno přes e-mail.
      const progressExpr =
        ch.metric === 'minutes'
          ? sql<number>`COALESCE(SUM(${schema.services.durationMinutes}), 0)::int`
          : sql<number>`COUNT(${schema.bookings.id})::int`;

      const rows = await tx
        .select({
          customerName: schema.challengeParticipants.customerName,
          customerEmail: schema.challengeParticipants.customerEmail,
          progress: progressExpr,
        })
        .from(schema.challengeParticipants)
        .leftJoin(
          schema.bookings,
          and(
            eq(schema.bookings.tenantId, schema.challengeParticipants.tenantId),
            sql`lower(${schema.bookings.customerEmail}) = lower(${schema.challengeParticipants.customerEmail})`,
            eq(schema.bookings.status, 'completed'),
            gte(schema.bookings.startsAt, ch.startsAt),
            lte(schema.bookings.startsAt, ch.endsAt),
          ),
        )
        .leftJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
        .where(eq(schema.challengeParticipants.challengeId, challengeId))
        .groupBy(
          schema.challengeParticipants.id,
          schema.challengeParticipants.customerName,
          schema.challengeParticipants.customerEmail,
        );

      // Řazení v JS (alias 'progress' nejde spolehlivě v ORDER BY napříč drivery).
      rows.sort((a, b) => Number(b.progress) - Number(a.progress));

      return {
        challenge: {
          id: ch.id,
          name: ch.name,
          metric: ch.metric,
          goal: ch.goal,
          startsAt: ch.startsAt,
          endsAt: ch.endsAt,
        },
        leaderboard: rows.map((r, i) => ({
          rank: i + 1,
          customerName: r.customerName,
          progress: Number(r.progress),
          goalReached: ch.goal > 0 && Number(r.progress) >= ch.goal,
        })),
      };
    });
  }
}
