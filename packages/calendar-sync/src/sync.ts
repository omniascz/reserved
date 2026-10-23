// Orchestrace synchronizace kalendářů — volá ji worker (pravidelně),
// API (ruční „Synchronizovat", push notifikace) i zápis rezervací.
//
// Dovnitř (kalendář → bloky dostupnosti):
//   syncGoogleConnection / syncGenericConnection — stáhne změny a propíše je.
//   syncDueConnections — vybere připojení, kterým je čas (push „změna" nebo
//   uplynul interval), a obnoví push kanály, kterým končí platnost.
// Ven (rezervace → událost v Outlooku / CalDAV):
//   pushBookingCreated / pushBookingRescheduled / pushBookingCancelled.
//   (Google má zápis z dřívějška v API — GoogleCalendarService.)

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { desifrujKonfiguraci, zasifrujKonfiguraci } from '@reserved/utils';
import {
  caldavCreateEvent,
  caldavDeleteEvent,
  caldavListChanges,
  caldavUpdateEvent,
  type CaldavCredentials,
} from './caldav.js';
import { withService, type Db } from './db.js';
import {
  GoogleSyncTokenExpired,
  googleAccessToken,
  googleListChanges,
  googleStopChannel,
  googleWatch,
} from './google.js';
import {
  OutlookDeltaExpired,
  outlookCreateEvent,
  outlookDeleteEvent,
  outlookListChanges,
  outlookRefresh,
  outlookRenewSubscription,
  outlookSubscribe,
  outlookUpdateEvent,
  type OutlookTokens,
} from './outlook.js';
import { applyInbound, genericStore, googleStore } from './reconcile.js';
import type { BookingForCalendar, CalendarSyncConfig, ChangeSet, InboundResult } from './types.js';

export interface SyncDeps {
  db: Db;
  cfg: CalendarSyncConfig;
  log?: (msg: string) => void;
}

/** Po kolika chybách v řadě se připojení pozastaví (jako u Google dřív). */
const PAUSE_AFTER_ERRORS = 5;
/** Push kanál / subscription obnovit, když zbývá méně než tolik. */
const RENEW_BEFORE_MS = 24 * 3600_000;
/** Google kanál: 7 dní (Google stejně může zkrátit). */
const GOOGLE_CHANNEL_TTL_S = 7 * 24 * 3600;

type GenericConn = typeof schema.calendarConnections.$inferSelect;
type GoogleConn = typeof schema.googleCalendarConnections.$inferSelect;

function message(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}

async function tenantTimezone(db: Db, tenantId: string): Promise<string> {
  const [t] = await withService(db, tenantId, (tx) =>
    tx
      .select({ timezone: schema.tenants.timezone })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1),
  );
  return t?.timezone ?? 'Europe/Prague';
}

// ─── Push: tokeny a ověření ───────────────────────────────────────────────

/** Token push kanálu = HMAC(id připojení) — notifikaci tak nejde podvrhnout. */
export function pushToken(
  secret: string,
  kind: 'google' | 'outlook',
  connectionId: string,
): string {
  return createHmac('sha256', secret).update(`${kind}:${connectionId}`).digest('hex');
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google push: označí připojení k synchronizaci. Vrací jeho ID, nebo null u neznámé / podvržené. */
export async function markGoogleNeedsSync(
  db: Db,
  secret: string,
  channelId: string,
  token: string,
): Promise<string | null> {
  const [conn] = await withService(db, null, (tx) =>
    tx
      .select({
        id: schema.googleCalendarConnections.id,
        tenantId: schema.googleCalendarConnections.tenantId,
      })
      .from(schema.googleCalendarConnections)
      .where(
        and(
          eq(schema.googleCalendarConnections.pushChannelId, channelId),
          isNull(schema.googleCalendarConnections.revokedAt),
        ),
      )
      .limit(1),
  );
  if (!conn || !sameToken(token, pushToken(secret, 'google', conn.id))) return null;
  await withService(db, conn.tenantId, (tx) =>
    tx
      .update(schema.googleCalendarConnections)
      .set({ needsSync: true })
      .where(eq(schema.googleCalendarConnections.id, conn.id)),
  );
  return conn.id;
}

/** Outlook push: označí připojení k synchronizaci podle subscription + clientState. */
export async function markOutlookNeedsSync(
  db: Db,
  secret: string,
  subscriptionId: string,
  clientState: string,
): Promise<string | null> {
  const [conn] = await withService(db, null, (tx) =>
    tx
      .select({ id: schema.calendarConnections.id, tenantId: schema.calendarConnections.tenantId })
      .from(schema.calendarConnections)
      .where(
        and(
          eq(schema.calendarConnections.subscriptionId, subscriptionId),
          isNull(schema.calendarConnections.revokedAt),
        ),
      )
      .limit(1),
  );
  if (!conn || !sameToken(clientState, pushToken(secret, 'outlook', conn.id))) return null;
  await withService(db, conn.tenantId, (tx) =>
    tx
      .update(schema.calendarConnections)
      .set({ needsSync: true })
      .where(eq(schema.calendarConnections.id, conn.id)),
  );
  return conn.id;
}

// ─── Přístupy k obecným připojením (šifrovaně v DB) ───────────────────────

export function readCredentials<T>(cfg: CalendarSyncConfig, conn: GenericConn): T {
  return desifrujKonfiguraci(
    (conn.credentials ?? {}) as Record<string, unknown>,
    cfg.encryptionKey,
  ) as T;
}

export function encryptCredentials(
  cfg: CalendarSyncConfig,
  creds: Record<string, unknown>,
): Record<string, unknown> {
  return zasifrujKonfiguraci(creds, cfg.encryptionKey);
}

/** Outlook access token; když brzy vyprší, obnoví ho a uloží (šifrovaně). */
async function outlookToken(deps: SyncDeps, conn: GenericConn): Promise<string> {
  const creds = readCredentials<OutlookTokens>(deps.cfg, conn);
  if (new Date(creds.accessTokenExpiresAt).getTime() - Date.now() > 60_000) {
    return creds.accessToken;
  }
  const fresh = await outlookRefresh(deps.cfg, creds.refreshToken);
  await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .update(schema.calendarConnections)
      .set({ credentials: encryptCredentials(deps.cfg, { ...fresh }), updatedAt: new Date() })
      .where(eq(schema.calendarConnections.id, conn.id)),
  );
  return fresh.accessToken;
}

// ─── Dovnitř: Google ──────────────────────────────────────────────────────

async function googleError(deps: SyncDeps, conn: GoogleConn, err: unknown): Promise<void> {
  const count = Number(conn.consecutiveErrors) + 1;
  await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .update(schema.googleCalendarConnections)
      .set({
        lastSyncError: message(err),
        consecutiveErrors: String(count),
        isActive: count >= PAUSE_AFTER_ERRORS ? false : conn.isActive,
        needsSync: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.googleCalendarConnections.id, conn.id)),
  );
}

export async function syncGoogleConnection(
  deps: SyncDeps,
  connectionId: string,
): Promise<InboundResult> {
  const [conn] = await withService(deps.db, null, (tx) =>
    tx
      .select()
      .from(schema.googleCalendarConnections)
      .where(eq(schema.googleCalendarConnections.id, connectionId))
      .limit(1),
  );
  if (!conn || !conn.isActive || conn.revokedAt || !conn.inboundSyncEnabled) {
    return { created: 0, updated: 0, deleted: 0, skipped: 0 };
  }
  try {
    const token = await googleAccessToken(deps.db, conn, deps.cfg);
    let changes: ChangeSet;
    try {
      changes = await googleListChanges(token, conn.calendarId, conn.syncToken, deps.cfg);
    } catch (err) {
      // Propadlý syncToken (410) → stáhnout znovu vše.
      if (!(err instanceof GoogleSyncTokenExpired)) throw err;
      changes = await googleListChanges(token, conn.calendarId, null, deps.cfg);
    }
    const timezone = await tenantTimezone(deps.db, conn.tenantId);
    return await withService(deps.db, conn.tenantId, async (tx) => {
      const result = await applyInbound(tx, {
        tenantId: conn.tenantId,
        employeeId: conn.employeeId,
        timezone,
        store: googleStore(conn.tenantId, conn.id),
        changes,
        sourceLabel: 'Google Calendar',
      });
      await tx
        .update(schema.googleCalendarConnections)
        .set({
          syncToken: changes.nextCursor,
          needsSync: false,
          lastInboundSyncAt: new Date(),
          lastSyncError: null,
          consecutiveErrors: '0',
          updatedAt: new Date(),
        })
        .where(eq(schema.googleCalendarConnections.id, conn.id));
      return result;
    });
  } catch (err) {
    await googleError(deps, conn, err);
    throw err;
  }
}

// ─── Dovnitř: Outlook + CalDAV ────────────────────────────────────────────

async function genericError(deps: SyncDeps, conn: GenericConn, err: unknown): Promise<void> {
  const count = conn.consecutiveErrors + 1;
  await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .update(schema.calendarConnections)
      .set({
        lastSyncError: message(err),
        consecutiveErrors: count,
        isActive: count >= PAUSE_AFTER_ERRORS ? false : conn.isActive,
        needsSync: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.calendarConnections.id, conn.id)),
  );
}

async function linkedEventIds(deps: SyncDeps, conn: GenericConn): Promise<Set<string>> {
  const rows = await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .select({ id: schema.calendarEventLinks.externalEventId })
      .from(schema.calendarEventLinks)
      .where(eq(schema.calendarEventLinks.connectionId, conn.id)),
  );
  return new Set(rows.map((r) => r.id));
}

export async function syncGenericConnection(
  deps: SyncDeps,
  connectionId: string,
): Promise<InboundResult> {
  const [conn] = await withService(deps.db, null, (tx) =>
    tx
      .select()
      .from(schema.calendarConnections)
      .where(eq(schema.calendarConnections.id, connectionId))
      .limit(1),
  );
  if (!conn || !conn.isActive || conn.revokedAt || !conn.inboundSyncEnabled) {
    return { created: 0, updated: 0, deleted: 0, skipped: 0 };
  }
  try {
    let changes: ChangeSet;
    if (conn.provider === 'outlook') {
      const token = await outlookToken(deps, conn);
      const ours = await linkedEventIds(deps, conn);
      try {
        changes = await outlookListChanges(
          deps.cfg,
          token,
          conn.calendarRef,
          conn.syncCursor,
          ours,
        );
      } catch (err) {
        if (!(err instanceof OutlookDeltaExpired)) throw err;
        changes = await outlookListChanges(deps.cfg, token, conn.calendarRef, null, ours);
      }
    } else if (conn.provider === 'caldav') {
      changes = await caldavListChanges(
        readCredentials<CaldavCredentials>(deps.cfg, conn),
        conn.calendarRef ?? '',
      );
    } else {
      throw new Error(`Neznámý poskytovatel kalendáře: ${conn.provider}`);
    }

    const timezone = await tenantTimezone(deps.db, conn.tenantId);
    return await withService(deps.db, conn.tenantId, async (tx) => {
      const result = await applyInbound(tx, {
        tenantId: conn.tenantId,
        employeeId: conn.employeeId,
        timezone,
        store: genericStore(conn.tenantId, conn.id),
        changes,
        sourceLabel: conn.provider === 'outlook' ? 'Outlook' : 'kalendáře (CalDAV)',
      });
      await tx
        .update(schema.calendarConnections)
        .set({
          syncCursor: changes.nextCursor,
          needsSync: false,
          lastInboundSyncAt: new Date(),
          lastSyncError: null,
          consecutiveErrors: 0,
          updatedAt: new Date(),
        })
        .where(eq(schema.calendarConnections.id, conn.id));
      return result;
    });
  } catch (err) {
    await genericError(deps, conn, err);
    throw err;
  }
}

// ─── Ven: rezervace → Outlook / CalDAV ────────────────────────────────────

async function outboundConnections(
  deps: SyncDeps,
  tenantId: string,
  employeeId: string,
): Promise<GenericConn[]> {
  return withService(deps.db, tenantId, (tx) =>
    tx
      .select()
      .from(schema.calendarConnections)
      .where(
        and(
          eq(schema.calendarConnections.tenantId, tenantId),
          eq(schema.calendarConnections.employeeId, employeeId),
          eq(schema.calendarConnections.isActive, true),
          eq(schema.calendarConnections.outboundEnabled, true),
          isNull(schema.calendarConnections.revokedAt),
        ),
      ),
  );
}

async function createOn(
  deps: SyncDeps,
  conn: GenericConn,
  booking: BookingForCalendar,
): Promise<void> {
  let link: { externalEventId: string; externalUrl: string | null; externalEtag: string | null };
  if (conn.provider === 'outlook') {
    const token = await outlookToken(deps, conn);
    const ev = await outlookCreateEvent(deps.cfg, token, conn.calendarRef, booking);
    link = { externalEventId: ev.id, externalUrl: null, externalEtag: null };
  } else {
    const ev = await caldavCreateEvent(
      readCredentials<CaldavCredentials>(deps.cfg, conn),
      conn.calendarRef ?? '',
      booking,
    );
    link = { externalEventId: ev.uid, externalUrl: ev.url, externalEtag: ev.etag };
  }
  await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .insert(schema.calendarEventLinks)
      .values({ tenantId: conn.tenantId, connectionId: conn.id, bookingId: booking.id, ...link })
      .onConflictDoNothing(),
  );
}

async function deleteLink(
  deps: SyncDeps,
  conn: GenericConn,
  link: typeof schema.calendarEventLinks.$inferSelect,
): Promise<void> {
  if (conn.isActive && !conn.revokedAt) {
    if (conn.provider === 'outlook') {
      await outlookDeleteEvent(deps.cfg, await outlookToken(deps, conn), link.externalEventId);
    } else {
      await caldavDeleteEvent(readCredentials<CaldavCredentials>(deps.cfg, conn), {
        url: link.externalUrl ?? '',
        etag: link.externalEtag,
      });
    }
  }
  await withService(deps.db, conn.tenantId, (tx) =>
    tx.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.id, link.id)),
  );
}

/** Chyba zápisu jednoho kalendáře nesmí shodit ostatní ani rezervaci. */
async function safely(deps: SyncDeps, conn: GenericConn, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    deps.log?.(`[calendar-sync] zápis do ${conn.provider} ${conn.id} selhal: ${message(err)}`);
    await genericError(deps, conn, err);
  }
}

export async function pushBookingCreated(
  deps: SyncDeps,
  input: { tenantId: string; employeeId: string; booking: BookingForCalendar },
): Promise<void> {
  for (const conn of await outboundConnections(deps, input.tenantId, input.employeeId)) {
    await safely(deps, conn, () => createOn(deps, conn, input.booking));
  }
}

async function linksOf(deps: SyncDeps, tenantId: string, bookingId: string) {
  return withService(deps.db, tenantId, (tx) =>
    tx
      .select({ link: schema.calendarEventLinks, conn: schema.calendarConnections })
      .from(schema.calendarEventLinks)
      .innerJoin(
        schema.calendarConnections,
        eq(schema.calendarConnections.id, schema.calendarEventLinks.connectionId),
      )
      .where(
        and(
          eq(schema.calendarEventLinks.tenantId, tenantId),
          eq(schema.calendarEventLinks.bookingId, bookingId),
        ),
      ),
  );
}

/**
 * Přesun: u stejného zaměstnance upraví událost, při změně zaměstnance ji
 * ze starého kalendáře smaže a v novém vytvoří. Chybějící událost (smazaná
 * v kalendáři) vytvoří znovu.
 */
export async function pushBookingRescheduled(
  deps: SyncDeps,
  input: { tenantId: string; employeeId: string | null; booking: BookingForCalendar },
): Promise<void> {
  const handled = new Set<string>();
  for (const { link, conn } of await linksOf(deps, input.tenantId, input.booking.id)) {
    await safely(deps, conn, async () => {
      const sameEmployee = conn.employeeId === input.employeeId;
      if (!sameEmployee || !conn.isActive || conn.revokedAt || !conn.outboundEnabled) {
        await deleteLink(deps, conn, link);
        return;
      }
      let ok: boolean;
      if (conn.provider === 'outlook') {
        ok = await outlookUpdateEvent(
          deps.cfg,
          await outlookToken(deps, conn),
          link.externalEventId,
          input.booking,
        );
      } else {
        const r = await caldavUpdateEvent(
          readCredentials<CaldavCredentials>(deps.cfg, conn),
          { url: link.externalUrl ?? '', etag: link.externalEtag },
          input.booking,
        );
        ok = r.ok;
        if (ok) {
          await withService(deps.db, conn.tenantId, (tx) =>
            tx
              .update(schema.calendarEventLinks)
              .set({ externalEtag: r.etag, lastSyncedAt: new Date() })
              .where(eq(schema.calendarEventLinks.id, link.id)),
          );
        }
      }
      if (!ok) {
        await withService(deps.db, conn.tenantId, (tx) =>
          tx.delete(schema.calendarEventLinks).where(eq(schema.calendarEventLinks.id, link.id)),
        );
        await createOn(deps, conn, input.booking);
      }
      handled.add(conn.id);
    });
  }
  if (!input.employeeId) return;
  for (const conn of await outboundConnections(deps, input.tenantId, input.employeeId)) {
    if (handled.has(conn.id)) continue;
    await safely(deps, conn, () => createOn(deps, conn, input.booking));
  }
}

export async function pushBookingCancelled(
  deps: SyncDeps,
  input: { tenantId: string; bookingId: string },
): Promise<void> {
  for (const { link, conn } of await linksOf(deps, input.tenantId, input.bookingId)) {
    await safely(deps, conn, () => deleteLink(deps, conn, link));
  }
}

// ─── Push kanály ──────────────────────────────────────────────────────────

function pushEnabled(cfg: CalendarSyncConfig): string | null {
  const base = cfg.publicApiUrl?.replace(/\/+$/, '');
  // Google i Microsoft posílají notifikace jen na veřejné HTTPS.
  return base && base.startsWith('https://') && cfg.pushSecret ? base : null;
}

export async function ensureGooglePush(deps: SyncDeps, conn: GoogleConn): Promise<boolean> {
  const base = pushEnabled(deps.cfg);
  if (!base || !conn.inboundSyncEnabled || !conn.isActive || conn.revokedAt) return false;
  if (conn.pushExpiresAt && conn.pushExpiresAt.getTime() - Date.now() > RENEW_BEFORE_MS) {
    return false;
  }
  const token = await googleAccessToken(deps.db, conn, deps.cfg);
  if (conn.pushChannelId && conn.pushResourceId) {
    await googleStopChannel(
      token,
      { id: conn.pushChannelId, resourceId: conn.pushResourceId },
      deps.cfg,
    );
  }
  const channelId = randomUUID();
  const watch = await googleWatch(
    token,
    conn.calendarId,
    {
      id: channelId,
      address: `${base}/api/v1/integrations/google/push`,
      token: pushToken(deps.cfg.pushSecret!, 'google', conn.id),
      ttlSeconds: GOOGLE_CHANNEL_TTL_S,
    },
    deps.cfg,
  );
  await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .update(schema.googleCalendarConnections)
      .set({
        pushChannelId: channelId,
        pushResourceId: watch.resourceId,
        pushExpiresAt: watch.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.googleCalendarConnections.id, conn.id)),
  );
  return true;
}

export async function ensureOutlookPush(deps: SyncDeps, conn: GenericConn): Promise<boolean> {
  const base = pushEnabled(deps.cfg);
  if (!base || conn.provider !== 'outlook' || !conn.inboundSyncEnabled || !conn.isActive) {
    return false;
  }
  if (
    conn.subscriptionExpiresAt &&
    conn.subscriptionExpiresAt.getTime() - Date.now() > RENEW_BEFORE_MS
  ) {
    return false;
  }
  const token = await outlookToken(deps, conn);
  let sub: { id: string; expiresAt: Date } | null = null;
  if (conn.subscriptionId) {
    const renewed = await outlookRenewSubscription(deps.cfg, token, conn.subscriptionId);
    if (renewed) sub = { id: conn.subscriptionId, expiresAt: renewed };
  }
  sub ??= await outlookSubscribe(deps.cfg, token, {
    notificationUrl: `${base}/api/v1/integrations/outlook/notifications`,
    clientState: pushToken(deps.cfg.pushSecret!, 'outlook', conn.id),
  });
  await withService(deps.db, conn.tenantId, (tx) =>
    tx
      .update(schema.calendarConnections)
      .set({ subscriptionId: sub.id, subscriptionExpiresAt: sub.expiresAt, updatedAt: new Date() })
      .where(eq(schema.calendarConnections.id, conn.id)),
  );
  return true;
}

// ─── Kdo je na řadě ───────────────────────────────────────────────────────

export interface DueSummary {
  synced: number;
  failed: number;
  pushRenewed: number;
}

/**
 * Projde připojení s povoleným příjmem událostí: synchronizuje ta, kde přišel
 * push nebo uplynul `intervalMinutes`, a obnoví push kanály před koncem
 * platnosti. Chyba jednoho připojení se zapíše k němu a pokračuje se dál.
 */
export async function syncDueConnections(
  deps: SyncDeps,
  opts: { intervalMinutes?: number; limit?: number } = {},
): Promise<DueSummary> {
  const interval = opts.intervalMinutes ?? 15;
  const limit = opts.limit ?? 25;
  const due = sql`now() - make_interval(mins => ${interval})`;
  const summary: DueSummary = { synced: 0, failed: 0, pushRenewed: 0 };

  const google = await withService(deps.db, null, (tx) =>
    tx
      .select()
      .from(schema.googleCalendarConnections)
      .where(
        and(
          eq(schema.googleCalendarConnections.isActive, true),
          eq(schema.googleCalendarConnections.inboundSyncEnabled, true),
          isNull(schema.googleCalendarConnections.revokedAt),
        ),
      ),
  );
  for (const conn of google) {
    try {
      if (await ensureGooglePush(deps, conn)) summary.pushRenewed++;
    } catch (err) {
      deps.log?.(`[calendar-sync] Google push ${conn.id}: ${message(err)}`);
    }
  }
  const googleDue = await withService(deps.db, null, (tx) =>
    tx
      .select({ id: schema.googleCalendarConnections.id })
      .from(schema.googleCalendarConnections)
      .where(
        and(
          eq(schema.googleCalendarConnections.isActive, true),
          eq(schema.googleCalendarConnections.inboundSyncEnabled, true),
          isNull(schema.googleCalendarConnections.revokedAt),
          or(
            eq(schema.googleCalendarConnections.needsSync, true),
            isNull(schema.googleCalendarConnections.lastInboundSyncAt),
            lt(schema.googleCalendarConnections.lastInboundSyncAt, due),
          ),
        ),
      )
      .limit(limit),
  );
  for (const c of googleDue) {
    try {
      await syncGoogleConnection(deps, c.id);
      summary.synced++;
    } catch (err) {
      summary.failed++;
      deps.log?.(`[calendar-sync] Google ${c.id}: ${message(err)}`);
    }
  }

  const generic = await withService(deps.db, null, (tx) =>
    tx
      .select()
      .from(schema.calendarConnections)
      .where(
        and(
          eq(schema.calendarConnections.isActive, true),
          eq(schema.calendarConnections.inboundSyncEnabled, true),
          isNull(schema.calendarConnections.revokedAt),
        ),
      ),
  );
  for (const conn of generic) {
    try {
      if (await ensureOutlookPush(deps, conn)) summary.pushRenewed++;
    } catch (err) {
      deps.log?.(`[calendar-sync] Outlook push ${conn.id}: ${message(err)}`);
    }
  }
  const genericDue = generic
    .filter(
      (c) =>
        c.needsSync ||
        !c.lastInboundSyncAt ||
        c.lastInboundSyncAt.getTime() < Date.now() - interval * 60_000,
    )
    .slice(0, limit);
  for (const c of genericDue) {
    try {
      await syncGenericConnection(deps, c.id);
      summary.synced++;
    } catch (err) {
      summary.failed++;
      deps.log?.(`[calendar-sync] ${c.provider} ${c.id}: ${message(err)}`);
    }
  }
  return summary;
}
