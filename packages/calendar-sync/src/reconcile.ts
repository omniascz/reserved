// Propsání událostí z externího kalendáře do bloků dostupnosti.
//
// Jedna logika pro všechny poskytovatele; liší se jen tabulka s mapováním
// událost ↔ blok (Google má vlastní z dřívějška, Outlook/CalDAV společnou).
//
// Pravidla:
//   - událost z rezervace v Reserved se nekopíruje (jinak by se sync zacyklil)
//   - zrušená / smazaná událost → blok pryč
//   - událost „volno" (transparent / showAs free) → neblokuje, případný blok pryč
//   - celodenní událost → blok přes celé MÍSTNÍ dny provozovny (dřív se
//     přeskakovala, takže dovolená v kalendáři nic neblokovala)
//   - režim 'full' (úplný výpis okna) → co v něm chybí, zmizelo

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { toUtc } from '@reserved/utils';
import type { Tx } from './db.js';
import type { ChangeSet, ExternalEvent, InboundResult } from './types.js';

export interface Mapping {
  id: string;
  externalEventId: string;
  blockId: string;
  contentHash: string;
}

/** Úložiště mapování událost ↔ blok pro jedno připojení. */
export interface InboundStore {
  list(tx: Tx): Promise<Mapping[]>;
  insert(
    tx: Tx,
    m: { externalEventId: string; blockId: string; contentHash: string },
  ): Promise<void>;
  updateHash(tx: Tx, id: string, contentHash: string): Promise<void>;
  remove(tx: Tx, ids: string[]): Promise<void>;
}

/** Časové rozpětí události v UTC (celodenní přes místní půlnoci provozovny). */
export function eventRange(ev: ExternalEvent, timezone: string): { start: Date; end: Date } | null {
  if (ev.timed) {
    return ev.timed.end > ev.timed.start ? ev.timed : null;
  }
  if (ev.allDay) {
    const start = toUtc(ev.allDay.startDate, '00:00', timezone);
    const end = toUtc(ev.allDay.endDate, '00:00', timezone);
    return end > start ? { start, end } : null;
  }
  return null;
}

export async function applyInbound(
  tx: Tx,
  input: {
    tenantId: string;
    employeeId: string;
    timezone: string;
    store: InboundStore;
    changes: ChangeSet;
    sourceLabel: string;
  },
): Promise<InboundResult> {
  const result: InboundResult = { created: 0, updated: 0, deleted: 0, skipped: 0 };
  const mappings = await input.store.list(tx);
  const byExternal = new Map(mappings.map((m) => [m.externalEventId, m]));
  const seen = new Set<string>();
  const toRemove: Mapping[] = [];

  for (const ev of input.changes.events) {
    if (ev.fromReserved) {
      result.skipped++;
      continue;
    }
    const existing = byExternal.get(ev.id);
    const range = eventRange(ev, input.timezone);
    if (ev.cancelled || ev.transparent || !range) {
      // Neblokuje (už) nic → případný dřívější blok pryč.
      if (existing) {
        toRemove.push(existing);
        byExternal.delete(ev.id);
      } else if (!ev.cancelled) {
        result.skipped++;
      }
      continue;
    }
    seen.add(ev.id);

    const title = ev.title.slice(0, 200) || input.sourceLabel;
    const hash = createHash('sha256')
      .update(`${range.start.toISOString()}|${range.end.toISOString()}|${title}`)
      .digest('hex')
      .slice(0, 64);

    if (existing) {
      if (existing.contentHash !== hash) {
        await tx
          .update(schema.availabilityBlocks)
          .set({ startsAt: range.start, endsAt: range.end, title, updatedAt: new Date() })
          .where(
            and(
              eq(schema.availabilityBlocks.id, existing.blockId),
              eq(schema.availabilityBlocks.tenantId, input.tenantId),
            ),
          );
        await input.store.updateHash(tx, existing.id, hash);
        result.updated++;
      }
      continue;
    }

    const [block] = await tx
      .insert(schema.availabilityBlocks)
      .values({
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        startsAt: range.start,
        endsAt: range.end,
        title,
        blockType: 'other',
        note: `Synchronizováno z ${input.sourceLabel}`,
      })
      .returning({ id: schema.availabilityBlocks.id });
    await input.store.insert(tx, { externalEventId: ev.id, blockId: block!.id, contentHash: hash });
    result.created++;
  }

  if (input.changes.mode === 'full') {
    for (const m of byExternal.values()) {
      if (!seen.has(m.externalEventId)) toRemove.push(m);
    }
  }

  if (toRemove.length > 0) {
    await input.store.remove(
      tx,
      toRemove.map((m) => m.id),
    );
    await tx.delete(schema.availabilityBlocks).where(
      and(
        eq(schema.availabilityBlocks.tenantId, input.tenantId),
        inArray(
          schema.availabilityBlocks.id,
          toRemove.map((m) => m.blockId),
        ),
      ),
    );
    result.deleted += toRemove.length;
  }
  return result;
}

// ─── Úložiště mapování ───────────────────────────────────────────────────

export function googleStore(tenantId: string, connectionId: string): InboundStore {
  const t = schema.googleCalendarInboundEvents;
  return {
    async list(tx) {
      const rows = await tx
        .select({
          id: t.id,
          externalEventId: t.googleEventId,
          blockId: t.blockId,
          contentHash: t.contentHash,
        })
        .from(t)
        .where(and(eq(t.tenantId, tenantId), eq(t.connectionId, connectionId)));
      return rows;
    },
    async insert(tx, m) {
      await tx.insert(t).values({
        tenantId,
        connectionId,
        googleEventId: m.externalEventId,
        blockId: m.blockId,
        contentHash: m.contentHash,
      });
    },
    async updateHash(tx, id, contentHash) {
      await tx.update(t).set({ contentHash, lastSyncedAt: new Date() }).where(eq(t.id, id));
    },
    async remove(tx, ids) {
      if (ids.length > 0) await tx.delete(t).where(inArray(t.id, ids));
    },
  };
}

export function genericStore(tenantId: string, connectionId: string): InboundStore {
  const t = schema.calendarInboundEvents;
  return {
    async list(tx) {
      return tx
        .select({
          id: t.id,
          externalEventId: t.externalEventId,
          blockId: t.blockId,
          contentHash: t.contentHash,
        })
        .from(t)
        .where(and(eq(t.tenantId, tenantId), eq(t.connectionId, connectionId)));
    },
    async insert(tx, m) {
      await tx.insert(t).values({
        tenantId,
        connectionId,
        externalEventId: m.externalEventId,
        blockId: m.blockId,
        contentHash: m.contentHash,
      });
    },
    async updateHash(tx, id, contentHash) {
      await tx.update(t).set({ contentHash, lastSyncedAt: new Date() }).where(eq(t.id, id));
    },
    async remove(tx, ids) {
      if (ids.length > 0) await tx.delete(t).where(inArray(t.id, ids));
    },
  };
}
