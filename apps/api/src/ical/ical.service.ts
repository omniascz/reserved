// IcalService — iCal (.ics) feed pro zaměstnance (sprint 10.14).
//
// Standardní formát iCalendar → kalendář (Outlook, Apple, Google) si feed
// "přihlásí" přes URL a vidí termíny zaměstnance. Tím pokrýváme "Outlook sync"
// univerzálním standardem bez nutnosti Outlook OAuth.
//
// URL je chráněná HMAC podpisem (token nese tenantId+employeeId, podepsáno
// JWT_SECRET) — nepotřebuje přihlášení, ale nejde uhodnout/podvrhnout.

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, between, eq, sql } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}
function fromB64url(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8');
}

@Injectable()
export class IcalService {
  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  private secret(): string {
    return process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me-1234567890';
  }

  /** Podepíše token nesoucí tenantId+employeeId. */
  signToken(tenantId: string, employeeId: string): string {
    const payload = b64url(`${tenantId}.${employeeId}`);
    const sig = createHmac('sha256', this.secret())
      .update(payload)
      .digest('base64url')
      .slice(0, 32);
    return `${payload}.${sig}`;
  }

  /** Ověří token; vrátí null při neplatném podpisu nebo formátu. */
  verifyToken(token: string): { tenantId: string; employeeId: string } | null {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac('sha256', this.secret())
      .update(payload)
      .digest('base64url')
      .slice(0, 32);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = fromB64url(payload);
    const sep = decoded.indexOf('.');
    if (sep <= 0) return null;
    return { tenantId: decoded.slice(0, sep), employeeId: decoded.slice(sep + 1) };
  }

  /** Veřejná subscription URL pro daný feed. */
  feedUrl(slug: string, tenantId: string, employeeId: string): string {
    const base = process.env.API_URL ?? 'http://localhost:4000';
    const token = this.signToken(tenantId, employeeId);
    return `${base}/api/v1/public/${slug}/ical/${token}`;
  }

  /** Admin: ověří zaměstnance v tenantovi a vrátí jeho subscription URL. */
  async buildFeedUrlForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<{ url: string; token: string }> {
    const found = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [emp] = await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .limit(1);
      const [tenant] = await tx
        .select({ slug: schema.tenants.slug })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      return emp && tenant ? { slug: tenant.slug } : null;
    });
    if (!found) {
      throw new NotFoundException({
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
      });
    }
    return {
      url: this.feedUrl(found.slug, tenantId, employeeId),
      token: this.signToken(tenantId, employeeId),
    };
  }

  /** Vygeneruje .ics obsah pro zaměstnance (z tokenu). */
  async generateForToken(token: string): Promise<string> {
    const decoded = this.verifyToken(token);
    if (!decoded) {
      throw new NotFoundException({
        error: { code: 'INVALID_FEED_TOKEN', message: 'Neplatný odkaz na kalendář.' },
      });
    }
    const { tenantId, employeeId } = decoded;

    const now = new Date();
    const from = new Date(now.getTime() - 7 * 86_400_000); // týden zpět
    const to = new Date(now.getTime() + 180 * 86_400_000); // půl roku dopředu

    const rows = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      return tx
        .select({
          id: schema.bookings.id,
          startsAt: schema.bookings.startsAt,
          endsAt: schema.bookings.endsAt,
          status: schema.bookings.status,
          customerName: schema.bookings.customerName,
          referenceCode: schema.bookings.referenceCode,
          onlineMeetingUrl: schema.bookings.onlineMeetingUrl,
          updatedAt: schema.bookings.updatedAt,
          serviceName: schema.services.name,
        })
        .from(schema.bookings)
        .leftJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
        .where(
          and(
            eq(schema.bookings.tenantId, tenantId),
            eq(schema.bookings.employeeId, employeeId),
            between(schema.bookings.startsAt, from, to),
            sql`${schema.bookings.status} <> 'no_show'`,
          ),
        )
        .orderBy(schema.bookings.startsAt);
    });

    return this.buildIcs(employeeId, rows);
  }

  private buildIcs(
    employeeId: string,
    rows: Array<{
      id: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
      customerName: string;
      referenceCode: string;
      onlineMeetingUrl: string | null;
      updatedAt: Date;
      serviceName: string | null;
    }>,
  ): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Reserved//Booking//CS',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Reserved — ${employeeId.slice(0, 8)}`,
    ];
    for (const r of rows) {
      const summary = `${r.serviceName ?? 'Rezervace'} — ${r.customerName}`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${r.id}@reserved`);
      lines.push(`DTSTAMP:${this.fmt(r.updatedAt)}`);
      lines.push(`DTSTART:${this.fmt(r.startsAt)}`);
      lines.push(`DTEND:${this.fmt(r.endsAt)}`);
      lines.push(`SUMMARY:${this.esc(summary)}`);
      lines.push(`STATUS:${r.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
      const desc = [
        `Kód: ${r.referenceCode}`,
        r.onlineMeetingUrl ? `Video: ${r.onlineMeetingUrl}` : null,
      ]
        .filter(Boolean)
        .join('\n');
      if (desc) lines.push(`DESCRIPTION:${this.esc(desc)}`);
      if (r.onlineMeetingUrl) lines.push(`URL:${this.esc(r.onlineMeetingUrl)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    // iCal vyžaduje CRLF.
    return lines.join('\r\n') + '\r\n';
  }

  /** UTC datum → iCal formát YYYYMMDDTHHMMSSZ. */
  private fmt(d: Date): string {
    return d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z');
  }

  private esc(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
}
