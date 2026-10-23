// CalendarSyncService — jediné místo, přes které API mluví s kalendáři
// zaměstnanců (Google, Outlook, CalDAV).
//
//   - zápis rezervací ven (vytvoření / přesun / storno) — nikdy nehází,
//     chyba kalendáře nesmí shodit rezervaci
//   - push notifikace od Googlu / Microsoftu → synchronizace hned
//   - připojení Outlooku (OAuth) a CalDAV (adresa + jméno + heslo)
//   - správa připojení v administraci
//
// Samotná logika synchronizace je v balíčku @reserved/calendar-sync (sdílí
// ji worker, který stahuje změny pravidelně).

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import {
  caldavListCalendars,
  encryptCredentials,
  markGoogleNeedsSync,
  markOutlookNeedsSync,
  outlookAuthorizeUrl,
  outlookDeleteSubscription,
  outlookExchangeCode,
  outlookMe,
  pushBookingCancelled,
  pushBookingCreated,
  pushBookingRescheduled,
  readCredentials,
  syncGenericConnection,
  syncGoogleConnection,
  type BookingForCalendar,
  type InboundResult,
  type OutlookTokens,
  type SyncDeps,
} from '@reserved/calendar-sync';
import { DbService } from '../db/db.service.js';
import { GoogleCalendarService } from '../google-calendar/google-calendar.service.js';
import { CalendarConfig } from './calendar.config.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat integrace.',
      },
    });
  }
}

type Booking = typeof schema.bookings.$inferSelect;

/** Údaje připojení pro administraci — NIKDY s přístupy. */
const PUBLIC_COLUMNS = {
  id: schema.calendarConnections.id,
  employeeId: schema.calendarConnections.employeeId,
  provider: schema.calendarConnections.provider,
  accountEmail: schema.calendarConnections.accountEmail,
  calendarName: schema.calendarConnections.calendarName,
  isActive: schema.calendarConnections.isActive,
  inboundSyncEnabled: schema.calendarConnections.inboundSyncEnabled,
  outboundEnabled: schema.calendarConnections.outboundEnabled,
  lastInboundSyncAt: schema.calendarConnections.lastInboundSyncAt,
  lastSyncError: schema.calendarConnections.lastSyncError,
  consecutiveErrors: schema.calendarConnections.consecutiveErrors,
  subscriptionExpiresAt: schema.calendarConnections.subscriptionExpiresAt,
  createdAt: schema.calendarConnections.createdAt,
};

@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger('CalendarSync');

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CalendarConfig) private readonly config: CalendarConfig,
    @Inject(GoogleCalendarService) private readonly google: GoogleCalendarService,
  ) {}

  private deps(): SyncDeps {
    return {
      db: this.dbService.db,
      cfg: this.config.sync,
      log: (m) => this.logger.warn(m),
    };
  }

  private async serviceName(tenantId: string, serviceId: string): Promise<string | null> {
    const [svc] = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select({ name: schema.services.name })
        .from(schema.services)
        .where(eq(schema.services.id, serviceId))
        .limit(1),
    );
    return svc?.name ?? null;
  }

  private async forCalendar(tenantId: string, b: Booking): Promise<BookingForCalendar> {
    return {
      id: b.id,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      customerPhone: b.customerPhone,
      serviceName: await this.serviceName(tenantId, b.serviceId),
      referenceCode: b.referenceCode,
    };
  }

  private async guard(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`${what}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ─── Zápis rezervací ven (fire-and-forget) ────────────────────────────

  async bookingCreated(tenantId: string, booking: Booking): Promise<void> {
    if (!booking.employeeId) return;
    const employeeId = booking.employeeId;
    await this.guard('Kalendáře: vytvoření', async () => {
      const b = await this.forCalendar(tenantId, booking);
      await this.guard('Google create', () =>
        this.google.syncBookingCreated({
          tenantId,
          bookingId: booking.id,
          employeeId,
          booking: { ...b, serviceName: b.serviceName ?? undefined },
        }),
      );
      await this.guard('Outlook/CalDAV create', () =>
        pushBookingCreated(this.deps(), { tenantId, employeeId, booking: b }),
      );
    });
  }

  async bookingRescheduled(tenantId: string, booking: Booking): Promise<void> {
    await this.guard('Google reschedule', () =>
      this.google.syncRescheduledBooking(tenantId, booking),
    );
    await this.guard('Outlook/CalDAV reschedule', async () => {
      const b = await this.forCalendar(tenantId, booking);
      await pushBookingRescheduled(this.deps(), {
        tenantId,
        employeeId: booking.employeeId,
        booking: b,
      });
    });
  }

  async bookingCancelled(tenantId: string, bookingId: string): Promise<void> {
    await this.guard('Google cancel', () =>
      this.google.syncBookingCancelled({ tenantId, bookingId }),
    );
    await this.guard('Outlook/CalDAV cancel', () =>
      pushBookingCancelled(this.deps(), { tenantId, bookingId }),
    );
  }

  // ─── Push notifikace ──────────────────────────────────────────────────

  /** Google: kanál něco hlásí. 'sync' je jen potvrzení založení kanálu. */
  async googlePush(channelId: string, token: string, state: string): Promise<void> {
    if (!channelId || !token || state === 'sync') return;
    const connId = await markGoogleNeedsSync(
      this.dbService.db,
      this.config.sync.pushSecret ?? '',
      channelId,
      token,
    );
    if (connId) {
      void this.guard('Google push sync', async () => {
        await syncGoogleConnection(this.deps(), connId);
      });
    }
  }

  /** Outlook: notifikace o změně (ověřená přes clientState). */
  async outlookNotify(
    items: Array<{ subscriptionId?: string; clientState?: string }>,
  ): Promise<void> {
    for (const n of items) {
      if (!n.subscriptionId || !n.clientState) continue;
      const connId = await markOutlookNeedsSync(
        this.dbService.db,
        this.config.sync.pushSecret ?? '',
        n.subscriptionId,
        n.clientState,
      );
      if (connId) {
        void this.guard('Outlook push sync', async () => {
          await syncGenericConnection(this.deps(), connId);
        });
      }
    }
  }

  // ─── Outlook: OAuth ───────────────────────────────────────────────────

  private signState(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.config.stateSecret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private readState(state: string): { tenantId: string; employeeId: string; ts: number } {
    const [body, sig] = state.split('.');
    const expected = body
      ? createHmac('sha256', this.config.stateSecret).update(body).digest('base64url')
      : '';
    if (
      !body ||
      !sig ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      throw new BadRequestException({
        error: { code: 'INVALID_STATE', message: 'Neplatný state.' },
      });
    }
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (Date.now() - p.ts > 10 * 60_000) {
      throw new BadRequestException({
        error: { code: 'STATE_EXPIRED', message: 'Přihlášení vypršelo, zkus to znovu.' },
      });
    }
    return p;
  }

  private async assertEmployee(
    tenantId: string,
    userId: string,
    role: AppRole,
    employeeId: string,
  ) {
    const [emp] = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), (tx) =>
      tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .limit(1),
    );
    if (!emp) {
      throw new NotFoundException({
        error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
      });
    }
  }

  async outlookStart(tenantId: string, userId: string, role: AppRole, employeeId: string) {
    assertCanManage(role);
    if (!this.config.sync.microsoft) {
      throw new BadRequestException({
        error: {
          code: 'MICROSOFT_NOT_CONFIGURED',
          message: 'MICROSOFT_CLIENT_ID/SECRET nejsou nastavené.',
        },
      });
    }
    await this.assertEmployee(tenantId, userId, role, employeeId);
    const state = this.signState({
      tenantId,
      employeeId,
      ts: Date.now(),
      nonce: randomBytes(8).toString('base64url'),
    });
    return { authUrl: outlookAuthorizeUrl(this.config.sync, state) };
  }

  /** Odpojí dřívější připojení stejného druhu u zaměstnance (i jeho bloky). */
  private async revokeExisting(
    tenantId: string,
    employeeId: string,
    provider: 'outlook' | 'caldav',
  ) {
    const old = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select({ id: schema.calendarConnections.id })
        .from(schema.calendarConnections)
        .where(
          and(
            eq(schema.calendarConnections.tenantId, tenantId),
            eq(schema.calendarConnections.employeeId, employeeId),
            eq(schema.calendarConnections.provider, provider),
            isNull(schema.calendarConnections.revokedAt),
          ),
        ),
    );
    for (const c of old) await this.revokeConnection(tenantId, c.id);
  }

  async outlookCallback(code: string, state: string) {
    const p = this.readState(state);
    const tokens = await outlookExchangeCode(this.config.sync, code);
    const me = await outlookMe(this.config.sync, tokens.accessToken);
    await this.revokeExisting(p.tenantId, p.employeeId, 'outlook');
    await this.dbService.withRlsContext(serviceContext(p.tenantId), (tx) =>
      tx.insert(schema.calendarConnections).values({
        tenantId: p.tenantId,
        employeeId: p.employeeId,
        provider: 'outlook',
        accountEmail: me.email,
        calendarName: 'Kalendář',
        credentials: encryptCredentials(this.config.sync, { ...tokens }),
        needsSync: true,
      }),
    );
    return { tenantId: p.tenantId, employeeId: p.employeeId, email: me.email };
  }

  // ─── CalDAV: připojení ────────────────────────────────────────────────

  async caldavConnect(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: {
      employeeId: string;
      serverUrl: string;
      username: string;
      password: string;
      calendarUrl?: string;
    },
  ) {
    assertCanManage(role);
    await this.assertEmployee(tenantId, userId, role, input.employeeId);
    const creds = {
      serverUrl: input.serverUrl,
      username: input.username,
      password: input.password,
    };
    let calendars: Array<{ url: string; name: string }>;
    try {
      calendars = await caldavListCalendars(creds);
    } catch (err) {
      throw new BadRequestException({
        error: {
          code: 'CALDAV_CONNECT_FAILED',
          message:
            `Ke kalendáři se nepodařilo připojit — zkontroluj adresu, jméno a heslo (u Apple heslo pro aplikace). ${err instanceof Error ? err.message : ''}`.trim(),
        },
      });
    }
    if (calendars.length === 0) {
      throw new BadRequestException({
        error: { code: 'CALDAV_NO_CALENDAR', message: 'Účet nemá žádný kalendář s událostmi.' },
      });
    }
    const chosen = input.calendarUrl
      ? calendars.find(
          (c) =>
            c.url === input.calendarUrl ||
            c.url.endsWith(new URL(input.calendarUrl!, input.serverUrl).pathname),
        )
      : calendars[0];
    if (!chosen) {
      throw new BadRequestException({
        error: { code: 'CALDAV_CALENDAR_NOT_FOUND', message: 'Zvolený kalendář v účtu není.' },
      });
    }
    const calendarRef = new URL(chosen.url, input.serverUrl).toString();
    await this.revokeExisting(tenantId, input.employeeId, 'caldav');
    const [row] = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .insert(schema.calendarConnections)
        .values({
          tenantId,
          employeeId: input.employeeId,
          provider: 'caldav',
          accountEmail: input.username,
          calendarRef,
          calendarName: chosen.name,
          credentials: encryptCredentials(this.config.sync, creds),
          needsSync: true,
        })
        .returning({ id: schema.calendarConnections.id }),
    );
    return { id: row!.id, calendarName: chosen.name, calendars };
  }

  // ─── Správa připojení ─────────────────────────────────────────────────

  async list(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), (tx) =>
      tx
        .select(PUBLIC_COLUMNS)
        .from(schema.calendarConnections)
        .where(
          and(
            eq(schema.calendarConnections.tenantId, tenantId),
            isNull(schema.calendarConnections.revokedAt),
          ),
        ),
    );
  }

  private async load(tenantId: string, id: string) {
    const [conn] = await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .select()
        .from(schema.calendarConnections)
        .where(
          and(
            eq(schema.calendarConnections.id, id),
            eq(schema.calendarConnections.tenantId, tenantId),
          ),
        )
        .limit(1),
    );
    if (!conn || conn.revokedAt) {
      throw new NotFoundException({
        error: { code: 'CONNECTION_NOT_FOUND', message: 'Připojení nenalezeno.' },
      });
    }
    return conn;
  }

  async update(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    patch: { inboundSyncEnabled?: boolean; outboundEnabled?: boolean; isActive?: boolean },
  ) {
    assertCanManage(role);
    const conn = await this.load(tenantId, id);
    const reactivate = patch.isActive === true && !conn.isActive;
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), (tx) =>
      tx
        .update(schema.calendarConnections)
        .set({
          ...patch,
          ...(reactivate && { consecutiveErrors: 0, lastSyncError: null }),
          ...(patch.inboundSyncEnabled === true && { needsSync: true, syncCursor: null }),
          updatedAt: new Date(),
        })
        .where(eq(schema.calendarConnections.id, id)),
    );
    if (patch.inboundSyncEnabled === false) await this.removeInboundBlocks(tenantId, id);
  }

  async syncNow(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
  ): Promise<InboundResult> {
    assertCanManage(role);
    await this.load(tenantId, id);
    try {
      return await syncGenericConnection(this.deps(), id);
    } catch (err) {
      throw new BadRequestException({
        error: {
          code: 'CALENDAR_SYNC_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  async revoke(tenantId: string, userId: string, role: AppRole, id: string): Promise<void> {
    assertCanManage(role);
    await this.load(tenantId, id);
    await this.revokeConnection(tenantId, id);
  }

  /** Bloky z odpojeného kalendáře už nemají co blokovat. */
  private async removeInboundBlocks(tenantId: string, connectionId: string) {
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const rows = await tx
        .select({ blockId: schema.calendarInboundEvents.blockId })
        .from(schema.calendarInboundEvents)
        .where(eq(schema.calendarInboundEvents.connectionId, connectionId));
      if (rows.length > 0) {
        await tx.delete(schema.availabilityBlocks).where(
          and(
            eq(schema.availabilityBlocks.tenantId, tenantId),
            inArray(
              schema.availabilityBlocks.id,
              rows.map((r) => r.blockId),
            ),
          ),
        );
      }
    });
  }

  private async revokeConnection(tenantId: string, id: string) {
    const conn = await this.load(tenantId, id).catch(() => null);
    if (!conn) return;
    if (conn.provider === 'outlook' && conn.subscriptionId) {
      await this.guard('Outlook unsubscribe', async () => {
        const creds = readCredentials<OutlookTokens>(this.config.sync, conn);
        await outlookDeleteSubscription(this.config.sync, creds.accessToken, conn.subscriptionId!);
      });
    }
    await this.removeInboundBlocks(tenantId, id);
    await this.dbService.withRlsContext(serviceContext(tenantId), (tx) =>
      tx
        .update(schema.calendarConnections)
        .set({ revokedAt: new Date(), isActive: false, credentials: {}, updatedAt: new Date() })
        .where(eq(schema.calendarConnections.id, id)),
    );
  }
}
