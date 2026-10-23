// Google Calendar — stahování změn (G → R) a push kanál.
//
// Adapted from calcom/cal.diy@0f19cc4
// packages/features/calendar-subscription/adapters/GoogleCalendarSubscription.adapter.ts
// (events.watch + syncToken) — MIT, (c) 2020-present Cal.com, Inc.
// Přepsáno na přímé HTTP (jako zbytek Google integrace v Reserved).
//
// Inkrementální synchronizace: první stažení vrátí všechno od včerejška
// a `nextSyncToken`; další stažení s tokenem vrátí jen změny (vč. smazaných
// jako status=cancelled). Když token propadne (HTTP 410), stáhne se vše znovu.

import { eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { withService, type Db } from './db.js';
import type { CalendarSyncConfig, ChangeSet, ExternalEvent } from './types.js';

const DEFAULT_API = 'https://www.googleapis.com/calendar/v3';
const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleSyncTokenExpired extends Error {
  constructor() {
    super('Google sync token propadl (410) — je potřeba úplná synchronizace.');
  }
}

interface GoogleEvent {
  id: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export function mapGoogleEvent(ev: GoogleEvent): ExternalEvent {
  const base = {
    id: ev.id,
    cancelled: ev.status === 'cancelled',
    transparent: ev.transparency === 'transparent',
    fromReserved: Boolean(ev.extendedProperties?.private?.reservedBookingId),
    title: ev.summary ?? 'Google Calendar',
  };
  if (ev.start?.dateTime && ev.end?.dateTime) {
    return {
      ...base,
      timed: { start: new Date(ev.start.dateTime), end: new Date(ev.end.dateTime) },
    };
  }
  if (ev.start?.date && ev.end?.date) {
    return { ...base, allDay: { startDate: ev.start.date, endDate: ev.end.date } };
  }
  return base;
}

function api(cfg: CalendarSyncConfig): string {
  return cfg.google?.apiBase ?? DEFAULT_API;
}

/** Platný access token připojení; když brzy vyprší, obnoví ho a uloží. */
export async function googleAccessToken(
  db: Db,
  conn: typeof schema.googleCalendarConnections.$inferSelect,
  cfg: CalendarSyncConfig,
): Promise<string> {
  if (
    conn.accessToken &&
    conn.accessTokenExpiresAt &&
    conn.accessTokenExpiresAt.getTime() - Date.now() > 60_000
  ) {
    return conn.accessToken;
  }
  if (!cfg.google) throw new Error('Google není nakonfigurovaný (GOOGLE_CLIENT_ID/SECRET).');
  const res = await fetch(cfg.google.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.google.clientId,
      client_secret: cfg.google.clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const tokens = (await res.json()) as { access_token: string; expires_in: number };
  await withService(db, conn.tenantId, (tx) =>
    tx
      .update(schema.googleCalendarConnections)
      .set({
        accessToken: tokens.access_token,
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.googleCalendarConnections.id, conn.id)),
  );
  return tokens.access_token;
}

/**
 * Stáhne změny. Bez `syncToken` úplný výpis od včerejška (mode 'full'),
 * s ním jen změny (mode 'incremental'). Propadlý token → GoogleSyncTokenExpired.
 */
export async function googleListChanges(
  accessToken: string,
  calendarId: string,
  syncToken: string | null,
  cfg: CalendarSyncConfig,
): Promise<ChangeSet> {
  const events: ExternalEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  // Pojistka proti nekonečnému stránkování.
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '2500' });
    if (syncToken) params.set('syncToken', syncToken);
    else params.set('timeMin', new Date(Date.now() - 24 * 3600_000).toISOString());
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `${api(cfg)}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.status === 410) throw new GoogleSyncTokenExpired();
    if (!res.ok) throw new Error(`Google Calendar API error: ${await res.text()}`);
    const body = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const ev of body.items ?? []) events.push(mapGoogleEvent(ev));
    if (body.nextPageToken) {
      pageToken = body.nextPageToken;
      continue;
    }
    nextSyncToken = body.nextSyncToken ?? null;
    break;
  }
  return { mode: syncToken ? 'incremental' : 'full', events, nextCursor: nextSyncToken };
}

/** Založí push kanál (events.watch). Google pošle POST na `address` při změně. */
export async function googleWatch(
  accessToken: string,
  calendarId: string,
  channel: { id: string; address: string; token: string; ttlSeconds: number },
  cfg: CalendarSyncConfig,
): Promise<{ resourceId: string; expiresAt: Date }> {
  const res = await fetch(`${api(cfg)}/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: channel.id,
      type: 'web_hook',
      address: channel.address,
      token: channel.token,
      params: { ttl: String(channel.ttlSeconds) },
    }),
  });
  if (!res.ok) throw new Error(`Google watch failed: ${await res.text()}`);
  const body = (await res.json()) as { resourceId: string; expiration?: string };
  return {
    resourceId: body.resourceId,
    expiresAt: new Date(Number(body.expiration ?? Date.now() + channel.ttlSeconds * 1000)),
  };
}

/** Zruší push kanál (při odpojení / obnově). Chybu jen vrátí — kanál stejně vyprší. */
export async function googleStopChannel(
  accessToken: string,
  channel: { id: string; resourceId: string },
  cfg: CalendarSyncConfig,
): Promise<boolean> {
  const res = await fetch(`${api(cfg)}/channels/stop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }),
  });
  return res.ok || res.status === 404;
}
