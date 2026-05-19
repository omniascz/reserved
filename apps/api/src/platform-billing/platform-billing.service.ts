// PlatformBillingService — Stripe billing pro tenant předplatné Reserved.
//
// Lifecycle:
//   1. Tenant se registruje → status='trial', trialEndsAt = now + plan.trialDays
//   2. Před koncem trialu (nebo dobrovolně) → POST /admin/billing/checkout
//      → vytvoríme Stripe Customer + Checkout Session
//      → tenant zaplatí kartou v Stripe UI
//      → webhook customer.subscription.created → status='active'
//   3. Pravidelně Stripe stahává kartu, dokud:
//      → invoice.payment_failed → tenant.suspendedAt = now (read-only mode)
//      → invoice.payment_succeeded po payment_failed → reactivate
//      → customer.subscription.deleted → trvalé zrušení
//
// Tenant může:
//   - upgradenout/downgradenout plán (Stripe proration)
//   - zrušit (cancel_at_period_end = true)
//   - spravovat kartu přes Stripe Billing Portal

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import Stripe from 'stripe';
import { schema } from '@reserved/db';
import { serviceContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { PlatformBillingConfig } from './platform-billing.config.js';

export type BillingInterval = 'monthly' | 'yearly';

export interface BillingStatus {
  tenantId: string;
  plan: string;
  planName: string | null;
  status: string; // 'trial' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'suspended'
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger('PlatformBillingService');
  private stripe: Stripe | null = null;

  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(PlatformBillingConfig) private readonly config: PlatformBillingConfig,
  ) {
    if (this.config.isConfigured()) {
      this.stripe = new Stripe(this.config.stripeSecretKey!, {
        apiVersion: '2025-09-30.clover' as Stripe.LatestApiVersion,
      });
    } else {
      this.logger.warn(
        'STRIPE_PLATFORM_SECRET_KEY not set — platform billing endpoints will return 503.',
      );
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException({
        error: {
          code: 'BILLING_NOT_CONFIGURED',
          message:
            'Stripe platform billing není nakonfigurován (chybí STRIPE_PLATFORM_SECRET_KEY).',
        },
      });
    }
    return this.stripe;
  }

  // ─── Plans (read-only, public) ────────────────────────────────────────

  async listPlans(): Promise<(typeof schema.platformPlans.$inferSelect)[]> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      return tx
        .select()
        .from(schema.platformPlans)
        .where(eq(schema.platformPlans.isPublic, true))
        .orderBy(schema.platformPlans.sortOrder);
    });
  }

  // ─── Status pro konkrétního tenanta ──────────────────────────────────

  async getStatus(tenantId: string): Promise<BillingStatus> {
    return this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }

      const [plan] = await tx
        .select({ name: schema.platformPlans.name })
        .from(schema.platformPlans)
        .where(eq(schema.platformPlans.key, tenant.plan))
        .limit(1);

      const effectiveStatus = tenant.suspendedAt
        ? 'suspended'
        : (tenant.stripeSubscriptionStatus ?? tenant.status);

      return {
        tenantId,
        plan: tenant.plan,
        planName: plan?.name ?? null,
        status: effectiveStatus,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.currentPeriodEnd,
        cancelAtPeriodEnd: tenant.cancelAtPeriodEnd === 'true',
        hasPaymentMethod: !!tenant.stripeSubscriptionId,
        stripeCustomerId: tenant.stripeCustomerId,
        stripeSubscriptionId: tenant.stripeSubscriptionId,
      };
    });
  }

  // ─── Stripe Customer (lazy create) ────────────────────────────────────

  private async getOrCreateStripeCustomer(
    tenantId: string,
  ): Promise<{ stripeCustomerId: string; tenant: typeof schema.tenants.$inferSelect }> {
    const stripe = this.requireStripe();

    const tenant = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1);
      if (!row) {
        throw new NotFoundException({
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant neexistuje.' },
        });
      }
      return row;
    });

    if (tenant.stripeCustomerId) {
      return { stripeCustomerId: tenant.stripeCustomerId, tenant };
    }

    const customer = await stripe.customers.create({
      email: tenant.billingEmail ?? tenant.ownerEmail ?? undefined,
      name: tenant.name,
      metadata: {
        tenantId,
        slug: tenant.slug,
      },
    });

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx
        .update(schema.tenants)
        .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
        .where(eq(schema.tenants.id, tenantId));
    });

    this.logger.log(`Created Stripe Customer ${customer.id} for tenant ${tenantId}`);
    return { stripeCustomerId: customer.id, tenant: { ...tenant, stripeCustomerId: customer.id } };
  }

  // ─── Checkout Session ─────────────────────────────────────────────────

  async createCheckoutSession(input: {
    tenantId: string;
    planKey: string;
    interval: BillingInterval;
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    const stripe = this.requireStripe();

    const plan = await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.platformPlans)
        .where(eq(schema.platformPlans.key, input.planKey))
        .limit(1);
      return row;
    });
    if (!plan) {
      throw new NotFoundException({
        error: { code: 'PLAN_NOT_FOUND', message: `Plán "${input.planKey}" neexistuje.` },
      });
    }

    const priceId =
      input.interval === 'yearly' ? plan.stripeYearlyPriceId : plan.stripeMonthlyPriceId;
    if (!priceId) {
      throw new BadRequestException({
        error: {
          code: 'PRICE_NOT_CONFIGURED',
          message: `Plán "${input.planKey}" nemá Stripe Price ID pro ${input.interval}. Master admin musí nejprve nastavit Stripe Products.`,
        },
      });
    }

    const { stripeCustomerId } = await this.getOrCreateStripeCustomer(input.tenantId);

    const successUrl = input.successUrl ?? `${this.config.adminBaseUrl}/billing?checkout=success`;
    const cancelUrl = input.cancelUrl ?? `${this.config.adminBaseUrl}/billing?checkout=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        metadata: {
          tenantId: input.tenantId,
          planKey: plan.key,
          interval: input.interval,
        },
      },
      // Aktivujeme trial pokud tenant ještě v žádném subscriptu nebyl
      ...(plan.trialDays > 0
        ? {
            subscription_data: {
              trial_period_days: plan.trialDays,
              metadata: {
                tenantId: input.tenantId,
                planKey: plan.key,
                interval: input.interval,
              },
            },
          }
        : {}),
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error('Stripe checkout session did not return URL.');
    }

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  // ─── Billing Portal (Stripe-hosted správa karty) ──────────────────────

  async createPortalSession(input: {
    tenantId: string;
    returnUrl?: string;
  }): Promise<{ portalUrl: string }> {
    const stripe = this.requireStripe();
    const { stripeCustomerId } = await this.getOrCreateStripeCustomer(input.tenantId);

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: input.returnUrl ?? `${this.config.adminBaseUrl}/billing`,
    });
    return { portalUrl: session.url };
  }

  // ─── Webhook handler ──────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    const stripe = this.requireStripe();
    const secret = this.config.webhookSecret;
    if (!secret) {
      throw new ServiceUnavailableException({
        error: {
          code: 'WEBHOOK_SECRET_MISSING',
          message: 'STRIPE_PLATFORM_WEBHOOK_SECRET není nastaven.',
        },
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${(err as Error).message}`);
      throw new BadRequestException({
        error: { code: 'INVALID_SIGNATURE', message: 'Stripe webhook signature invalid.' },
      });
    }

    this.logger.log(`Webhook: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.syncSubscription(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      default:
        // Bezpečně ignorovat — Stripe posílá hodně eventů, řešíme jen klíčové
        break;
    }

    return { received: true };
  }

  // ─── Webhook handlers ─────────────────────────────────────────────────

  private async syncSubscription(sub: Stripe.Subscription): Promise<void> {
    const tenantId = sub.metadata?.tenantId;
    if (!tenantId) {
      this.logger.warn(`Subscription ${sub.id} missing tenantId in metadata`);
      return;
    }
    const planKey = sub.metadata?.planKey;

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const item = sub.items.data[0];
      const periodEnd = (item as unknown as { current_period_end?: number } | undefined)
        ?.current_period_end;

      await tx
        .update(schema.tenants)
        .set({
          stripeSubscriptionId: sub.id,
          stripeSubscriptionStatus: sub.status,
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          cancelAtPeriodEnd: sub.cancel_at_period_end ? 'true' : 'false',
          // Pokud máme planKey v metadata, použij ho jako autoritativní
          ...(planKey ? { plan: planKey } : {}),
          // Aktivace: pokud status = active/trialing → ujisti se, že není suspendnut
          ...(sub.status === 'active' || sub.status === 'trialing'
            ? { status: 'active', suspendedAt: null, suspensionReason: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    });

    this.logger.log(`Synced subscription ${sub.id} for tenant ${tenantId} → status=${sub.status}`);
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const tenantId = sub.metadata?.tenantId;
    if (!tenantId) return;

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      await tx
        .update(schema.tenants)
        .set({
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: 'canceled',
          plan: 'free',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: 'false',
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenantId));
    });

    this.logger.log(`Subscription ${sub.id} canceled — tenant ${tenantId} downgraded to free`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const subId = (invoice as unknown as { subscription?: string | Stripe.Subscription })
      .subscription;
    if (!subId) return;

    const subscriptionId = typeof subId === 'string' ? subId : subId.id;

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.stripeSubscriptionId, subscriptionId))
        .limit(1);
      if (!tenant) return;

      // Suspendnu jen pokud ještě není suspendnut (zachovám předchozí důvod)
      if (!tenant.suspendedAt) {
        await tx
          .update(schema.tenants)
          .set({
            suspendedAt: new Date(),
            suspensionReason: 'Payment failed — please update your card via billing portal.',
            updatedAt: new Date(),
          })
          .where(eq(schema.tenants.id, tenant.id));
        this.logger.warn(`Suspended tenant ${tenant.slug} due to failed payment`);
      }
    });
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const subId = (invoice as unknown as { subscription?: string | Stripe.Subscription })
      .subscription;
    if (!subId) return;

    const subscriptionId = typeof subId === 'string' ? subId : subId.id;

    await this.dbService.withRlsContext(serviceContext(), async (tx) => {
      const [tenant] = await tx
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.stripeSubscriptionId, subscriptionId))
        .limit(1);
      if (!tenant) return;

      // Pokud byl suspendnut kvůli platbě, reactivuj
      if (tenant.suspendedAt && tenant.suspensionReason?.toLowerCase().includes('payment failed')) {
        await tx
          .update(schema.tenants)
          .set({
            suspendedAt: null,
            suspensionReason: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.tenants.id, tenant.id));
        this.logger.log(`Reactivated tenant ${tenant.slug} — payment recovered`);
      }
    });
  }

  // ─── Cancel / resume ──────────────────────────────────────────────────

  async cancelSubscription(input: {
    tenantId: string;
    atPeriodEnd: boolean;
  }): Promise<{ canceled: true; effectiveAt: 'period_end' | 'immediate' }> {
    const stripe = this.requireStripe();
    const status = await this.getStatus(input.tenantId);
    if (!status.stripeSubscriptionId) {
      throw new BadRequestException({
        error: { code: 'NO_SUBSCRIPTION', message: 'Žádné aktivní předplatné nelze zrušit.' },
      });
    }

    if (input.atPeriodEnd) {
      await stripe.subscriptions.update(status.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
      return { canceled: true, effectiveAt: 'period_end' };
    }
    await stripe.subscriptions.cancel(status.stripeSubscriptionId);
    return { canceled: true, effectiveAt: 'immediate' };
  }

  async resumeSubscription(tenantId: string): Promise<{ resumed: true }> {
    const stripe = this.requireStripe();
    const status = await this.getStatus(tenantId);
    if (!status.stripeSubscriptionId) {
      throw new BadRequestException({
        error: { code: 'NO_SUBSCRIPTION', message: 'Žádné předplatné nelze obnovit.' },
      });
    }
    if (!status.cancelAtPeriodEnd) {
      throw new BadRequestException({
        error: { code: 'NOT_CANCELLED', message: 'Předplatné není ve stavu zrušení.' },
      });
    }
    await stripe.subscriptions.update(status.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    return { resumed: true };
  }
}
