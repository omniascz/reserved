// WebhooksService — outgoing webhooks pro Zapier / Make / IFTTT / vlastni.
// Sprint 3.3 faze C5.
//
// Architektura:
//   - tenant admin si vytvori webhook: URL + secret + event_types
//   - service nabizi `dispatch(tenantId, eventType, payload)` ktery
//     vsechny ostatni services volaji po vytvoreni/zmene bookingu/zakaznika
//   - dispatch je fire-and-forget — neblokuje business flow
//   - kazde doruceni se zaznamenava do webhook_deliveries (audit)
//   - po 5 nezdarech v rade se webhook automaticky pozastavi (isActive=false)
//
// Bezpecnost: payload je podepsany HMAC-SHA256 v hlavicce
// X-Reserved-Signature: sha256=<hex>

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { WebhookEventType } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import type { TriggerEvent } from '@reserved/rules-engine';
import { DbService } from '../db/db.service.js';
import { EventBus } from '../rules/events.bus.js';
import type { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto.js';

// Mapovani z rules engine event names (snake_case) na verejne webhook
// event names (dot.notation, konvence Zapieru / Stripe).
const TRIGGER_TO_WEBHOOK: Partial<Record<TriggerEvent, WebhookEventType>> = {
  booking_created: 'booking.created',
  booking_cancelled: 'booking.cancelled',
  booking_completed: 'booking.completed',
  booking_no_show: 'booking.no_show',
  customer_registered: 'customer.created',
};

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
const REQUEST_TIMEOUT_MS = 10_000;

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat webhooky.',
      },
    });
  }
}

function generateSecret(): string {
  // 32 bytes -> 64 hex chars (vejde se do varchar(64))
  return randomBytes(32).toString('hex');
}

@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger('WebhooksService');

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EventBus) private readonly eventBus: EventBus,
  ) {}

  onModuleInit(): void {
    // Subscribe na rules engine EventBus — kdykoli se emituje booking/customer
    // event, posleme ho vsem matchujicim webhookum (fire-and-forget).
    this.eventBus.on((event) => {
      const webhookEvent = TRIGGER_TO_WEBHOOK[event.type];
      if (!webhookEvent) return;
      this.dispatch(event.tenantId, webhookEvent, event.payload);
    });
  }

  // ─── Admin CRUD ───────────────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select({
          id: schema.outgoingWebhooks.id,
          name: schema.outgoingWebhooks.name,
          url: schema.outgoingWebhooks.url,
          eventTypes: schema.outgoingWebhooks.eventTypes,
          isActive: schema.outgoingWebhooks.isActive,
          consecutiveErrors: schema.outgoingWebhooks.consecutiveErrors,
          lastSuccessAt: schema.outgoingWebhooks.lastSuccessAt,
          lastErrorAt: schema.outgoingWebhooks.lastErrorAt,
          lastError: schema.outgoingWebhooks.lastError,
          createdAt: schema.outgoingWebhooks.createdAt,
        })
        .from(schema.outgoingWebhooks)
        .where(eq(schema.outgoingWebhooks.tenantId, tenantId))
        .orderBy(desc(schema.outgoingWebhooks.createdAt));
    });
  }

  /**
   * Vytvori webhook. Vrati cely zaznam vcetne `secret` — JEDINKRAT.
   * Admin si ho musi zkopirovat; pozdejsi GET ho uz neukaze.
   */
  async create(tenantId: string, userId: string, role: AppRole, dto: CreateWebhookDto) {
    assertCanManage(role);
    const secret = generateSecret();
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [row] = await tx
        .insert(schema.outgoingWebhooks)
        .values({
          tenantId,
          name: dto.name,
          url: dto.url,
          secret,
          eventTypes: dto.eventTypes,
          createdBy: userId,
        })
        .returning();
      return row!;
    });
  }

  async update(tenantId: string, userId: string, role: AppRole, id: string, dto: UpdateWebhookDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const update: Partial<typeof schema.outgoingWebhooks.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (dto.name !== undefined) update.name = dto.name;
      if (dto.url !== undefined) update.url = dto.url;
      if (dto.eventTypes !== undefined) update.eventTypes = dto.eventTypes;
      if (dto.isActive !== undefined) {
        update.isActive = dto.isActive;
        // Pri reaktivaci resetuj counter chyb
        if (dto.isActive) update.consecutiveErrors = 0;
      }
      const [row] = await tx
        .update(schema.outgoingWebhooks)
        .set(update)
        .where(
          and(eq(schema.outgoingWebhooks.id, id), eq(schema.outgoingWebhooks.tenantId, tenantId)),
        )
        .returning();
      if (!row) {
        throw new NotFoundException({
          error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nenalezen.' },
        });
      }
      return row;
    });
  }

  async delete(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const res = await tx
        .delete(schema.outgoingWebhooks)
        .where(
          and(eq(schema.outgoingWebhooks.id, id), eq(schema.outgoingWebhooks.tenantId, tenantId)),
        )
        .returning({ id: schema.outgoingWebhooks.id });
      if (res.length === 0) {
        throw new NotFoundException({
          error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nenalezen.' },
        });
      }
    });
  }

  /**
   * Posli testovaci payload — admin si over, ze endpoint funguje.
   */
  async sendTest(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    const webhook = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [w] = await tx
          .select()
          .from(schema.outgoingWebhooks)
          .where(
            and(eq(schema.outgoingWebhooks.id, id), eq(schema.outgoingWebhooks.tenantId, tenantId)),
          )
          .limit(1);
        return w;
      },
    );
    if (!webhook) {
      throw new NotFoundException({
        error: { code: 'WEBHOOK_NOT_FOUND', message: 'Webhook nenalezen.' },
      });
    }

    const payload = {
      message: 'Toto je testovací payload z Reserved.',
      tenantId,
      timestamp: new Date().toISOString(),
    };
    const result = await this.deliver(webhook, 'test', payload);
    return {
      ok: result.success,
      responseStatus: result.responseStatus,
      responseBody: result.responseBody?.slice(0, 500) ?? null,
      error: result.error,
    };
  }

  async listDeliveries(tenantId: string, userId: string, role: AppRole, webhookId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.webhookDeliveries)
        .where(
          and(
            eq(schema.webhookDeliveries.webhookId, webhookId),
            eq(schema.webhookDeliveries.tenantId, tenantId),
          ),
        )
        .orderBy(desc(schema.webhookDeliveries.createdAt))
        .limit(50);
    });
  }

  // ─── Dispatch (volaji ostatni services) ──────────────────────────

  /**
   * Posli event vsem aktivnim webhookum, ktere ho maji v eventTypes.
   * Fire-and-forget — necheka na vysledek, neblokuje business flow.
   */
  dispatch(tenantId: string, eventType: WebhookEventType, payload: unknown): void {
    // Spusti async, ale necheka — necek aby business flow byl rychly
    void this.dispatchAsync(tenantId, eventType, payload).catch((err) => {
      this.logger.error(`Webhook dispatch failed: ${err instanceof Error ? err.message : err}`);
    });
  }

  private async dispatchAsync(
    tenantId: string,
    eventType: WebhookEventType,
    payload: unknown,
  ): Promise<void> {
    const webhooks = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select()
        .from(schema.outgoingWebhooks)
        .where(
          and(
            eq(schema.outgoingWebhooks.tenantId, tenantId),
            eq(schema.outgoingWebhooks.isActive, true),
          ),
        );
    });

    const matching = webhooks.filter((w) => {
      const types = Array.isArray(w.eventTypes) ? (w.eventTypes as string[]) : [];
      return types.includes(eventType);
    });

    for (const webhook of matching) {
      await this.deliver(webhook, eventType, payload);
    }
  }

  /**
   * Pokus o doruceni — zapise vysledek do webhook_deliveries a updatuje
   * counter chyb na webhook config. Po 5 chybach v rade pozastavi webhook.
   */
  private async deliver(
    webhook: typeof schema.outgoingWebhooks.$inferSelect,
    eventType: string,
    payload: unknown,
  ): Promise<{
    success: boolean;
    responseStatus: number | null;
    responseBody: string | null;
    error: string | null;
  }> {
    // Zapis pending delivery
    const deliveryId = await this.dbService.withRlsContext(
      serviceContext(webhook.tenantId),
      async (tx) => {
        const [d] = await tx
          .insert(schema.webhookDeliveries)
          .values({
            tenantId: webhook.tenantId,
            webhookId: webhook.id,
            eventType,
            payload: payload as Record<string, unknown>,
            status: 'pending',
            attempts: 1,
          })
          .returning({ id: schema.webhookDeliveries.id });
        return d!.id;
      },
    );

    const body = JSON.stringify({
      eventType,
      tenantId: webhook.tenantId,
      payload,
      timestamp: new Date().toISOString(),
    });
    const signature = createHmac('sha256', webhook.secret).update(body).digest('hex');

    let success = false;
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let errorMsg: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reserved-Signature': `sha256=${signature}`,
          'X-Reserved-Event-Type': eventType,
          'X-Reserved-Webhook-Id': webhook.id,
          'X-Reserved-Delivery-Id': deliveryId,
          'User-Agent': 'Reserved-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      responseStatus = res.status;
      const text = await res.text().catch(() => '');
      responseBody = text.slice(0, 2000);
      success = res.ok;
      if (!success) {
        errorMsg = `HTTP ${res.status}: ${text.slice(0, 200)}`;
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }

    // Aktualizuj delivery + webhook config
    await this.dbService.withRlsContext(serviceContext(webhook.tenantId), async (tx) => {
      await tx
        .update(schema.webhookDeliveries)
        .set({
          status: success ? 'sent' : 'failed',
          responseStatus: responseStatus ?? null,
          responseBody,
          lastError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(schema.webhookDeliveries.id, deliveryId));

      if (success) {
        await tx
          .update(schema.outgoingWebhooks)
          .set({
            consecutiveErrors: 0,
            lastSuccessAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.outgoingWebhooks.id, webhook.id));
      } else {
        const newCount = webhook.consecutiveErrors + 1;
        await tx
          .update(schema.outgoingWebhooks)
          .set({
            consecutiveErrors: newCount,
            lastErrorAt: new Date(),
            lastError: errorMsg?.slice(0, 500) ?? null,
            // Po 5 chybach automaticky pozastav
            isActive: newCount >= 5 ? false : webhook.isActive,
            updatedAt: new Date(),
          })
          .where(eq(schema.outgoingWebhooks.id, webhook.id));
      }
    });

    return { success, responseStatus, responseBody, error: errorMsg };
  }
}
