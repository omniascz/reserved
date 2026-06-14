// DepositsService — platby koncových klientů: Connect + zálohy + dynamická
// záloha dle no-show rizika (sprint 10.29, P1–P3).
//
// P1: tenant propojí provider (Connect Standard, 0 % fee). Mock = aktivní hned
//     (dev/test); stripe/gopay = pending (reálný OAuth onboarding doplnit s klíči).
// P2: quoteDeposit počítá zálohu z services.deposit_percent.
// P3: dynamicDepositByRisk → zálohu vyžaduj JEN u rizikových (no-show high).
// collectDeposit vytvoří checkout (přes existující PaymentsService) na zálohu.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { NoShowRiskService } from '../customers/no-show-risk.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { extractBookingRules } from '../settings/settings.types.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];
type ProviderType = 'stripe' | 'gopay' | 'mock' | 'comgate' | 'thepay' | 'payu' | 'gpwebpay';

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}
function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Nedostatečná oprávnění.' },
    });
  }
}

@Injectable()
export class DepositsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(NoShowRiskService) private readonly noShowRisk: NoShowRiskService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  // ─── P1: Connect ─────────────────────────────────────────────────────

  async connectStart(tenantId: string, userId: string, role: AppRole, provider: ProviderType) {
    assertCanManage(role);
    const active = provider === 'mock'; // mock = připraveno hned; reálné brány = pending (OAuth onboarding)
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.paymentConnections)
        .where(
          and(
            eq(schema.paymentConnections.tenantId, tenantId),
            eq(schema.paymentConnections.provider, provider),
          ),
        )
        .limit(1);

      const values = {
        status: active ? 'active' : 'pending',
        chargesEnabled: active,
        accountId: provider === 'mock' ? 'mock_acct' : (existing?.accountId ?? null),
        updatedAt: new Date(),
      };
      let connection;
      if (existing) {
        [connection] = await tx
          .update(schema.paymentConnections)
          .set(values)
          .where(eq(schema.paymentConnections.id, existing.id))
          .returning();
      } else {
        [connection] = await tx
          .insert(schema.paymentConnections)
          .values({ tenantId, provider, ...values })
          .returning();
      }

      // Propojení = zapnutí platební metody pro tenanta.
      const [m] = await tx
        .select({ id: schema.paymentMethods.id })
        .from(schema.paymentMethods)
        .where(
          and(
            eq(schema.paymentMethods.tenantId, tenantId),
            eq(schema.paymentMethods.methodType, provider),
          ),
        )
        .limit(1);
      if (m) {
        await tx
          .update(schema.paymentMethods)
          .set({ isEnabled: active, updatedAt: new Date() })
          .where(eq(schema.paymentMethods.id, m.id));
      } else {
        await tx
          .insert(schema.paymentMethods)
          .values({ tenantId, methodType: provider, isEnabled: active, config: {} });
      }

      return {
        provider,
        status: connection!.status,
        chargesEnabled: connection!.chargesEnabled,
        onboardingNote: active
          ? null
          : 'Dokončete propojení účtu u providera (OAuth onboarding) — vyžaduje produkční klíče.',
      };
    });
  }

  async connectStatus(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select({
          provider: schema.paymentConnections.provider,
          status: schema.paymentConnections.status,
          chargesEnabled: schema.paymentConnections.chargesEnabled,
        })
        .from(schema.paymentConnections)
        .where(eq(schema.paymentConnections.tenantId, tenantId));
    });
  }

  // ─── P2 + P3: kalkulace zálohy ───────────────────────────────────────

  async quoteDeposit(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: { serviceId: string; customerId?: string },
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [service] = await tx
        .select({
          depositPercent: schema.services.depositPercent,
          priceHellers: schema.services.priceHellers,
          currency: schema.services.currency,
        })
        .from(schema.services)
        .where(and(eq(schema.services.id, input.serviceId), eq(schema.services.tenantId, tenantId)))
        .limit(1);
      if (!service) {
        throw new NotFoundException({
          error: { code: 'SERVICE_NOT_FOUND', message: 'Služba nenalezena.' },
        });
      }
      const base = service.depositPercent ?? 0;
      const none = {
        requiresDeposit: false,
        depositPercent: base,
        depositHellers: 0,
        currency: service.currency,
      };
      if (base <= 0) return none;

      const [t] = await tx
        .select({ settings: schema.tenants.settings })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      const rules = extractBookingRules(t?.settings);

      let riskLevel: string | undefined;
      if (rules.dynamicDepositByRisk) {
        if (input.customerId) {
          const risk = await this.noShowRisk.computeForCustomer(
            tenantId,
            userId,
            role,
            input.customerId,
          );
          riskLevel = risk.level;
        } else {
          riskLevel = 'medium'; // nový klient bez historie
        }
        if (riskLevel !== 'high') return { ...none, riskLevel };
      }

      return {
        requiresDeposit: true,
        depositPercent: base,
        depositHellers: Math.round((service.priceHellers * base) / 100),
        currency: service.currency,
        riskLevel,
      };
    });
  }

  // ─── collectDeposit: vytvoří checkout na zálohu ──────────────────────

  async collectDeposit(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: { bookingId: string; methodType: ProviderType },
  ) {
    assertCanManage(role);
    const booking = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [b] = await tx
          .select({
            id: schema.bookings.id,
            serviceId: schema.bookings.serviceId,
            customerId: schema.bookings.customerId,
            customerEmail: schema.bookings.customerEmail,
            referenceCode: schema.bookings.referenceCode,
            currency: schema.bookings.currency,
          })
          .from(schema.bookings)
          .where(
            and(eq(schema.bookings.id, input.bookingId), eq(schema.bookings.tenantId, tenantId)),
          )
          .limit(1);
        return b;
      },
    );
    if (!booking) {
      throw new NotFoundException({
        error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
      });
    }

    const quote = await this.quoteDeposit(tenantId, userId, role, {
      serviceId: booking.serviceId,
      customerId: booking.customerId ?? undefined,
    });
    if (!quote.requiresDeposit) {
      return { requiresDeposit: false as const };
    }

    // Gate: provider musí být propojený (Connect aktivní).
    const connected = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [c] = await tx
          .select({ chargesEnabled: schema.paymentConnections.chargesEnabled })
          .from(schema.paymentConnections)
          .where(
            and(
              eq(schema.paymentConnections.tenantId, tenantId),
              eq(schema.paymentConnections.provider, input.methodType),
              eq(schema.paymentConnections.status, 'active'),
            ),
          )
          .limit(1);
        return c?.chargesEnabled ?? false;
      },
    );
    if (!connected) {
      throw new BadRequestException({
        error: {
          code: 'PAYMENTS_NOT_CONNECTED',
          message: 'Pro výběr zálohy nejdřív propojte platební účet.',
        },
      });
    }

    const base = process.env.APP_URL ?? 'http://localhost:4002';
    const checkout = await this.payments.createCheckout({
      tenantId,
      role,
      methodType: input.methodType,
      amountHellers: quote.depositHellers,
      currency: booking.currency,
      description: `Záloha — rezervace ${booking.referenceCode}`,
      customerId: booking.customerId ?? undefined,
      customerEmail: booking.customerEmail,
      bookingId: booking.id,
      successUrl: `${base}/payment/success`,
      cancelUrl: `${base}/payment/cancel`,
    });

    return {
      requiresDeposit: true as const,
      depositHellers: quote.depositHellers,
      paymentId: checkout.paymentId,
      checkoutUrl: checkout.checkoutUrl,
    };
  }

  // ─── Pay-per-slot: plná platba za rezervaci předem ───────────────────

  /**
   * Vybere PLNOU cenu služby předem (privátní posilovna na sloty apod.).
   * Na rozdíl od zálohy účtuje 100 % ceny služby. Provider musí být propojený.
   */
  async collectFullPayment(
    tenantId: string,
    userId: string,
    role: AppRole,
    input: { bookingId: string; methodType: ProviderType },
  ) {
    assertCanManage(role);
    const data = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [b] = await tx
        .select({
          id: schema.bookings.id,
          serviceId: schema.bookings.serviceId,
          customerId: schema.bookings.customerId,
          customerEmail: schema.bookings.customerEmail,
          referenceCode: schema.bookings.referenceCode,
          currency: schema.bookings.currency,
        })
        .from(schema.bookings)
        .where(and(eq(schema.bookings.id, input.bookingId), eq(schema.bookings.tenantId, tenantId)))
        .limit(1);
      if (!b) return null;
      const [s] = await tx
        .select({ priceHellers: schema.services.priceHellers })
        .from(schema.services)
        .where(and(eq(schema.services.id, b.serviceId), eq(schema.services.tenantId, tenantId)))
        .limit(1);
      return { booking: b, priceHellers: s?.priceHellers ?? 0 };
    });
    if (!data) {
      throw new NotFoundException({
        error: { code: 'BOOKING_NOT_FOUND', message: 'Rezervace nenalezena.' },
      });
    }
    if (data.priceHellers <= 0) {
      throw new BadRequestException({
        error: { code: 'ZERO_PRICE', message: 'Služba nemá cenu k úhradě.' },
      });
    }

    // Gate: provider musí být propojený (Connect aktivní).
    const connected = await this.dbService.withRlsContext(
      ctxFor(tenantId, userId, role),
      async (tx) => {
        const [c] = await tx
          .select({ chargesEnabled: schema.paymentConnections.chargesEnabled })
          .from(schema.paymentConnections)
          .where(
            and(
              eq(schema.paymentConnections.tenantId, tenantId),
              eq(schema.paymentConnections.provider, input.methodType),
              eq(schema.paymentConnections.status, 'active'),
            ),
          )
          .limit(1);
        return c?.chargesEnabled ?? false;
      },
    );
    if (!connected) {
      throw new BadRequestException({
        error: {
          code: 'PAYMENTS_NOT_CONNECTED',
          message: 'Pro platbu nejdřív propojte platební účet.',
        },
      });
    }

    const base = process.env.APP_URL ?? 'http://localhost:4002';
    const checkout = await this.payments.createCheckout({
      tenantId,
      role,
      methodType: input.methodType,
      amountHellers: data.priceHellers,
      currency: data.booking.currency,
      description: `Platba za rezervaci ${data.booking.referenceCode}`,
      customerId: data.booking.customerId ?? undefined,
      customerEmail: data.booking.customerEmail,
      bookingId: data.booking.id,
      successUrl: `${base}/payment/success`,
      cancelUrl: `${base}/payment/cancel`,
    });

    return {
      amountHellers: data.priceHellers,
      paymentId: checkout.paymentId,
      checkoutUrl: checkout.checkoutUrl,
    };
  }
}
