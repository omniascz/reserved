// SubscriptionsService — sprava predplatneho pres Stripe Subscriptions API
// (sprint 3.3 fáze A3).
//
// Stripe model:
//   - Product (per plan) — kontejner
//   - Price (per plan) — cena + recurring interval
//   - Customer (per zakaznik) — Stripe representace zakaznika
//   - Subscription (per zakaznikova instance) — sparuje Customer + Price
//
// Flow:
//   1. Admin vytvori plan v nasi DB (subscription_plans)
//   2. Pri prvnim subscribe: lazy vytvori Stripe Product + Price (a ulozi IDs)
//   3. Customer subscribe: vytvori Stripe Customer (pokud neexistuje) +
//      Stripe Checkout Session (mode='subscription') -> redirect URL
//   4. Zakaznik dokoncuje checkout v Stripe Checkout UI
//   5. Stripe posila webhooky: checkout.session.completed, customer.subscription.*,
//      invoice.payment_succeeded, invoice.payment_failed
//   6. handleStripeWebhook syncuje status

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import type {
  CancelSubscriptionDto,
  CreateSubscriptionPlanDto,
  SubscribeCustomerDto,
  SubscriptionBenefitsDto,
  UpdateSubscriptionPlanDto,
} from './dto/subscription.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
const ALLOCATE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
}

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat předplatné.',
      },
    });
  }
}

function assertCanAllocate(role: AppRole): void {
  if (!ALLOCATE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Tento účet nemůže prodávat předplatné.',
      },
    });
  }
}

function billingIntervalToStripe(interval: string): Stripe.PriceCreateParams.Recurring.Interval {
  switch (interval) {
    case 'monthly':
      return 'month';
    case 'yearly':
      return 'year';
    case 'quarterly':
      return 'month'; // pouzijeme interval_count=3 níže
    default:
      throw new Error(`Unknown billing interval: ${interval}`);
  }
}

function intervalCount(interval: string): number {
  return interval === 'quarterly' ? 3 : 1;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger('SubscriptionsService');

  constructor(@Inject(DbService) private readonly dbService: DbService) {}

  // ─── Stripe helpers ────────────────────────────────────────────────

  private async getStripeConfig(tenantId: string): Promise<StripeConfig> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [method] = await tx
        .select({ config: schema.paymentMethods.config })
        .from(schema.paymentMethods)
        .where(
          and(
            eq(schema.paymentMethods.tenantId, tenantId),
            eq(schema.paymentMethods.methodType, 'stripe'),
            eq(schema.paymentMethods.isEnabled, true),
          ),
        )
        .limit(1);
      if (!method) {
        throw new BadRequestException({
          error: {
            code: 'STRIPE_NOT_CONFIGURED',
            message: 'Stripe není pro tento tenant nastaven. Předplatné vyžaduje aktivní Stripe.',
          },
        });
      }
      const cfg = method.config as unknown as StripeConfig;
      if (!cfg.secretKey || !cfg.webhookSecret) {
        throw new BadRequestException({
          error: {
            code: 'STRIPE_CONFIG_INCOMPLETE',
            message: 'Stripe konfigurace neobsahuje secretKey nebo webhookSecret.',
          },
        });
      }
      return cfg;
    });
  }

  private stripeClient(config: StripeConfig): Stripe {
    return new Stripe(config.secretKey, { apiVersion: '2025-02-24.acacia' });
  }

  // ─── Plans CRUD ────────────────────────────────────────────────────

  async listPlans(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.subscriptionPlans)
        .where(
          and(
            eq(schema.subscriptionPlans.tenantId, tenantId),
            isNull(schema.subscriptionPlans.deletedAt),
          ),
        )
        .orderBy(asc(schema.subscriptionPlans.name));
    });
  }

  async getPlan(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [plan] = await tx
        .select()
        .from(schema.subscriptionPlans)
        .where(
          and(eq(schema.subscriptionPlans.id, id), eq(schema.subscriptionPlans.tenantId, tenantId)),
        )
        .limit(1);
      if (!plan) {
        throw new NotFoundException({
          error: { code: 'PLAN_NOT_FOUND', message: 'Plán nenalezen.' },
        });
      }
      return plan;
    });
  }

  async createPlan(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: CreateSubscriptionPlanDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [created] = await tx
        .insert(schema.subscriptionPlans)
        .values({
          tenantId,
          name: dto.name,
          description: dto.description ?? null,
          billingInterval: dto.billingInterval,
          priceHellers: dto.priceHellers,
          currency: dto.currency,
          trialDays: dto.trialDays,
          benefits: dto.benefits as SubscriptionBenefitsDto,
          isActive: dto.isActive,
        })
        .returning();
      return created!;
    });
  }

  async updatePlan(
    tenantId: string,
    userId: string,
    role: AppRole,
    id: string,
    dto: UpdateSubscriptionPlanDto,
  ) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Pokud se meni cena/interval, je potreba zneplatnit Stripe Price
      // (Stripe Prices jsou immutable). Nove subscriptions budou pouzivat
      // nove vytvoreny Price (lazy). Existujici subscriptions zustavaji
      // na starem Price podle Stripe konvenci.
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        'name',
        'description',
        'billingInterval',
        'priceHellers',
        'currency',
        'trialDays',
        'benefits',
        'isActive',
      ] as const) {
        if (dto[key] !== undefined) updateData[key] = dto[key];
      }
      // Pokud zmenila se cena nebo interval, zneplatni stripePriceId
      // — service ho znovu vytvori pri dalsim subscribe.
      if (dto.priceHellers !== undefined || dto.billingInterval !== undefined) {
        updateData.stripePriceId = null;
      }
      const [updated] = await tx
        .update(schema.subscriptionPlans)
        .set(updateData)
        .where(
          and(eq(schema.subscriptionPlans.id, id), eq(schema.subscriptionPlans.tenantId, tenantId)),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'PLAN_NOT_FOUND', message: 'Plán nenalezen.' },
        });
      }
      return updated;
    });
  }

  async deletePlan(tenantId: string, userId: string, role: AppRole, id: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.subscriptionPlans)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(schema.subscriptionPlans.id, id), eq(schema.subscriptionPlans.tenantId, tenantId)),
        );
    });
  }

  // ─── Lazy Stripe Product+Price creation ────────────────────────────

  /**
   * Zajisti ze plan ma Stripe Product + Price. Vrati Price ID.
   * Volá se před vytvořením checkoutu.
   */
  private async ensureStripePrice(
    tenantId: string,
    planId: string,
    stripe: Stripe,
  ): Promise<string> {
    const plan = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [p] = await tx
        .select()
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, planId))
        .limit(1);
      return p;
    });
    if (!plan) {
      throw new NotFoundException({
        error: { code: 'PLAN_NOT_FOUND', message: 'Plán nenalezen.' },
      });
    }
    if (plan.stripePriceId) return plan.stripePriceId;

    // Vytvor Product pokud jeste neni
    let productId = plan.stripeProductId;
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description ?? undefined,
        metadata: { tenantId, planId: plan.id },
      });
      productId = product.id;
    }

    // Vytvor Price (Stripe Prices jsou immutable, tak vytvarime novy pri kazde zmene)
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: plan.priceHellers,
      currency: plan.currency.toLowerCase(),
      recurring: {
        interval: billingIntervalToStripe(plan.billingInterval),
        interval_count: intervalCount(plan.billingInterval),
      },
      metadata: { tenantId, planId: plan.id },
    });

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.subscriptionPlans)
        .set({
          stripeProductId: productId,
          stripePriceId: price.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptionPlans.id, plan.id));
    });

    return price.id;
  }

  // ─── Subscribe (checkout flow) ─────────────────────────────────────

  async subscribeCustomer(
    tenantId: string,
    userId: string,
    role: AppRole,
    customerId: string,
    dto: SubscribeCustomerDto,
  ): Promise<{ subscriptionId: string; checkoutUrl: string }> {
    assertCanAllocate(role);

    const stripeConfig = await this.getStripeConfig(tenantId);
    const stripe = this.stripeClient(stripeConfig);

    // 1. Get plan + ensure Stripe Price exists
    const stripePriceId = await this.ensureStripePrice(tenantId, dto.planId, stripe);

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [plan] = await tx
        .select()
        .from(schema.subscriptionPlans)
        .where(
          and(
            eq(schema.subscriptionPlans.id, dto.planId),
            eq(schema.subscriptionPlans.tenantId, tenantId),
            eq(schema.subscriptionPlans.isActive, true),
          ),
        )
        .limit(1);
      if (!plan) {
        throw new NotFoundException({
          error: { code: 'PLAN_NOT_FOUND', message: 'Aktivní plán nenalezen.' },
        });
      }

      // 2. Get customer email
      const [customer] = await tx
        .select({ email: schema.customers.email, firstName: schema.customers.firstName })
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .limit(1);
      if (!customer) {
        throw new NotFoundException({
          error: { code: 'CUSTOMER_NOT_FOUND', message: 'Zákazník nenalezen.' },
        });
      }

      // 3. Vytvor draft DB record (status='incomplete') aby webhook měl co matchnout
      const [subscription] = await tx
        .insert(schema.customerSubscriptions)
        .values({
          tenantId,
          customerId,
          planId: plan.id,
          status: 'incomplete',
          snapshotBenefits: plan.benefits as SubscriptionBenefitsDto,
          snapshotBillingInterval: plan.billingInterval,
          snapshotPriceHellers: plan.priceHellers,
          soldBy: userId,
          note: dto.note ?? null,
        })
        .returning();

      // 4. Vytvor Stripe Checkout session (mode='subscription')
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: stripePriceId, quantity: 1 }],
        customer_email: customer.email,
        success_url: dto.successUrl,
        cancel_url: dto.cancelUrl,
        subscription_data: {
          trial_period_days: plan.trialDays > 0 ? plan.trialDays : undefined,
          metadata: {
            tenantId,
            customerId,
            planId: plan.id,
            customerSubscriptionId: subscription!.id,
          },
        },
        metadata: {
          tenantId,
          customerId,
          planId: plan.id,
          customerSubscriptionId: subscription!.id,
        },
      });

      if (!session.url) {
        throw new Error('Stripe nevratil checkout URL.');
      }

      return {
        subscriptionId: subscription!.id,
        checkoutUrl: session.url,
      };
    });
  }

  // ─── Cancel ────────────────────────────────────────────────────────

  async cancelSubscription(
    tenantId: string,
    userId: string,
    role: AppRole,
    subscriptionId: string,
    dto: CancelSubscriptionDto,
  ): Promise<{ subscriptionId: string; status: string; cancelAtPeriodEnd: boolean }> {
    assertCanAllocate(role);

    const stripeConfig = await this.getStripeConfig(tenantId);
    const stripe = this.stripeClient(stripeConfig);

    const sub = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [s] = await tx
        .select()
        .from(schema.customerSubscriptions)
        .where(
          and(
            eq(schema.customerSubscriptions.id, subscriptionId),
            eq(schema.customerSubscriptions.tenantId, tenantId),
          ),
        )
        .limit(1);
      return s;
    });

    if (!sub) {
      throw new NotFoundException({
        error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Předplatné nenalezeno.' },
      });
    }
    if (!sub.stripeSubscriptionId) {
      throw new BadRequestException({
        error: {
          code: 'NO_STRIPE_SUBSCRIPTION',
          message: 'Předplatné jeste nebylo dokonceno přes Stripe — nelze zrušit.',
        },
      });
    }

    let updated: Stripe.Subscription;
    if (dto.atPeriodEnd) {
      updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      updated = await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    }

    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.customerSubscriptions)
        .set({
          status: updated.status,
          cancelAtPeriodEnd: updated.cancel_at_period_end,
          canceledAt: updated.canceled_at ? new Date(updated.canceled_at * 1000) : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.customerSubscriptions.id, sub.id));
    });

    return {
      subscriptionId: sub.id,
      status: updated.status,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
    };
  }

  // ─── List for customer ─────────────────────────────────────────────

  async listForCustomer(tenantId: string, userId: string, role: AppRole, customerId: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          subscription: schema.customerSubscriptions,
          planName: schema.subscriptionPlans.name,
        })
        .from(schema.customerSubscriptions)
        .leftJoin(
          schema.subscriptionPlans,
          eq(schema.customerSubscriptions.planId, schema.subscriptionPlans.id),
        )
        .where(
          and(
            eq(schema.customerSubscriptions.tenantId, tenantId),
            eq(schema.customerSubscriptions.customerId, customerId),
          ),
        )
        .orderBy(desc(schema.customerSubscriptions.createdAt));
      return rows.map((r) => ({ ...r.subscription, planName: r.planName }));
    });
  }

  // ─── Webhook handling ──────────────────────────────────────────────

  /**
   * Vola se z webhook controlleru po overeni Stripe signatury.
   * Idempotentni pres unique constraint na (tenantId, stripeEventId).
   */
  async handleStripeWebhook(input: {
    tenantId: string;
    event: Stripe.Event;
  }): Promise<{ handled: boolean; reason?: string }> {
    return this.dbService.withRlsContext(serviceContext(input.tenantId), async (tx) => {
      // Idempotence check
      const [existing] = await tx
        .select({ id: schema.subscriptionEvents.id })
        .from(schema.subscriptionEvents)
        .where(
          and(
            eq(schema.subscriptionEvents.tenantId, input.tenantId),
            eq(schema.subscriptionEvents.stripeEventId, input.event.id),
          ),
        )
        .limit(1);
      if (existing) {
        return { handled: false, reason: 'duplicate' };
      }

      let customerSubscriptionId: string | null = null;
      let handled = false;

      switch (input.event.type) {
        case 'checkout.session.completed': {
          const session = input.event.data.object as Stripe.Checkout.Session;
          if (session.mode !== 'subscription') {
            // ne-subscription checkout, ignoruj
            break;
          }
          const ourSubId = session.metadata?.customerSubscriptionId;
          if (!ourSubId) break;
          customerSubscriptionId = ourSubId;
          await tx
            .update(schema.customerSubscriptions)
            .set({
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              status: 'active', // bude potvrzeno dalsim subscription.created webhookem
              updatedAt: new Date(),
            })
            .where(eq(schema.customerSubscriptions.id, ourSubId));
          handled = true;
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const sub = input.event.data.object as Stripe.Subscription;
          const ourSubId = sub.metadata?.customerSubscriptionId;
          if (!ourSubId) break;
          customerSubscriptionId = ourSubId;
          await tx
            .update(schema.customerSubscriptions)
            .set({
              status: sub.status,
              currentPeriodStart: sub.current_period_start
                ? new Date(sub.current_period_start * 1000)
                : null,
              currentPeriodEnd: sub.current_period_end
                ? new Date(sub.current_period_end * 1000)
                : null,
              trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
              updatedAt: new Date(),
            })
            .where(eq(schema.customerSubscriptions.id, ourSubId));
          handled = true;
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = input.event.data.object as Stripe.Subscription;
          const ourSubId = sub.metadata?.customerSubscriptionId;
          if (!ourSubId) break;
          customerSubscriptionId = ourSubId;
          await tx
            .update(schema.customerSubscriptions)
            .set({
              status: 'canceled',
              canceledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.customerSubscriptions.id, ourSubId));
          handled = true;
          break;
        }
        case 'invoice.payment_succeeded': {
          const invoice = input.event.data.object as Stripe.Invoice;
          const stripeSubId =
            typeof invoice.subscription === 'string' ? invoice.subscription : null;
          if (!stripeSubId) break;
          const [matched] = await tx
            .select({ id: schema.customerSubscriptions.id })
            .from(schema.customerSubscriptions)
            .where(
              and(
                eq(schema.customerSubscriptions.tenantId, input.tenantId),
                eq(schema.customerSubscriptions.stripeSubscriptionId, stripeSubId),
              ),
            )
            .limit(1);
          if (matched) {
            customerSubscriptionId = matched.id;
            // currentPeriodEnd bude updated z customer.subscription.updated
            // tady jen reaktivujeme pokud byl past_due
            await tx
              .update(schema.customerSubscriptions)
              .set({ status: 'active', updatedAt: new Date() })
              .where(eq(schema.customerSubscriptions.id, matched.id));
            handled = true;
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = input.event.data.object as Stripe.Invoice;
          const stripeSubId =
            typeof invoice.subscription === 'string' ? invoice.subscription : null;
          if (!stripeSubId) break;
          const [matched] = await tx
            .select({ id: schema.customerSubscriptions.id })
            .from(schema.customerSubscriptions)
            .where(
              and(
                eq(schema.customerSubscriptions.tenantId, input.tenantId),
                eq(schema.customerSubscriptions.stripeSubscriptionId, stripeSubId),
              ),
            )
            .limit(1);
          if (matched) {
            customerSubscriptionId = matched.id;
            await tx
              .update(schema.customerSubscriptions)
              .set({ status: 'past_due', updatedAt: new Date() })
              .where(eq(schema.customerSubscriptions.id, matched.id));
            handled = true;
          }
          break;
        }
        default:
          // jiny event type, ignore (ale log do audit)
          break;
      }

      // Vzdy log do audit (i unhandled — pro debugging)
      await tx.insert(schema.subscriptionEvents).values({
        tenantId: input.tenantId,
        customerSubscriptionId,
        stripeEventId: input.event.id,
        eventType: input.event.type,
        payload: input.event as unknown as Record<string, unknown>,
      });

      return { handled };
    });
  }

  /**
   * Pomocna metoda: najdi aktivni subscription a vrati merged benefits.
   * Pouzije se pri booking flow (slevy, prioritni access, atd.).
   */
  async getActiveBenefitsForCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<SubscriptionBenefitsDto | null> {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const subs = await tx
        .select()
        .from(schema.customerSubscriptions)
        .where(
          and(
            eq(schema.customerSubscriptions.tenantId, tenantId),
            eq(schema.customerSubscriptions.customerId, customerId),
          ),
        );

      const active = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
      if (active.length === 0) return null;

      // Merge benefits — vyhrava nejvyssi sleva, OR pro flagy, sum kreditu,
      // union exkluzivnich služeb
      const merged: SubscriptionBenefitsDto = {};
      for (const sub of active) {
        const b = sub.snapshotBenefits as SubscriptionBenefitsDto;
        if (b.discountPercent !== undefined) {
          merged.discountPercent = Math.max(merged.discountPercent ?? 0, b.discountPercent);
        }
        if (b.priorityAccess) merged.priorityAccess = true;
        if (b.freeCreditsPerPeriod !== undefined) {
          merged.freeCreditsPerPeriod = (merged.freeCreditsPerPeriod ?? 0) + b.freeCreditsPerPeriod;
        }
        if (b.exclusiveServiceIds) {
          merged.exclusiveServiceIds = Array.from(
            new Set([...(merged.exclusiveServiceIds ?? []), ...b.exclusiveServiceIds]),
          );
        }
      }
      return merged;
    });
  }
}
