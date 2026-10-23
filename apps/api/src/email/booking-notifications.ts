// Rušení naplánovaných zpráv k rezervaci.
//
// Vzor z cal.com (calcom/cal.diy@0f19cc4 packages/features/tasker,
// `cancelWithReference` — MIT): naplánovaná úloha nese referenci na rezervaci
// a při stornu nebo přesunu se podle ní zruší. Bez toho dostal zákazník
// připomínku termínu, který už neplatí.
//
// Druhá pojistka je ve workeru notifikací: před odesláním ověří, že
// rezervace pořád platí (pokryje i cesty, které tuhle funkci nevolají).

import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import type { Database } from '../db/db.service.js';

/** Zprávy, které mají smysl jen před termínem — po stornu / přesunu neplatí. */
export const PRE_VISIT_TEMPLATES = ['booking_reminder', 'booking_confirmation'] as const;

/**
 * Zruší čekající budoucí zprávy k rezervacím (v rámci volající transakce).
 * Vrací počet zrušených zpráv.
 */
export async function cancelPendingBookingNotifications(
  tx: Database,
  tenantId: string,
  bookingIds: string[],
  templateCodes: readonly string[] = PRE_VISIT_TEMPLATES,
  reason = 'booking_cancelled',
): Promise<number> {
  if (bookingIds.length === 0) return 0;
  const rows = await tx
    .update(schema.notifications)
    .set({
      status: 'cancelled',
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.notifications.tenantId, tenantId),
        inArray(schema.notifications.relatedBookingId, bookingIds),
        inArray(schema.notifications.templateCode, [...templateCodes]),
        eq(schema.notifications.status, 'pending'),
        gt(schema.notifications.scheduledAt, sql`now()`),
      ),
    )
    .returning({ id: schema.notifications.id });
  return rows.length;
}
