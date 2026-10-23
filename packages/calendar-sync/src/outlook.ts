// Outlook / Microsoft 365 kalendář přes Microsoft Graph.
//
// Adapted from calcom/cal.diy@0f19cc4 packages/app-store/office365calendar/lib/CalendarService.ts
// a packages/features/calendar-subscription/adapters/Office365CalendarSubscription.adapter.ts
// (delta query + /subscriptions) — MIT, (c) 2020-present Cal.com, Inc.
// Přepsáno na přímé HTTP bez Graph SDK.
//
// Stahování změn: calendarView/delta vrátí okno a @odata.deltaLink; příště
// stačí zavolat deltaLink a přijdou jen změny (smazané jako "@removed").

import type { BookingForCalendar, CalendarSyncConfig, ChangeSet, ExternalEvent } from './types.js';

const DEFAULT_GRAPH = 'https://graph.microsoft.com/v1.0';
const DEFAULT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
export const OUTLOOK_SCOPES = ['offline_access', 'Calendars.ReadWrite', 'User.Read'];

/** Okno, které se stahuje: od včerejška na rok dopředu. */
const WINDOW_BACK_MS = 24 * 3600_000;
const WINDOW_AHEAD_MS = 365 * 24 * 3600_000;

export class OutlookDeltaExpired extends Error {
  constructor() {
    super('Outlook delta odkaz propadl — je potřeba úplná synchronizace.');
  }
}

export interface OutlookTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

function graph(cfg: CalendarSyncConfig): string {
  return cfg.microsoft?.graphBase ?? DEFAULT_GRAPH;
}
function ms(cfg: CalendarSyncConfig) {
  if (!cfg.microsoft) {
    throw new Error('Microsoft není nakonfigurovaný (MICROSOFT_CLIENT_ID/SECRET).');
  }
  return cfg.microsoft;
}

// ─── OAuth ────────────────────────────────────────────────────────────────

export function outlookAuthorizeUrl(cfg: CalendarSyncConfig, state: string): string {
  const m = ms(cfg);
  const params = new URLSearchParams({
    client_id: m.clientId,
    response_type: 'code',
    redirect_uri: m.redirectUri ?? '',
    response_mode: 'query',
    scope: OUTLOOK_SCOPES.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function tokenRequest(
  cfg: CalendarSyncConfig,
  body: Record<string, string>,
): Promise<OutlookTokens> {
  const m = ms(cfg);
  const res = await fetch(m.tokenUrl ?? DEFAULT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: m.clientId,
      client_secret: m.clientSecret,
      scope: OUTLOOK_SCOPES.join(' '),
      ...body,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Microsoft token error: ${await res.text()}`);
  const t = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? body.refresh_token ?? '',
    accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
  };
}

export function outlookExchangeCode(cfg: CalendarSyncConfig, code: string) {
  return tokenRequest(cfg, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: ms(cfg).redirectUri ?? '',
  });
}

export function outlookRefresh(cfg: CalendarSyncConfig, refreshToken: string) {
  return tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken });
}

export async function outlookMe(
  cfg: CalendarSyncConfig,
  accessToken: string,
): Promise<{ email: string | null }> {
  const res = await fetch(`${graph(cfg)}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph /me error: ${await res.text()}`);
  const me = (await res.json()) as { mail?: string | null; userPrincipalName?: string };
  return { email: me.mail ?? me.userPrincipalName ?? null };
}

// ─── Změny (delta) ────────────────────────────────────────────────────────

interface GraphEvent {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  '@removed'?: { reason: string };
}

/** Graph vrací čas bez zóny („2027-01-01T10:00:00.0000000"), díky Prefer je v UTC. */
function utc(dt: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(dt) ? dt : `${dt}Z`);
}

export function mapGraphEvent(ev: GraphEvent, reservedIds: Set<string>): ExternalEvent {
  const base = {
    id: ev.id,
    cancelled: Boolean(ev['@removed']) || ev.isCancelled === true,
    transparent: ev.showAs === 'free',
    fromReserved: reservedIds.has(ev.id),
    title: ev.subject ?? 'Outlook',
  };
  if (!ev.start || !ev.end) return base;
  if (ev.isAllDay) {
    return {
      ...base,
      allDay: { startDate: ev.start.dateTime.slice(0, 10), endDate: ev.end.dateTime.slice(0, 10) },
    };
  }
  return { ...base, timed: { start: utc(ev.start.dateTime), end: utc(ev.end.dateTime) } };
}

function eventsPath(calendarRef: string | null): string {
  return calendarRef ? `/me/calendars/${encodeURIComponent(calendarRef)}` : '/me';
}

export async function outlookListChanges(
  cfg: CalendarSyncConfig,
  accessToken: string,
  calendarRef: string | null,
  deltaLink: string | null,
  reservedIds: Set<string>,
): Promise<ChangeSet> {
  let url: string;
  if (deltaLink) {
    url = deltaLink;
  } else {
    const params = new URLSearchParams({
      startDateTime: new Date(Date.now() - WINDOW_BACK_MS).toISOString(),
      endDateTime: new Date(Date.now() + WINDOW_AHEAD_MS).toISOString(),
    });
    url = `${graph(cfg)}${eventsPath(calendarRef)}/calendarView/delta?${params}`;
  }
  const events: ExternalEvent[] = [];
  for (let page = 0; page < 100; page++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC", odata.maxpagesize=200',
      },
    });
    if (res.status === 410) throw new OutlookDeltaExpired();
    if (!res.ok) {
      const text = await res.text();
      if (/SyncStateNotFound|resyncRequired|SyncStateInvalid/i.test(text)) {
        throw new OutlookDeltaExpired();
      }
      throw new Error(`Graph delta error: ${text}`);
    }
    const body = (await res.json()) as {
      value?: GraphEvent[];
      '@odata.nextLink'?: string;
      '@odata.deltaLink'?: string;
    };
    for (const ev of body.value ?? []) events.push(mapGraphEvent(ev, reservedIds));
    if (body['@odata.nextLink']) {
      url = body['@odata.nextLink'];
      continue;
    }
    return {
      mode: deltaLink ? 'incremental' : 'full',
      events,
      nextCursor: body['@odata.deltaLink'] ?? null,
    };
  }
  throw new Error('Graph delta: příliš mnoho stránek.');
}

// ─── Zápis rezervací ──────────────────────────────────────────────────────

function eventBody(b: BookingForCalendar) {
  const dt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '');
  return {
    subject: `${b.serviceName ?? 'Rezervace'}: ${b.customerName}`,
    body: {
      contentType: 'text',
      content: [
        `Reference: ${b.referenceCode}`,
        `Kontakt: ${b.customerEmail}`,
        b.customerPhone ? `Telefon: ${b.customerPhone}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    start: { dateTime: dt(b.startsAt), timeZone: 'UTC' },
    end: { dateTime: dt(b.endsAt), timeZone: 'UTC' },
    showAs: 'busy',
    transactionId: `reserved-${b.id}`,
  };
}

export async function outlookCreateEvent(
  cfg: CalendarSyncConfig,
  accessToken: string,
  calendarRef: string | null,
  b: BookingForCalendar,
): Promise<{ id: string }> {
  const res = await fetch(`${graph(cfg)}${eventsPath(calendarRef)}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(b)),
  });
  if (!res.ok) throw new Error(`Graph create event error: ${await res.text()}`);
  const ev = (await res.json()) as { id: string };
  return { id: ev.id };
}

/** Úprava času; `false` = událost v Outlooku už není (404). */
export async function outlookUpdateEvent(
  cfg: CalendarSyncConfig,
  accessToken: string,
  eventId: string,
  b: BookingForCalendar,
): Promise<boolean> {
  const { start, end } = eventBody(b);
  const res = await fetch(`${graph(cfg)}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end }),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Graph update event error: ${await res.text()}`);
  return true;
}

export async function outlookDeleteEvent(
  cfg: CalendarSyncConfig,
  accessToken: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${graph(cfg)}/me/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Graph delete event error: ${await res.text()}`);
  }
}

// ─── Push (subscriptions) ─────────────────────────────────────────────────

/** Graph povoluje u událostí max. 10 080 min (7 dní); bereme 3 dny a obnovujeme. */
export const OUTLOOK_SUBSCRIPTION_MINUTES = 3 * 24 * 60;

export async function outlookSubscribe(
  cfg: CalendarSyncConfig,
  accessToken: string,
  input: { notificationUrl: string; clientState: string },
): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + OUTLOOK_SUBSCRIPTION_MINUTES * 60_000);
  const res = await fetch(`${graph(cfg)}/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      changeType: 'created,updated,deleted',
      notificationUrl: input.notificationUrl,
      resource: '/me/events',
      expirationDateTime: expiresAt.toISOString(),
      clientState: input.clientState,
    }),
  });
  if (!res.ok) throw new Error(`Graph subscribe error: ${await res.text()}`);
  const sub = (await res.json()) as { id: string; expirationDateTime: string };
  return { id: sub.id, expiresAt: new Date(sub.expirationDateTime) };
}

export async function outlookRenewSubscription(
  cfg: CalendarSyncConfig,
  accessToken: string,
  subscriptionId: string,
): Promise<Date | null> {
  const expiresAt = new Date(Date.now() + OUTLOOK_SUBSCRIPTION_MINUTES * 60_000);
  const res = await fetch(`${graph(cfg)}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expirationDateTime: expiresAt.toISOString() }),
  });
  if (res.status === 404) return null; // propadla → založit novou
  if (!res.ok) throw new Error(`Graph renew subscription error: ${await res.text()}`);
  const sub = (await res.json()) as { expirationDateTime: string };
  return new Date(sub.expirationDateTime);
}

export async function outlookDeleteSubscription(
  cfg: CalendarSyncConfig,
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  await fetch(`${graph(cfg)}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
