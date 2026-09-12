// ReviewsService — recenze (sprint 10.6). Veřejné odeslání (ověřené e-mailem
// proti rezervaci), admin moderace, veřejný průměr na službu/zaměstnance.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type { SubmitReviewDto } from './dto/review.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

@Injectable()
export class ReviewsService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  /** Veřejné odeslání recenze — ověří rezervaci + e-mail, 1 recenze na rezervaci. */
  async submitPublic(tenantId: string, dto: SubmitReviewDto) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [booking] = await tx
        .select()
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, dto.bookingId), eq(schema.bookings.tenantId, tenantId)))
        .limit(1);
      if (!booking) {
        throw new NotFoundException({
          error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
        });
      }
      if (booking.customerEmail.toLowerCase() !== dto.customerEmail.toLowerCase()) {
        throw new ForbiddenException({
          error: { code: 'EMAIL_MISMATCH', message: 'E-mail neodpovídá rezervaci.' },
        });
      }
      if (booking.status === 'cancelled' || booking.status === 'no_show') {
        throw new BadRequestException({
          error: { code: 'CANNOT_REVIEW', message: 'Zrušenou rezervaci nelze hodnotit.' },
        });
      }

      // 1 recenze na rezervaci — předkontrola (vyhne se chybě z unique indexu).
      const existing = await tx
        .select({ id: schema.reviews.id })
        .from(schema.reviews)
        .where(eq(schema.reviews.bookingId, dto.bookingId))
        .limit(1);
      if (existing.length > 0) {
        throw new BadRequestException({
          error: { code: 'ALREADY_REVIEWED', message: 'Tato rezervace už byla ohodnocena.' },
        });
      }

      // Nastavení recenzí: auto-publish + Google Reviews boost.
      const [t] = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const reviewCfg =
        (
          t?.settings as {
            reviews?: {
              autoPublish?: boolean;
              googleReviewUrl?: string;
              googleBoostMinRating?: number;
            };
          } | null
        )?.reviews ?? {};
      const autoPublish = reviewCfg.autoPublish === true;

      const [review] = await tx
        .insert(schema.reviews)
        .values({
          tenantId,
          bookingId: dto.bookingId,
          customerId: booking.customerId,
          serviceId: booking.serviceId,
          employeeId: booking.employeeId,
          rating: dto.rating,
          comment: dto.comment ?? null,
          status: autoPublish ? 'published' : 'pending',
        })
        .returning();

      // Google Reviews boost: spokojeného klienta (rating >= práh, default 4)
      // pošli ohodnotit i na Google. Nespokojené nepřesměrováváme (zpětná vazba
      // zůstane interní). Vyžaduje nastavený settings.reviews.googleReviewUrl.
      const minRating = reviewCfg.googleBoostMinRating ?? 4;
      const boostToGoogle = !!reviewCfg.googleReviewUrl && dto.rating >= minRating;
      return {
        ...review!,
        boostToGoogle,
        googleReviewUrl: boostToGoogle ? reviewCfg.googleReviewUrl! : null,
      };
    });
  }

  /** Veřejný výpis publikovaných recenzí + průměr (pro web/widget). */
  async publicForService(tenantId: string, serviceId: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const items = await tx
        .select({
          id: schema.reviews.id,
          rating: schema.reviews.rating,
          comment: schema.reviews.comment,
          createdAt: schema.reviews.createdAt,
        })
        .from(schema.reviews)
        .where(
          and(
            eq(schema.reviews.tenantId, tenantId),
            eq(schema.reviews.serviceId, serviceId),
            eq(schema.reviews.status, 'published'),
          ),
        )
        .orderBy(desc(schema.reviews.createdAt))
        .limit(100);

      const [agg] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          avg: sql<number>`COALESCE(ROUND(AVG(${schema.reviews.rating})::numeric, 2), 0)`,
        })
        .from(schema.reviews)
        .where(
          and(
            eq(schema.reviews.tenantId, tenantId),
            eq(schema.reviews.serviceId, serviceId),
            eq(schema.reviews.status, 'published'),
          ),
        );

      return { aggregate: { count: Number(agg?.count ?? 0), avg: Number(agg?.avg ?? 0) }, items };
    });
  }

  /** Admin: výpis všech recenzí. */
  async listForAdmin(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.tenantId, tenantId))
        .orderBy(desc(schema.reviews.createdAt))
        .limit(500);
    });
  }

  /** Admin: skrýt/zveřejnit recenzi. */
  async setVisibility(
    tenantId: string,
    userId: string,
    role: AppRole,
    reviewId: string,
    status: 'published' | 'hidden',
  ) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner nebo manager moderuje recenze.' },
      });
    }
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.reviews)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, tenantId)))
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'REVIEW_NOT_FOUND', message: 'Recenze nenalezena.' },
        });
      }
      return updated;
    });
  }
}
