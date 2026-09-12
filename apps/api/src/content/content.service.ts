// ContentService — on-demand video / knihovna obsahu (doplněk 10.16).
//
// Reserved obsah nehostuje — drží URL na externí přehrávač. access_level řídí,
// kdo URL uvidí (public / members / subscription). Zamčené položky se vrací
// s videoUrl=null + locked=true (metadata vidí každý, odkaz jen oprávnění).

import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { ContentAccessLevel } from '@reserved/db';
import { type AppRole, type TenantContext, serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { canAccessContent } from './content-access.js';
import type { CreateContentDto, UpdateContentDto } from './dto/content.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Pouze owner nebo manager spravuje obsah.' },
    });
  }
}

type Item = typeof schema.contentItems.$inferSelect;

function toPublicView(item: Item, ctx: { authenticated: boolean; hasSubscription: boolean }) {
  const unlocked = canAccessContent(item.accessLevel as ContentAccessLevel, ctx);
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl,
    category: item.category,
    accessLevel: item.accessLevel,
    durationSeconds: item.durationSeconds,
    locked: !unlocked,
    videoUrl: unlocked ? item.videoUrl : null,
  };
}

@Injectable()
export class ContentService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(SubscriptionsService) private readonly subscriptions: SubscriptionsService,
  ) {}

  // ─── Admin CRUD ──────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, role: AppRole, dto: CreateContentDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.contentItems)
        .values({
          tenantId,
          title: dto.title,
          description: dto.description ?? null,
          videoUrl: dto.videoUrl,
          thumbnailUrl: dto.thumbnailUrl ?? null,
          category: dto.category ?? null,
          accessLevel: dto.accessLevel,
          durationSeconds: dto.durationSeconds ?? null,
          isPublished: dto.isPublished,
          sortOrder: dto.sortOrder,
        })
        .returning();
      return created!;
    });
  }

  async listAdmin(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.contentItems)
        .where(
          and(eq(schema.contentItems.tenantId, tenantId), isNull(schema.contentItems.deletedAt)),
        )
        .orderBy(asc(schema.contentItems.sortOrder), asc(schema.contentItems.createdAt));
    });
  }

  async update(tenantId: string, userId: string, role: AppRole, id: string, dto: UpdateContentDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of [
        'title',
        'description',
        'videoUrl',
        'thumbnailUrl',
        'category',
        'accessLevel',
        'durationSeconds',
        'isPublished',
        'sortOrder',
      ] as const) {
        if (dto[k] !== undefined) patch[k] = dto[k];
      }
      const [updated] = await tx
        .update(schema.contentItems)
        .set(patch)
        .where(
          and(
            eq(schema.contentItems.id, id),
            eq(schema.contentItems.tenantId, tenantId),
            isNull(schema.contentItems.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'CONTENT_NOT_FOUND', message: 'Obsah nenalezen.' },
        });
      }
      return updated;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [deleted] = await tx
        .update(schema.contentItems)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.contentItems.id, id),
            eq(schema.contentItems.tenantId, tenantId),
            isNull(schema.contentItems.deletedAt),
          ),
        )
        .returning({ id: schema.contentItems.id });
      if (!deleted) {
        throw new NotFoundException({
          error: { code: 'CONTENT_NOT_FOUND', message: 'Obsah nenalezen.' },
        });
      }
      return { deleted: true };
    });
  }

  // ─── Veřejný / portálový výpis ───────────────────────────────────────

  private async publishedItems(tenantId: string): Promise<Item[]> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select()
        .from(schema.contentItems)
        .where(
          and(
            eq(schema.contentItems.tenantId, tenantId),
            eq(schema.contentItems.isPublished, true),
            isNull(schema.contentItems.deletedAt),
          ),
        )
        .orderBy(asc(schema.contentItems.sortOrder), asc(schema.contentItems.createdAt));
    });
  }

  /** Anonymní výpis (widget/web) — odemkne jen 'public'. */
  async listPublic(tenantId: string) {
    const items = await this.publishedItems(tenantId);
    const ctx = { authenticated: false, hasSubscription: false };
    return items.map((i) => toPublicView(i, ctx));
  }

  /** Výpis pro přihlášeného klienta (portál) — odemkne dle členství/předplatného. */
  async listForCustomer(tenantId: string, customerId: string) {
    const items = await this.publishedItems(tenantId);
    const benefits = await this.subscriptions.getActiveBenefitsForCustomer(tenantId, customerId);
    const ctx = { authenticated: true, hasSubscription: benefits !== null };
    return items.map((i) => toPublicView(i, ctx));
  }
}
