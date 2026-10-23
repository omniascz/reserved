// CalDAV kalendář (Apple iCloud, Nextcloud, Seznam kalendář, Radicale, …).
//
// Adapted from calcom/cal.diy@0f19cc4 packages/lib/CalendarService.ts
// (tsdav + ical.js: výpis událostí, rozbalení opakování, zápis .ics) — MIT,
// (c) 2020-present Cal.com, Inc.
//
// CalDAV nemá push — změny se stahují pravidelně (worker), vždy celé okno
// od včerejška na 120 dní dopředu (mode 'full': co v okně chybí, zmizelo).

import ICAL from 'ical.js';
import { createDAVClient, type DAVCalendar } from 'tsdav';
import type { BookingForCalendar, ChangeSet, ExternalEvent } from './types.js';

export interface CaldavCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

const WINDOW_BACK_MS = 24 * 3600_000;
const WINDOW_AHEAD_MS = 120 * 24 * 3600_000;
/** Max. výskytů jedné opakované události v okně (pojistka). */
const MAX_OCCURRENCES = 500;
/** UID událostí, které zapisujeme my (podle něj je poznáme při stahování). */
export const RESERVED_UID_PREFIX = 'reserved-';

async function client(creds: CaldavCredentials) {
  return createDAVClient({
    serverUrl: creds.serverUrl,
    credentials: { username: creds.username, password: creds.password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
}

/** Ověří přístup a vrátí kalendáře, které umí události (VEVENT). */
export async function caldavListCalendars(
  creds: CaldavCredentials,
): Promise<Array<{ url: string; name: string }>> {
  const c = await client(creds);
  const calendars = await c.fetchCalendars();
  return calendars
    .filter((cal) => !cal.components || cal.components.includes('VEVENT'))
    .map((cal) => ({
      url: cal.url,
      name: typeof cal.displayName === 'string' && cal.displayName ? cal.displayName : cal.url,
    }));
}

function calendarOf(url: string): DAVCalendar {
  return { url } as DAVCalendar;
}

// ─── Čtení ────────────────────────────────────────────────────────────────

function toDateString(t: ICAL.Time): string {
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

/** Rozloží jeden .ics objekt na události v okně (vč. výskytů opakování). */
export function parseIcsEvents(ics: string, windowStart: Date, windowEnd: Date): ExternalEvent[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(tz);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
  }
  const vevents = comp.getAllSubcomponents('vevent');
  const masters = vevents.filter((v) => !v.hasProperty('recurrence-id'));
  const exceptions = vevents.filter((v) => v.hasProperty('recurrence-id'));
  const out: ExternalEvent[] = [];

  for (const master of masters) {
    const event = new ICAL.Event(master);
    for (const exc of exceptions) {
      if (exc.getFirstPropertyValue('uid') === event.uid) event.relateException(exc);
    }
    const transparent =
      String(master.getFirstPropertyValue('transp') ?? '').toUpperCase() === 'TRANSPARENT';
    const cancelled =
      String(master.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';
    const base = {
      fromReserved: event.uid.startsWith(RESERVED_UID_PREFIX),
      title: event.summary ?? 'Kalendář',
    };

    const push = (id: string, start: ICAL.Time, end: ICAL.Time, extra?: Partial<ExternalEvent>) => {
      if (start.isDate) {
        out.push({
          ...base,
          id,
          cancelled,
          transparent,
          allDay: { startDate: toDateString(start), endDate: toDateString(end) },
          ...extra,
        });
      } else {
        const s = start.toJSDate();
        const e = end.toJSDate();
        if (e <= windowStart || s >= windowEnd) return;
        out.push({ ...base, id, cancelled, transparent, timed: { start: s, end: e }, ...extra });
      }
    };

    if (!event.isRecurring()) {
      push(event.uid, event.startDate, event.endDate);
      continue;
    }
    const it = event.iterator();
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const next = it.next();
      if (!next) break;
      const occ = event.getOccurrenceDetails(next);
      if (occ.startDate.toJSDate() >= windowEnd) break;
      const status = String(occ.item.component.getFirstPropertyValue('status') ?? '');
      push(`${event.uid}::${occ.recurrenceId.toString()}`, occ.startDate, occ.endDate, {
        cancelled: cancelled || status.toUpperCase() === 'CANCELLED',
        title: occ.item.summary ?? base.title,
      });
    }
  }
  return out;
}

export async function caldavListChanges(
  creds: CaldavCredentials,
  calendarUrl: string,
): Promise<ChangeSet> {
  const c = await client(creds);
  const windowStart = new Date(Date.now() - WINDOW_BACK_MS);
  const windowEnd = new Date(Date.now() + WINDOW_AHEAD_MS);
  const objects = await c.fetchCalendarObjects({
    calendar: calendarOf(calendarUrl),
    timeRange: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
  });
  const events: ExternalEvent[] = [];
  for (const obj of objects) {
    if (typeof obj.data !== 'string' || !obj.data.includes('BEGIN:VEVENT')) continue;
    events.push(...parseIcsEvents(obj.data, windowStart, windowEnd));
  }
  return { mode: 'full', events, nextCursor: null };
}

// ─── Zápis rezervací ──────────────────────────────────────────────────────

function icsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsTime(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Zalomí řádky na 75 znaků (RFC 5545 §3.1). */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export function bookingIcs(b: BookingForCalendar): { uid: string; ics: string } {
  const uid = `${RESERVED_UID_PREFIX}${b.id}`;
  const description = [
    `Reference: ${b.referenceCode}`,
    `Kontakt: ${b.customerEmail}`,
    b.customerPhone ? `Telefon: ${b.customerPhone}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reserved//Rezervace//CS',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(b.startsAt)}`,
    `DTEND:${icsTime(b.endsAt)}`,
    `SUMMARY:${icsText(`${b.serviceName ?? 'Rezervace'}: ${b.customerName}`)}`,
    `DESCRIPTION:${icsText(description)}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return { uid, ics: `${lines.map(fold).join('\r\n')}\r\n` };
}

export async function caldavCreateEvent(
  creds: CaldavCredentials,
  calendarUrl: string,
  b: BookingForCalendar,
): Promise<{ uid: string; url: string; etag: string | null }> {
  const c = await client(creds);
  const { uid, ics } = bookingIcs(b);
  const filename = `${uid}.ics`;
  const res = await c.createCalendarObject({
    calendar: calendarOf(calendarUrl),
    filename,
    iCalString: ics,
  });
  if (!res.ok) throw new Error(`CalDAV create error: HTTP ${res.status}`);
  const base = calendarUrl.endsWith('/') ? calendarUrl : `${calendarUrl}/`;
  return { uid, url: new URL(filename, base).toString(), etag: res.headers.get('etag') };
}

/** Úprava; `false` = objekt už neexistuje nebo ho mezitím změnil někdo jiný. */
export async function caldavUpdateEvent(
  creds: CaldavCredentials,
  link: { url: string; etag: string | null },
  b: BookingForCalendar,
): Promise<{ ok: boolean; etag: string | null }> {
  const c = await client(creds);
  const { ics } = bookingIcs(b);
  const res = await c.updateCalendarObject({
    calendarObject: { url: link.url, data: ics, etag: link.etag ?? undefined },
  });
  if (res.status === 404 || res.status === 412) return { ok: false, etag: null };
  if (!res.ok) throw new Error(`CalDAV update error: HTTP ${res.status}`);
  return { ok: true, etag: res.headers.get('etag') };
}

export async function caldavDeleteEvent(
  creds: CaldavCredentials,
  link: { url: string; etag: string | null },
): Promise<void> {
  const c = await client(creds);
  const res = await c.deleteCalendarObject({
    calendarObject: { url: link.url, etag: link.etag ?? undefined },
  });
  if (!res.ok && res.status !== 404) throw new Error(`CalDAV delete error: HTTP ${res.status}`);
}
