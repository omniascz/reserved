// Birthday greetings worker — jednou denně pošle přání zákazníkům, kteří mají
// dnes narozeniny. Gate: tenant má zapnuté settings.notifications.birthdayGreetings,
// zákazník má marketing opt-in. Idempotentní — stejný zákazník dostane max 1× za den.

import { sql } from 'drizzle-orm';
import type { Database } from '../db.js';

export class BirthdaysWorker {
  constructor(private readonly db: Database) {}

  async tick(): Promise<void> {
    const rows = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      const result = await tx.execute(sql`
        INSERT INTO notifications
          (tenant_id, channel, template_code, recipient, subject, body, status, scheduled_at, metadata)
        SELECT
          c.tenant_id, 'email', 'birthday', c.email,
          'Všechno nejlepší k narozeninám! 🎉',
          'Přejeme vám krásné narozeniny a těšíme se na vaši další návštěvu.',
          'pending', now(),
          jsonb_build_object('kind', 'birthday', 'customerId', c.id::text)
        FROM customers c
        WHERE c.date_of_birth IS NOT NULL
          AND EXTRACT(MONTH FROM c.date_of_birth) = EXTRACT(MONTH FROM now())
          AND EXTRACT(DAY   FROM c.date_of_birth) = EXTRACT(DAY   FROM now())
          AND c.marketing_opt_in = true
          AND c.is_active = true
          AND c.deleted_at IS NULL
          AND c.email IS NOT NULL AND c.email <> ''
          AND EXISTS (
            SELECT 1 FROM tenants t
            WHERE t.id = c.tenant_id
              AND (t.settings->'notifications'->>'birthdayGreetings') = 'true'
          )
          AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.tenant_id = c.tenant_id
              AND n.metadata->>'kind' = 'birthday'
              AND n.metadata->>'customerId' = c.id::text
              AND n.created_at::date = now()::date
          )
        RETURNING id
      `);
      return result;
    });

    const count = Array.isArray(rows) ? rows.length : 0;
    if (count > 0) {
      // eslint-disable-next-line no-console
      console.log(`[birthdays] enqueued ${count} birthday greeting(s)`);
    }
  }
}
