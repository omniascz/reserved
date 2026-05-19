// Notification worker — vybere z fronty pending notifikace, pošle a updatuje status.
//
// Algoritmus:
//   1. SELECT pending notifications WHERE scheduledAt <= now() LIMIT 50
//   2. Pro každou: pošli (email/sms), update status
//   3. Při chybě: attempts++, exponential backoff přes scheduledAt; po 5 chybách → 'failed'
//
// Single-instance worker (FOR UPDATE SKIP LOCKED přidat při škálování).

import { and, eq, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { Database } from '../db.js';
import type { EmailProvider } from '../providers/email.provider.js';
import type { SmsProvider } from '../providers/sms/index.js';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_SECONDS = 30; // 30s, 1min, 2min, 4min, 8min

export class NotificationsWorker {
  constructor(
    private readonly db: Database,
    private readonly email: EmailProvider,
    private readonly sms: SmsProvider,
  ) {}

  async tick(): Promise<void> {
    // Bereme jen ty, které jsou pending a scheduledAt už uplynul
    const now = new Date();

    const pending = await this.db.transaction(async (tx) => {
      // service role obchází RLS tenant filter — vidíme všechny tenanty
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);

      return tx
        .select()
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.status, 'pending'),
            lte(schema.notifications.scheduledAt, now),
          ),
        )
        .limit(BATCH_SIZE);
    });

    if (pending.length === 0) return;

    // eslint-disable-next-line no-console
    console.log(`[notifications] processing ${pending.length} pending notifications`);

    for (const n of pending) {
      await this.processOne(n);
    }
  }

  private async processOne(n: typeof schema.notifications.$inferSelect): Promise<void> {
    try {
      let providerMessageId: string;
      if (n.channel === 'email') {
        const result = await this.email.send({
          to: n.recipient,
          subject: n.subject ?? '(bez předmětu)',
          body: n.body,
        });
        providerMessageId = result.messageId;
      } else if (n.channel === 'sms') {
        const result = await this.sms.send({
          to: n.recipient,
          body: n.body,
        });
        providerMessageId = result.messageId;
      } else {
        // 'push' nebo neznámý channel — označit jako failed bez retry
        await this.markFailed(n.id, `Unsupported channel: ${n.channel}`, MAX_ATTEMPTS);
        return;
      }

      await this.markSent(n.id, providerMessageId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.markFailedOrRetry(n.id, n.attempts, msg);
    }
  }

  private async markSent(id: string, providerMessageId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      await tx
        .update(schema.notifications)
        .set({
          status: 'sent',
          sentAt: new Date(),
          providerMessageId,
          updatedAt: new Date(),
        })
        .where(eq(schema.notifications.id, id));
    });
  }

  private async markFailedOrRetry(
    id: string,
    currentAttempts: number,
    error: string,
  ): Promise<void> {
    const nextAttempts = currentAttempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await this.markFailed(id, error, nextAttempts);
      return;
    }
    // Exponential backoff: 30s, 60s, 2min, 4min
    const backoffSeconds = BACKOFF_BASE_SECONDS * Math.pow(2, currentAttempts);
    const nextSchedule = new Date(Date.now() + backoffSeconds * 1000);

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      await tx
        .update(schema.notifications)
        .set({
          attempts: nextAttempts,
          lastError: error.slice(0, 1000),
          scheduledAt: nextSchedule,
          updatedAt: new Date(),
        })
        .where(eq(schema.notifications.id, id));
    });

    // eslint-disable-next-line no-console
    console.log(
      `[notifications] retry scheduled for ${id} in ${backoffSeconds}s (attempt ${nextAttempts}/${MAX_ATTEMPTS})`,
    );
  }

  private async markFailed(id: string, error: string, attempts: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      await tx
        .update(schema.notifications)
        .set({
          status: 'failed',
          attempts,
          lastError: error.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.notifications.id, id));
    });
    // eslint-disable-next-line no-console
    console.error(`[notifications] failed permanently: ${id} — ${error.slice(0, 100)}`);
  }
}
