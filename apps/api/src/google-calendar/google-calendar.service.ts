// GoogleCalendarService — OAuth + sync rezervaci do Google Calendare
// (sprint 3.3 fáze C1).
//
// Pouziva direct HTTP calls misto googleapis SDK pro mensi dependency
// footprint. OAuth 2.0 + Calendar API v3 jsou jednoduche REST endpointy.
//
// Env vars:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REDIRECT_URI (napr. https://api.example.cz/api/v1/admin/integrations/google/callback)
//
// Feature flag: 'integrations:google_calendar' (gated check pres FeatureFlagsService).
//
// Bezpecnost: state token pri OAuth flow ma payload { tenantId, employeeId, ts }
// podepsany HMACem. Resp z Googlu verifikujeme + check expiry.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
// Note: feature flag gating via FeatureFlagsService bude pridano az po
// mergi feat/sprint-3.3-phase-d-feature-flags. Zatim je integrace
// otevrena vsem tenantum (vyzaduje GOOGLE_CLIENT_ID env var).

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'email'];

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

interface StatePayload {
  tenantId: string;
  employeeId: string;
  ts: number;
  nonce: string;
}

interface BookingForSync {
  id: string;
  startsAt: Date;
  endsAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  serviceName?: string;
  referenceCode: string;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger('GoogleCalendarService');

  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  private getEnv(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    stateSecret: string;
  } {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const stateSecret = process.env.GOOGLE_STATE_SECRET ?? process.env.JWT_SECRET;
    if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
      throw new BadRequestException({
        error: {
          code: 'GOOGLE_NOT_CONFIGURED',
          message: 'GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI nejsou nastaveny v environment.',
        },
      });
    }
    return { clientId, clientSecret, redirectUri, stateSecret };
  }

  // ─── State token (CSRF + payload pro callback) ─────────────────────

  private encodeState(payload: StatePayload, secret: string): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private decodeState(state: string, secret: string): StatePayload {
    const [body, sig] = state.split('.');
    if (!body || !sig) {
      throw new BadRequestException({
        error: { code: 'INVALID_STATE', message: 'State token je špatně formátovaný.' },
      });
    }
    const expectedSig = createHmac('sha256', secret).update(body).digest('base64url');
    if (
      sig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      throw new BadRequestException({
        error: { code: 'INVALID_STATE_SIG', message: 'State token má neplatný podpis.' },
      });
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
    // 10 minut max
    if (Date.now() - payload.ts > 10 * 60 * 1000) {
      throw new BadRequestException({
        error: { code: 'STATE_EXPIRED', message: 'OAuth flow vypršel. Zkus znovu.' },
      });
    }
    return payload;
  }

  // ─── OAuth flow ────────────────────────────────────────────────────

  /**
   * Start OAuth flow: vrati URL kam redirectovat browser, aby zamestnanec
   * autorizoval pristup ke svemu Google Calendari.
   */
  async startOAuth(
    tenantId: string,
    userId: string,
    role: AppRole,
    employeeId: string,
  ): Promise<{ authUrl: string }> {
    assertCanManage(role);
    const env = this.getEnv();

    // Overeni ze employee patri k tenantu
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [emp] = await tx
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(and(eq(schema.employees.id, employeeId), eq(schema.employees.tenantId, tenantId)))
        .limit(1);
      if (!emp) {
        throw new NotFoundException({
          error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Zaměstnanec nenalezen.' },
        });
      }
    });

    const state = this.encodeState(
      {
        tenantId,
        employeeId,
        ts: Date.now(),
        nonce: randomBytes(8).toString('base64url'),
      },
      env.stateSecret,
    );

    const params = new URLSearchParams({
      client_id: env.clientId,
      redirect_uri: env.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return { authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}` };
  }

  /**
   * OAuth callback: smen code za tokeny + ulozi connection do DB.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{
    tenantId: string;
    employeeId: string;
    googleEmail: string | null;
  }> {
    const env = this.getEnv();
    const payload = this.decodeState(state, env.stateSecret);

    // Exchange code za tokeny
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: env.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new BadRequestException({
        error: { code: 'GOOGLE_TOKEN_EXCHANGE_FAILED', message: err },
      });
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      id_token?: string;
    };

    if (!tokens.refresh_token) {
      throw new BadRequestException({
        error: {
          code: 'NO_REFRESH_TOKEN',
          message: 'Google nevratil refresh_token. Smaž connection a zkus znovu s prompt=consent.',
        },
      });
    }

    // Decoduj id_token (JWT) abychom dostali email Google uctu
    let googleEmail: string | null = null;
    if (tokens.id_token) {
      const parts = tokens.id_token.split('.');
      const idPart = parts[1];
      if (idPart) {
        try {
          const claims = JSON.parse(Buffer.from(idPart, 'base64url').toString('utf8')) as {
            email?: string;
          };
          googleEmail = claims.email ?? null;
        } catch {
          // ignore, email je optional
        }
      }
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await this.dbService.withRlsContext(serviceContext(payload.tenantId), async (tx) => {
      // Pokud uz existuje aktivni connection, revokuj ji nejdriv
      await tx
        .update(schema.googleCalendarConnections)
        .set({ revokedAt: new Date(), isActive: false })
        .where(
          and(
            eq(schema.googleCalendarConnections.tenantId, payload.tenantId),
            eq(schema.googleCalendarConnections.employeeId, payload.employeeId),
            isNull(schema.googleCalendarConnections.revokedAt),
          ),
        );

      await tx.insert(schema.googleCalendarConnections).values({
        tenantId: payload.tenantId,
        employeeId: payload.employeeId,
        refreshToken: tokens.refresh_token!,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: expiresAt,
        googleEmail,
        calendarId: 'primary',
        isActive: true,
      });
    });

    return {
      tenantId: payload.tenantId,
      employeeId: payload.employeeId,
      googleEmail,
    };
  }

  /**
   * Revokuj connection (zamestnanec odpoji svuj Google ucet).
   */
  async revoke(tenantId: string, userId: string, role: AppRole, employeeId: string): Promise<void> {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.googleCalendarConnections)
        .set({ revokedAt: new Date(), isActive: false })
        .where(
          and(
            eq(schema.googleCalendarConnections.tenantId, tenantId),
            eq(schema.googleCalendarConnections.employeeId, employeeId),
            isNull(schema.googleCalendarConnections.revokedAt),
          ),
        );
    });
  }

  async listConnections(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select({
          id: schema.googleCalendarConnections.id,
          employeeId: schema.googleCalendarConnections.employeeId,
          googleEmail: schema.googleCalendarConnections.googleEmail,
          calendarId: schema.googleCalendarConnections.calendarId,
          isActive: schema.googleCalendarConnections.isActive,
          lastSyncedAt: schema.googleCalendarConnections.lastSyncedAt,
          lastSyncError: schema.googleCalendarConnections.lastSyncError,
          consecutiveErrors: schema.googleCalendarConnections.consecutiveErrors,
          revokedAt: schema.googleCalendarConnections.revokedAt,
          createdAt: schema.googleCalendarConnections.createdAt,
        })
        .from(schema.googleCalendarConnections)
        .where(eq(schema.googleCalendarConnections.tenantId, tenantId));
    });
  }

  // ─── Token refresh ─────────────────────────────────────────────────

  private async getValidAccessToken(connectionId: string): Promise<string> {
    return this.dbService.withRlsContext(
      serviceContext('00000000-0000-0000-0000-000000000000'),
      async (tx) => {
        const [conn] = await tx
          .select()
          .from(schema.googleCalendarConnections)
          .where(eq(schema.googleCalendarConnections.id, connectionId))
          .limit(1);
        if (!conn) {
          throw new Error('Connection not found');
        }

        // Pokud expiruje za < 60s, refreshni
        const expiresAt = conn.accessTokenExpiresAt;
        if (!expiresAt || expiresAt.getTime() - Date.now() < 60_000) {
          const env = this.getEnv();
          const res = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: env.clientId,
              client_secret: env.clientSecret,
              refresh_token: conn.refreshToken,
              grant_type: 'refresh_token',
            }).toString(),
          });
          if (!res.ok) {
            const err = await res.text();
            throw new Error(`Token refresh failed: ${err}`);
          }
          const tokens = (await res.json()) as { access_token: string; expires_in: number };
          const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
          await tx
            .update(schema.googleCalendarConnections)
            .set({
              accessToken: tokens.access_token,
              accessTokenExpiresAt: newExpiresAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.googleCalendarConnections.id, conn.id));
          return tokens.access_token;
        }

        return conn.accessToken!;
      },
    );
  }

  // ─── Sync helpers (volaji se z BookingsService) ────────────────────

  /**
   * Vytvori event v Google Calendari po vytvoreni booking.
   * Idempotentni (skip pokud uz link existuje).
   * Selhani nezpusobi vyjimku — neblokuje booking flow.
   */
  async syncBookingCreated(input: {
    tenantId: string;
    bookingId: string;
    employeeId: string;
    booking: BookingForSync;
  }): Promise<void> {
    try {
      await this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
        const [conn] = await tx
          .select()
          .from(schema.googleCalendarConnections)
          .where(
            and(
              eq(schema.googleCalendarConnections.tenantId, input.tenantId),
              eq(schema.googleCalendarConnections.employeeId, input.employeeId),
              eq(schema.googleCalendarConnections.isActive, true),
              isNull(schema.googleCalendarConnections.revokedAt),
            ),
          )
          .limit(1);
        if (!conn) return;

        // Skip pokud link uz existuje (idempotence)
        const [existing] = await tx
          .select({ id: schema.googleCalendarEventLinks.id })
          .from(schema.googleCalendarEventLinks)
          .where(
            and(
              eq(schema.googleCalendarEventLinks.connectionId, conn.id),
              eq(schema.googleCalendarEventLinks.bookingId, input.bookingId),
            ),
          )
          .limit(1);
        if (existing) return;

        const accessToken = await this.getValidAccessToken(conn.id);
        const eventRes = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(conn.calendarId)}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              summary: `${input.booking.serviceName ?? 'Rezervace'}: ${input.booking.customerName}`,
              description: [
                `Reference: ${input.booking.referenceCode}`,
                `Kontakt: ${input.booking.customerEmail}`,
                input.booking.customerPhone ? `Telefon: ${input.booking.customerPhone}` : null,
              ]
                .filter(Boolean)
                .join('\n'),
              start: { dateTime: input.booking.startsAt.toISOString() },
              end: { dateTime: input.booking.endsAt.toISOString() },
              extendedProperties: {
                private: {
                  reservedBookingId: input.bookingId,
                  reservedReferenceCode: input.booking.referenceCode,
                },
              },
            }),
          },
        );
        if (!eventRes.ok) {
          const errBody = await eventRes.text();
          throw new Error(`Google Calendar API error: ${errBody}`);
        }
        const event = (await eventRes.json()) as { id: string };

        await tx.insert(schema.googleCalendarEventLinks).values({
          tenantId: input.tenantId,
          connectionId: conn.id,
          bookingId: input.bookingId,
          googleEventId: event.id,
        });

        await tx
          .update(schema.googleCalendarConnections)
          .set({
            lastSyncedAt: new Date(),
            lastSyncError: null,
            consecutiveErrors: '0',
          })
          .where(eq(schema.googleCalendarConnections.id, conn.id));
      });
    } catch (err) {
      this.logger.error(`Google sync failed: ${err instanceof Error ? err.message : err}`);
      await this.recordSyncError(input.tenantId, input.employeeId, err);
    }
  }

  /**
   * Smaze event v Google Calendari po cancel/reschedule booking.
   */
  async syncBookingCancelled(input: { tenantId: string; bookingId: string }): Promise<void> {
    try {
      await this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
        const links = await tx
          .select()
          .from(schema.googleCalendarEventLinks)
          .where(
            and(
              eq(schema.googleCalendarEventLinks.tenantId, input.tenantId),
              eq(schema.googleCalendarEventLinks.bookingId, input.bookingId),
            ),
          );
        for (const link of links) {
          const [conn] = await tx
            .select()
            .from(schema.googleCalendarConnections)
            .where(eq(schema.googleCalendarConnections.id, link.connectionId))
            .limit(1);
          if (!conn || !conn.isActive) continue;
          const accessToken = await this.getValidAccessToken(conn.id);
          await fetch(
            `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(conn.calendarId)}/events/${link.googleEventId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          // Smaz link bez ohledu na vysledek (i 404 OK = uz neexistuje)
          await tx
            .delete(schema.googleCalendarEventLinks)
            .where(eq(schema.googleCalendarEventLinks.id, link.id));
        }
      });
    } catch (err) {
      this.logger.error(`Google delete sync failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async recordSyncError(tenantId: string, employeeId: string, err: unknown): Promise<void> {
    try {
      await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
        const [conn] = await tx
          .select({
            id: schema.googleCalendarConnections.id,
            consecutiveErrors: schema.googleCalendarConnections.consecutiveErrors,
          })
          .from(schema.googleCalendarConnections)
          .where(
            and(
              eq(schema.googleCalendarConnections.tenantId, tenantId),
              eq(schema.googleCalendarConnections.employeeId, employeeId),
              isNull(schema.googleCalendarConnections.revokedAt),
            ),
          )
          .limit(1);
        if (!conn) return;
        const newCount = Number(conn.consecutiveErrors) + 1;
        // Po 5 chybach automaticky pozastav sync (vyzaduje admin akci)
        await tx
          .update(schema.googleCalendarConnections)
          .set({
            lastSyncError:
              err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
            consecutiveErrors: String(newCount),
            isActive: newCount >= 5 ? false : true,
            updatedAt: new Date(),
          })
          .where(eq(schema.googleCalendarConnections.id, conn.id));
      });
    } catch {
      // ignore — pokud zapis erroru selze, neni co delat
    }
  }
}
