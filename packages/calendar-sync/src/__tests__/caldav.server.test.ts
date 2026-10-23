// CalDAV proti SKUTEČNÉMU serveru (Radicale v Dockeru).
//
// Lokálně / v CI:
//   docker run -d -p 5232:5232 -v <config>:/config:ro tomsquest/docker-radicale:3.2.3.0
//   CALDAV_TEST_URL=http://localhost:5232 CALDAV_TEST_USER=… CALDAV_TEST_PASSWORD=…
// Bez CALDAV_TEST_URL se test přeskočí.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  caldavCreateEvent,
  caldavDeleteEvent,
  caldavListCalendars,
  caldavListChanges,
  caldavUpdateEvent,
  type CaldavCredentials,
} from '../caldav.js';

const URL_ = process.env.CALDAV_TEST_URL;
const creds: CaldavCredentials = {
  serverUrl: URL_ ?? '',
  username: process.env.CALDAV_TEST_USER ?? '',
  password: process.env.CALDAV_TEST_PASSWORD ?? '',
};

// Termíny relativně k dnešku (okno je včera … +120 dní).
const den = (plus: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};
const ics = (date: string) => date.replace(/-/g, '');

const PRAGUE_TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
].join('\r\n');

function wrap(...parts: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//CS', ...parts, 'END:VCALENDAR'].join(
    '\r\n',
  );
}

describe.skipIf(!URL_)('CalDAV (Radicale)', () => {
  let calendarUrl: string;
  const put = async (name: string, body: string) => {
    const res = await fetch(new URL(name, calendarUrl), {
      method: 'PUT',
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`,
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body,
    });
    if (!res.ok) throw new Error(`PUT ${name}: ${res.status} ${await res.text()}`);
  };

  beforeAll(async () => {
    // Vlastní čistý kalendář pro běh testu.
    const user = `${creds.serverUrl.replace(/\/$/, '')}/${creds.username}/`;
    calendarUrl = `${user}test-${Date.now().toString(36)}/`;
    const res = await fetch(calendarUrl, {
      method: 'MKCALENDAR',
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`,
      },
    });
    if (res.status !== 201) throw new Error(`MKCALENDAR: ${res.status}`);

    const d1 = den(3);
    await put(
      'schuzka.ics',
      wrap(
        PRAGUE_TZ,
        'BEGIN:VEVENT',
        'UID:schuzka-1',
        'DTSTAMP:20260101T000000Z',
        `DTSTART;TZID=Europe/Prague:${ics(d1)}T100000`,
        `DTEND;TZID=Europe/Prague:${ics(d1)}T113000`,
        'SUMMARY:Zubař',
        'END:VEVENT',
      ),
    );
    await put(
      'dovolena.ics',
      wrap(
        'BEGIN:VEVENT',
        'UID:dovolena-1',
        'DTSTAMP:20260101T000000Z',
        `DTSTART;VALUE=DATE:${ics(den(5))}`,
        `DTEND;VALUE=DATE:${ics(den(7))}`,
        'SUMMARY:Dovolená',
        'END:VEVENT',
      ),
    );
    await put(
      'volno.ics',
      wrap(
        'BEGIN:VEVENT',
        'UID:volno-1',
        'DTSTAMP:20260101T000000Z',
        `DTSTART:${ics(den(4))}T080000Z`,
        `DTEND:${ics(den(4))}T090000Z`,
        'SUMMARY:Připomínka',
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      ),
    );
    await put(
      'zrusena.ics',
      wrap(
        'BEGIN:VEVENT',
        'UID:zrusena-1',
        'DTSTAMP:20260101T000000Z',
        `DTSTART:${ics(den(4))}T120000Z`,
        `DTEND:${ics(den(4))}T130000Z`,
        'SUMMARY:Zrušená porada',
        'STATUS:CANCELLED',
        'END:VEVENT',
      ),
    );
    // Týdně 4×, druhý výskyt vynechaný (EXDATE), třetí posunutý o 2 h (výjimka).
    const r0 = den(8);
    const r1 = den(15);
    const r2 = den(22);
    await put(
      'opakovana.ics',
      wrap(
        'BEGIN:VEVENT',
        'UID:opak-1',
        'DTSTAMP:20260101T000000Z',
        `DTSTART:${ics(r0)}T070000Z`,
        `DTEND:${ics(r0)}T080000Z`,
        'RRULE:FREQ=WEEKLY;COUNT=4',
        `EXDATE:${ics(r1)}T070000Z`,
        'SUMMARY:Školení',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:opak-1',
        'DTSTAMP:20260101T000000Z',
        `RECURRENCE-ID:${ics(r2)}T070000Z`,
        `DTSTART:${ics(r2)}T090000Z`,
        `DTEND:${ics(r2)}T100000Z`,
        'SUMMARY:Školení (posunuté)',
        'END:VEVENT',
      ),
    );
  });

  afterAll(async () => {
    if (!calendarUrl) return;
    await fetch(calendarUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`,
      },
    });
  });

  it('najde kalendář účtu', async () => {
    const cals = await caldavListCalendars(creds);
    const path = new URL(calendarUrl).pathname;
    expect(cals.some((c) => c.url === calendarUrl || c.url.endsWith(path))).toBe(true);
  });

  it('převede události: čas se zónou, celodenní, volno, zrušená, opakování s výjimkami', async () => {
    const { events, mode } = await caldavListChanges(creds, calendarUrl);
    expect(mode).toBe('full');
    const byId = new Map(events.map((e) => [e.id, e]));

    const zubar = byId.get('schuzka-1')!;
    // 10:00 pražského času → v UTC o 1–2 h dřív podle letního/zimního času.
    const offH = 10 - zubar.timed!.start.getUTCHours();
    expect([1, 2]).toContain(offH);
    expect(zubar.timed!.end.getTime() - zubar.timed!.start.getTime()).toBe(90 * 60_000);
    expect(zubar).toMatchObject({ cancelled: false, transparent: false, fromReserved: false });

    expect(byId.get('dovolena-1')).toMatchObject({
      allDay: { startDate: den(5), endDate: den(7) },
      title: 'Dovolená',
    });
    expect(byId.get('volno-1')!.transparent).toBe(true);
    expect(byId.get('zrusena-1')!.cancelled).toBe(true);

    const opak = events.filter((e) => e.id.startsWith('opak-1::'));
    expect(opak.map((e) => e.timed!.start.toISOString().slice(0, 13))).toEqual([
      `${den(8)}T07`,
      `${den(22)}T09`, // posunutý výskyt
      `${den(29)}T07`,
    ]);
    expect(opak[1]!.title).toBe('Školení (posunuté)');
  });

  it('rezervaci zapíše, upraví a smaže; při stahování ji pozná jako naši', async () => {
    const booking = {
      id: '11111111-2222-3333-4444-555555555555',
      startsAt: new Date(`${den(10)}T08:00:00Z`),
      endsAt: new Date(`${den(10)}T09:00:00Z`),
      customerName: 'Jana Nováková',
      customerEmail: 'jana@test.cz',
      customerPhone: '+420777123456',
      serviceName: 'Masáž, záda; 60 min',
      referenceCode: 'B-AAAA-BBBB',
    };
    const created = await caldavCreateEvent(creds, calendarUrl, booking);
    expect(created.uid).toBe(`reserved-${booking.id}`);

    let ev = (await caldavListChanges(creds, calendarUrl)).events.find(
      (e) => e.id === created.uid,
    )!;
    expect(ev.fromReserved).toBe(true);
    expect(ev.title).toBe('Masáž, záda; 60 min: Jana Nováková');
    expect(ev.timed!.start.toISOString()).toBe(booking.startsAt.toISOString());

    const moved = {
      ...booking,
      startsAt: new Date(`${den(11)}T12:00:00Z`),
      endsAt: new Date(`${den(11)}T13:00:00Z`),
    };
    const upd = await caldavUpdateEvent(creds, { url: created.url, etag: created.etag }, moved);
    expect(upd.ok).toBe(true);
    ev = (await caldavListChanges(creds, calendarUrl)).events.find((e) => e.id === created.uid)!;
    expect(ev.timed!.start.toISOString()).toBe(moved.startsAt.toISOString());

    await caldavDeleteEvent(creds, { url: created.url, etag: upd.etag });
    const after = (await caldavListChanges(creds, calendarUrl)).events;
    expect(after.some((e) => e.id === created.uid)).toBe(false);
  });
});
