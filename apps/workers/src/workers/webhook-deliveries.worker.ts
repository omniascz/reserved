// Webhook deliveries worker — opakuje nedoručené odchozí webhooky z fronty v DB.
//
// API zkusí doručit hned jednou (webhooks.service.ts). Když to nevyjde a má
// smysl to opakovat, nechá záznam 'pending' s `next_attempt_at`. Tady se
// zralé záznamy převezmou a zkusí znovu podle plánu 1 min → 5 min → 30 min
// → 2 h → 6 h (webhookRetryDelayMs). Vzor cal.com: doručení jako úloha
// v trvalé frontě, která přežije restart.
//
// Převzetí je bezpečné i pro víc instancí: `FOR UPDATE SKIP LOCKED` a posun
// `next_attempt_at` o zámek (LEASE) — souběžně běžící instance stejný záznam
// nevezme, a když tahle uprostřed spadne, záznam se po LEASE vrátí do hry.

import { eq, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { postWebhook, webhookRetryDelayMs } from '@reserved/utils';
import type { Database } from '../db.js';

const BATCH_SIZE = 20;
const LEASE = '5 minutes';
const REQUEST_TIMEOUT_MS = 10_000;
/** Po kolika trvale nedoručených událostech v řadě se webhook pozastaví. */
const PAUSE_AFTER_FAILURES = 5;

interface ClaimedDelivery {
  id: string;
  tenant_id: string;
  webhook_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
  created_at: string;
}

export class WebhookDeliveriesWorker {
  constructor(private readonly db: Database) {}

  async tick(): Promise<{ sent: number; retried: number; failed: number }> {
    const claimed = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      const rows = await tx.execute(sql`
        WITH due AS (
          SELECT id FROM webhook_deliveries
          WHERE status = 'pending' AND next_attempt_at <= now()
          ORDER BY next_attempt_at
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE webhook_deliveries d
        SET next_attempt_at = now() + ${LEASE}::interval, updated_at = now()
        FROM due WHERE d.id = due.id
        RETURNING d.id, d.tenant_id, d.webhook_id, d.event_type, d.payload, d.attempts,
                  d.created_at`);
      return rows as unknown as ClaimedDelivery[];
    });

    const stats = { sent: 0, retried: 0, failed: 0 };
    for (const d of claimed) {
      const outcome = await this.processOne(d);
      stats[outcome]++;
    }
    if (claimed.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[webhook-deliveries] ${claimed.length} převzato: ${stats.sent} doručeno, ` +
          `${stats.retried} znovu později, ${stats.failed} vzdáno`,
      );
    }
    return stats;
  }

  private async processOne(d: ClaimedDelivery): Promise<'sent' | 'retried' | 'failed'> {
    const webhook = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      const [w] = await tx
        .select()
        .from(schema.outgoingWebhooks)
        .where(eq(schema.outgoingWebhooks.id, d.webhook_id))
        .limit(1);
      return w;
    });

    // Webhook mezitím smazaný nebo pozastavený → už nedoručovat.
    if (!webhook || !webhook.isActive) {
      await this.finish(d.id, {
        status: 'failed',
        attempts: d.attempts,
        error: 'webhook_inactive',
        responseStatus: null,
        responseBody: null,
        nextAttemptAt: null,
      });
      return 'failed';
    }

    const attempt = d.attempts + 1;
    const result = await postWebhook({
      url: webhook.url,
      secret: webhook.secret,
      webhookId: webhook.id,
      deliveryId: d.id,
      eventType: d.event_type,
      tenantId: d.tenant_id,
      payload: d.payload,
      timestamp: new Date(d.created_at),
      attempt,
      userAgent: 'Reserved-Webhook/1.0',
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    const retryDelay = !result.success && result.retryable ? webhookRetryDelayMs(attempt) : null;
    const status = result.success ? 'sent' : retryDelay !== null ? 'pending' : 'failed';

    await this.finish(d.id, {
      status,
      attempts: attempt,
      error: result.error,
      responseStatus: result.responseStatus,
      responseBody: result.responseBody,
      nextAttemptAt: retryDelay !== null ? new Date(Date.now() + retryDelay) : null,
    });
    await this.updateWebhook(webhook, status, result.error);

    return status === 'sent' ? 'sent' : status === 'pending' ? 'retried' : 'failed';
  }

  private async finish(
    id: string,
    v: {
      status: string;
      attempts: number;
      error: string | null;
      responseStatus: number | null;
      responseBody: string | null;
      nextAttemptAt: Date | null;
    },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      await tx
        .update(schema.webhookDeliveries)
        .set({
          status: v.status,
          attempts: v.attempts,
          lastError: v.error,
          responseStatus: v.responseStatus,
          responseBody: v.responseBody,
          nextAttemptAt: v.nextAttemptAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.webhookDeliveries.id, id));
    });
  }

  private async updateWebhook(
    webhook: typeof schema.outgoingWebhooks.$inferSelect,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      if (status === 'sent') {
        await tx
          .update(schema.outgoingWebhooks)
          .set({
            consecutiveErrors: 0,
            lastSuccessAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.outgoingWebhooks.id, webhook.id));
        return;
      }
      // Počítadlo pro pozastavení roste jen u TRVALE nedoručené události
      // (atomicky v SQL — souběžné doručení téhož webhooku se nepřepíšou).
      await tx
        .update(schema.outgoingWebhooks)
        .set({
          lastErrorAt: new Date(),
          lastError: error?.slice(0, 500) ?? null,
          updatedAt: new Date(),
          ...(status === 'failed' && {
            consecutiveErrors: sql`${schema.outgoingWebhooks.consecutiveErrors} + 1`,
            isActive: sql`${schema.outgoingWebhooks.consecutiveErrors} + 1 < ${PAUSE_AFTER_FAILURES}`,
          }),
        })
        .where(eq(schema.outgoingWebhooks.id, webhook.id));
    });
  }
}
