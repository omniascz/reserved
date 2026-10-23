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
//
// Doruceni (vzor cal.com — doruceni je uloha v trvale fronte, ne smycka
// v pameti): API zkusi doručit hned jednou. Kdyz to nevyjde a ma smysl to
// opakovat, necha zaznam 'pending' s `next_attempt_at` a dalsi pokusy
// prevezme worker `webhook-deliveries` (1 min, 5 min, 30 min, 2 h, 6 h).
// Doruceni tak prezije i pad nebo restart API.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { nazevProduktu, postWebhook, webhookRetryDelayMs } from '@reserved/utils';
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
  booking_rescheduled: 'booking.rescheduled',
  booking_completed: 'booking.completed',
  booking_no_show: 'booking.no_show',
  customer_registered: 'customer.created',
};

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
const REQUEST_TIMEOUT_MS = 10_000;
/**
 * Než API první pokus dokončí, drží záznam „zamčený" — worker ho převezme
 * až po této době (kdyby API uprostřed doručování spadlo).
 */
const FIRST_ATTEMPT_LEASE_MS = 2 * 60_000;
/** Po kolika trvale nedoručených událostech v řadě se webhook pozastaví. */
const PAUSE_AFTER_FAILURES = 5;

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
      message: `Toto je testovací payload z ${nazevProduktu()}.`,
      tenantId,
      timestamp: new Date().toISOString(),
    };
    // Test se neopakuje z fronty — admin chce výsledek hned.
    const result = await this.deliver(webhook, 'test', payload, { queueRetries: false });
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
   * První pokus o doručení. Výsledek zapíše do webhook_deliveries; když se
   * nepovede a má smysl to opakovat, nechá záznam 'pending' pro worker.
   * Webhook se pozastaví až po 5 TRVALE nedoručených událostech v řadě.
   */
  private async deliver(
    webhook: typeof schema.outgoingWebhooks.$inferSelect,
    eventType: string,
    payload: unknown,
    opts: { queueRetries: boolean } = { queueRetries: true },
  ): Promise<{
    success: boolean;
    responseStatus: number | null;
    responseBody: string | null;
    error: string | null;
  }> {
    // Záznam vznikne PŘED odesláním — kdyby API spadlo, worker ho najde.
    const delivery = await this.dbService.withRlsContext(
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
            attempts: 0,
            nextAttemptAt: new Date(Date.now() + FIRST_ATTEMPT_LEASE_MS),
          })
          .returning({
            id: schema.webhookDeliveries.id,
            createdAt: schema.webhookDeliveries.createdAt,
          });
        return d!;
      },
    );

    const result = await postWebhook({
      url: webhook.url,
      secret: webhook.secret,
      webhookId: webhook.id,
      deliveryId: delivery.id,
      eventType,
      tenantId: webhook.tenantId,
      payload,
      timestamp: delivery.createdAt,
      attempt: 1,
      userAgent: 'Reserved-Webhook/1.0',
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const retryDelay =
      !result.success && result.retryable && opts.queueRetries ? webhookRetryDelayMs(1) : null;
    const finalStatus = result.success ? 'sent' : retryDelay !== null ? 'pending' : 'failed';

    await this.dbService.withRlsContext(serviceContext(webhook.tenantId), async (tx) => {
      await tx
        .update(schema.webhookDeliveries)
        .set({
          status: finalStatus,
          responseStatus: result.responseStatus,
          responseBody: result.responseBody,
          lastError: result.error,
          attempts: 1,
          nextAttemptAt: retryDelay !== null ? new Date(Date.now() + retryDelay) : null,
          updatedAt: new Date(),
        })
        .where(eq(schema.webhookDeliveries.id, delivery.id));

      if (finalStatus === 'sent') {
        await tx
          .update(schema.outgoingWebhooks)
          .set({
            consecutiveErrors: 0,
            lastSuccessAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.outgoingWebhooks.id, webhook.id));
      } else if (finalStatus === 'failed') {
        const newCount = webhook.consecutiveErrors + 1;
        await tx
          .update(schema.outgoingWebhooks)
          .set({
            consecutiveErrors: newCount,
            lastErrorAt: new Date(),
            lastError: result.error?.slice(0, 500) ?? null,
            isActive: newCount >= PAUSE_AFTER_FAILURES ? false : webhook.isActive,
            updatedAt: new Date(),
          })
          .where(eq(schema.outgoingWebhooks.id, webhook.id));
      } else {
        // Čeká na opakování — jen poznamenej poslední chybu, počítadlo zatím ne.
        await tx
          .update(schema.outgoingWebhooks)
          .set({
            lastErrorAt: new Date(),
            lastError: result.error?.slice(0, 500) ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.outgoingWebhooks.id, webhook.id));
      }
    });

    return {
      success: result.success,
      responseStatus: result.responseStatus,
      responseBody: result.responseBody,
      error: result.error,
    };
  }
}
