// Slot holds expiration worker — uvolňuje slot_holds, kde expiresAt < now.
// Status 'active' → 'expired'. Brání obsazenosti zombie holds.

import { and, eq, lt, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { Database } from '../db.js';

export class SlotHoldsWorker {
  constructor(private readonly db: Database) {}

  async tick(): Promise<void> {
    const now = new Date();

    const result = await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_role', 'service', true)`);
      const updated = await tx
        .update(schema.slotHolds)
        .set({ status: 'expired' })
        .where(and(eq(schema.slotHolds.status, 'active'), lt(schema.slotHolds.expiresAt, now)))
        .returning({ id: schema.slotHolds.id });
      return updated;
    });

    if (result.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[slot-holds] released ${result.length} expired hold(s)`);
    }
  }
}
