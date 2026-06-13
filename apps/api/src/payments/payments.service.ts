// PaymentsService — sprava plateb + payment methods config.
//
// Faze A: manual recording (cash, card_terminal, qr_bank) + per-role permissions.
// Faze B (next sprint): online providers (Stripe, GoPay) s checkout + webhooks.
//
// Permissions:
//   - owner / manager: vse (vidi vsechny platby, muze refundovat, konfiguruje methody)
//   - receptionist: vidí pokladnu (cash/terminal/qr), muze zaznamenavat platby,
//                   ale nevidi online brany (Stripe/GoPay)
//   - employee: nevidi platby (jen rezervace)
//   - customer: vidi jen svoje platby (pres portal — Faze B)

import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { generateSpaydString } from './qr-generator.js';
import { PaymentProviderRegistry } from './providers/provider.registry.js';
import type { WebhookEvent } from './providers/payment-provider.interface.js';
import type {
  ListPaymentsQueryDto,
  PaymentMethodType,
  RecordPaymentDto,
  RefundPaymentDto,
  UpsertPaymentMethodDto,
} from './dto/payment.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager'];
// Recepcni muze zaznamenavat manual platby (cash, terminal, qr)
const RECORD_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];
// Online brany vidi jen vyssi role
const ONLINE_METHODS: PaymentMethodType[] = [
  'stripe',
  'gopay',
  'comgate',
  'thepay',
  'payu',
  'gpwebpay',
];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Pouze owner nebo manager může spravovat platební metody.',
      },
    });
  }
}

function assertCanRecord(role: AppRole): void {
  if (!RECORD_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: 'Tento účet nemůže zaznamenávat platby.',
      },
    });
  }
}

/** Pro receptionist filtruje online platby pryc. */
function canViewMethod(role: AppRole, methodType: string): boolean {
  if (MANAGE_ROLES.includes(role)) return true;
  if (role === 'receptionist') {
    return !ONLINE_METHODS.includes(methodType as PaymentMethodType);
  }
  return false;
}

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(PaymentProviderRegistry) private readonly providers: PaymentProviderRegistry,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private isSubscriptionEventType(type: string, rawPayload: Record<string, unknown>): boolean {
    if (
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated' ||
      type === 'customer.subscription.deleted' ||
      type === 'invoice.payment_succeeded' ||
      type === 'invoice.payment_failed'
    ) {
      return true;
    }
    // checkout.session.completed s mode='subscription'
    if (type === 'checkout.session.completed') {
      const session = (rawPayload as { data?: { object?: { mode?: string } } }).data?.object;
      return session?.mode === 'subscription';
    }
    return false;
  }

  // ─── Online checkout (Stripe/GoPay/Mock) ────────────────────────

  async createCheckout(input: {
    tenantId: string;
    /** Volajici role — pro permission check. */
    role: AppRole;
    methodType: 'stripe' | 'gopay' | 'mock' | 'comgate' | 'thepay' | 'payu' | 'gpwebpay';
    amountHellers: number;
    currency: string;
    description: string;
    customerId?: string;
    customerEmail?: string;
    bookingId?: string;
    creditPackAllocationId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ paymentId: string; checkoutUrl: string }> {
    // Online checkout muze spustit jen kdo umi zaznamenavat platby
    assertCanRecord(input.role);

    return this.dbService.withRlsContext(
      { tenantId: input.tenantId, role: 'service' },
      async (tx) => {
        // 1. Najdi config
        const [method] = await tx
          .select({ config: schema.paymentMethods.config })
          .from(schema.paymentMethods)
          .where(
            and(
              eq(schema.paymentMethods.tenantId, input.tenantId),
              eq(schema.paymentMethods.methodType, input.methodType),
              eq(schema.paymentMethods.isEnabled, true),
            ),
          )
          .limit(1);
        if (!method) {
          throw new BadRequestException({
            error: {
              code: 'METHOD_NOT_CONFIGURED',
              message: `Metoda ${input.methodType} není pro tenant zapnuta.`,
            },
          });
        }

        // 2. Vytvor pending payment
        const [payment] = await tx
          .insert(schema.payments)
          .values({
            tenantId: input.tenantId,
            customerId: input.customerId ?? null,
            bookingId: input.bookingId ?? null,
            creditPackAllocationId: input.creditPackAllocationId ?? null,
            amountHellers: input.amountHellers,
            currency: input.currency,
            methodType: input.methodType,
            status: 'pending',
            description: input.description,
          })
          .returning();

        // 3. Vytvor checkout pres providera
        const provider = this.providers.get(input.methodType);
        try {
          const result = await provider.createCheckout(
            {
              amountHellers: input.amountHellers,
              currency: input.currency,
              description: input.description,
              successUrl: input.successUrl,
              cancelUrl: input.cancelUrl,
              metadata: {
                tenantId: input.tenantId,
                paymentId: payment!.id,
              },
              customerEmail: input.customerEmail,
            },
            method.config as Record<string, unknown>,
          );

          await tx
            .update(schema.payments)
            .set({ externalId: result.externalId, updatedAt: new Date() })
            .where(eq(schema.payments.id, payment!.id));

          await tx.insert(schema.paymentEvents).values({
            tenantId: input.tenantId,
            paymentId: payment!.id,
            eventType: 'created',
            payload: { provider: input.methodType, checkoutUrl: result.checkoutUrl },
            verified: true,
          });

          return { paymentId: payment!.id, checkoutUrl: result.checkoutUrl };
        } catch (err) {
          // Pokud checkout selze, oznac jako failed
          await tx
            .update(schema.payments)
            .set({
              status: 'failed',
              failureReason: err instanceof Error ? err.message : 'Unknown error',
              updatedAt: new Date(),
            })
            .where(eq(schema.payments.id, payment!.id));
          throw err;
        }
      },
    );
  }

  // ─── Webhook handling ──────────────────────────────────────────

  /**
   * Zpracuj webhook od online brany.
   * @param tenantId — extrahovany z URL params nebo z payload metadata
   * @param providerType — 'stripe' | 'gopay' | 'mock'
   */
  async handleWebhook(
    tenantId: string,
    providerType: 'stripe' | 'gopay' | 'mock' | 'comgate' | 'thepay' | 'payu' | 'gpwebpay',
    rawBody: string | Buffer,
    signatureHeader: string,
  ): Promise<{ paymentId: string | null; status: string }> {
    const provider = this.providers.get(providerType);

    // 1. Najdi config (potrebne pro signature check)
    const config = await this.dbService.withRlsContext(
      { tenantId, role: 'service' },
      async (tx) => {
        const [method] = await tx
          .select({ config: schema.paymentMethods.config })
          .from(schema.paymentMethods)
          .where(
            and(
              eq(schema.paymentMethods.tenantId, tenantId),
              eq(schema.paymentMethods.methodType, providerType),
            ),
          )
          .limit(1);
        return (method?.config ?? {}) as Record<string, unknown>;
      },
    );

    // 2. Verify + parse
    let event: WebhookEvent;
    try {
      event = await provider.verifyWebhook(rawBody, signatureHeader, config);
    } catch (err) {
      throw new BadRequestException({
        error: {
          code: 'WEBHOOK_VERIFY_FAILED',
          message: err instanceof Error ? err.message : 'Webhook verification failed.',
        },
      });
    }

    // 2b. Subscription eventy delegujeme do SubscriptionsService (sprint 3.3 fáze A3).
    // Stripe pro subscription posila:
    //   - customer.subscription.{created,updated,deleted}
    //   - invoice.payment_{succeeded,failed}
    //   - checkout.session.completed s mode='subscription'
    if (
      providerType === 'stripe' &&
      this.subscriptions &&
      event.stripeEventType &&
      this.isSubscriptionEventType(event.stripeEventType, event.rawPayload)
    ) {
      const stripeEvent = event.rawPayload as unknown as import('stripe').default.Event;
      const result = await this.subscriptions.handleStripeWebhook({
        tenantId,
        event: stripeEvent,
      });
      return { paymentId: null, status: result.handled ? 'subscription_handled' : 'ignored' };
    }

    // 3. Najdi nasi payment podle externalId
    return this.dbService.withRlsContext({ tenantId, role: 'service' }, async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.tenantId, tenantId),
            eq(schema.payments.externalId, event.externalId),
          ),
        )
        .limit(1);

      if (!payment) {
        // Log + return — webhook prisel ale nemame zaznam
        await tx.insert(schema.paymentEvents).values({
          tenantId,
          paymentId: null,
          eventType: `${providerType}_webhook`,
          payload: { event: event as unknown as Record<string, unknown>, orphan: true },
          verified: true,
        });
        return { paymentId: null, status: event.status };
      }

      // 4. Update payment status (idempotentne)
      if (payment.status !== event.status) {
        await tx
          .update(schema.payments)
          .set({
            status: event.status,
            paidAt: event.status === 'succeeded' ? new Date() : payment.paidAt,
            failureReason: event.failureReason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.payments.id, payment.id));
      }

      await tx.insert(schema.paymentEvents).values({
        tenantId,
        paymentId: payment.id,
        eventType: `${providerType}_webhook`,
        payload: event as unknown as Record<string, unknown>,
        verified: true,
      });

      return { paymentId: payment.id, status: event.status };
    });
  }

  // ─── Payment methods config ─────────────────────────────────────

  /** Klíče v config, ktere obsahuji secret a NESMI se posilat zpet do API. */
  private static readonly SECRET_CONFIG_KEYS = new Set([
    'secretKey', // Stripe sk_test/sk_live
    'webhookSecret', // Stripe whsec_
    'clientSecret', // GoPay
  ]);

  /** Vrati config s maskovanymi secret hodnotami. Zachova klice (aby UI vedelo
   *  ze klic existuje), ale hodnotu nahradi '••••••' + poslednich 4 znaku. */
  private maskSecrets(config: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (PaymentsService.SECRET_CONFIG_KEYS.has(key) && typeof value === 'string' && value) {
        masked[key] = `••••••${value.slice(-4)}`;
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  async listMethods(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select()
        .from(schema.paymentMethods)
        .where(eq(schema.paymentMethods.tenantId, tenantId))
        .orderBy(schema.paymentMethods.sortOrder, schema.paymentMethods.methodType);

      // Filter pro receptionist — skry online brany
      return rows
        .filter((r) => canViewMethod(role, r.methodType))
        .map((r) => ({ ...r, config: this.maskSecrets(r.config as Record<string, unknown>) }));
    });
  }

  /** Pokud user posle maskovany secret (•••••), nahrad ho hodnotou z DB. */
  private mergeConfig(
    incoming: Record<string, unknown>,
    existing: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...incoming };
    for (const key of PaymentsService.SECRET_CONFIG_KEYS) {
      const incomingVal = merged[key];
      if (typeof incomingVal === 'string' && incomingVal.startsWith('••••••')) {
        // Maskovany — uchovej puvodni hodnotu
        merged[key] = existing[key] ?? '';
      }
    }
    return merged;
  }

  async upsertMethod(tenantId: string, userId: string, role: AppRole, dto: UpsertPaymentMethodDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // upsert podle (tenantId, methodType)
      const [existing] = await tx
        .select()
        .from(schema.paymentMethods)
        .where(
          and(
            eq(schema.paymentMethods.tenantId, tenantId),
            eq(schema.paymentMethods.methodType, dto.methodType),
          ),
        )
        .limit(1);

      if (existing) {
        // Pokud user posle maskovany secret, zachovej puvodni
        const mergedConfig = this.mergeConfig(
          dto.config,
          existing.config as Record<string, unknown>,
        );
        const [updated] = await tx
          .update(schema.paymentMethods)
          .set({
            displayName: dto.displayName ?? existing.displayName,
            config: mergedConfig,
            isEnabled: dto.isEnabled,
            sortOrder: dto.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(schema.paymentMethods.id, existing.id))
          .returning();
        // Vrat s maskovanymi secrets
        return {
          ...updated!,
          config: this.maskSecrets(updated!.config as Record<string, unknown>),
        };
      }

      const [created] = await tx
        .insert(schema.paymentMethods)
        .values({
          tenantId,
          methodType: dto.methodType,
          displayName: dto.displayName ?? null,
          config: dto.config,
          isEnabled: dto.isEnabled,
          sortOrder: dto.sortOrder,
        })
        .returning();
      // Vrat s maskovanymi secrets
      return { ...created!, config: this.maskSecrets(created!.config as Record<string, unknown>) };
    });
  }

  async deleteMethod(tenantId: string, userId: string, role: AppRole, methodType: string) {
    assertCanManage(role);
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .delete(schema.paymentMethods)
        .where(
          and(
            eq(schema.paymentMethods.tenantId, tenantId),
            eq(schema.paymentMethods.methodType, methodType),
          ),
        );
    });
  }

  // ─── Record manual payment ────────────────────────────────────

  async recordPayment(tenantId: string, userId: string, role: AppRole, dto: RecordPaymentDto) {
    assertCanRecord(role);

    if (ONLINE_METHODS.includes(dto.methodType)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_METHOD',
          message: 'Online brány nelze zaznamenat ručně. Použij checkout flow.',
        },
      });
    }

    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const paidAt = dto.paidAtIso ? new Date(dto.paidAtIso) : new Date();

      // Manual platby jsou rovnou succeeded (kdyz se vybralo / klient zaplatil terminalem)
      // QR muze byt pending (cekame na bank transfer) — admin to oznaci az dorazi
      const status = dto.methodType === 'qr_bank' ? 'pending' : 'succeeded';

      const [payment] = await tx
        .insert(schema.payments)
        .values({
          tenantId,
          customerId: dto.customerId ?? null,
          bookingId: dto.bookingId ?? null,
          creditPackAllocationId: dto.creditPackAllocationId ?? null,
          amountHellers: dto.amountHellers,
          currency: dto.currency,
          methodType: dto.methodType,
          status,
          description: dto.description ?? null,
          referenceCode: dto.referenceCode ?? null,
          recordedBy: userId,
          paidAt: status === 'succeeded' ? paidAt : null,
        })
        .returning();

      await tx.insert(schema.paymentEvents).values({
        tenantId,
        paymentId: payment!.id,
        eventType: 'manual_marked',
        payload: { recordedBy: userId, role, method: dto.methodType },
        verified: true,
      });

      return payment!;
    });
  }

  async markQrAsPaid(tenantId: string, userId: string, role: AppRole, paymentId: string) {
    assertCanRecord(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, tenantId)))
        .limit(1);
      if (!existing) {
        throw new NotFoundException({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'Platba nenalezena.' },
        });
      }
      if (existing.status !== 'pending') {
        throw new BadRequestException({
          error: { code: 'INVALID_STATUS', message: 'Platba není ve stavu pending.' },
        });
      }

      const [updated] = await tx
        .update(schema.payments)
        .set({ status: 'succeeded', paidAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.payments.id, paymentId))
        .returning();

      await tx.insert(schema.paymentEvents).values({
        tenantId,
        paymentId,
        eventType: 'manual_marked',
        payload: { action: 'qr_marked_paid', by: userId },
        verified: true,
      });

      return updated!;
    });
  }

  async refundPayment(
    tenantId: string,
    userId: string,
    role: AppRole,
    paymentId: string,
    dto: RefundPaymentDto,
  ) {
    assertCanManage(role); // jen owner/manager
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [original] = await tx
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, tenantId)))
        .limit(1);
      if (!original) {
        throw new NotFoundException({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'Platba nenalezena.' },
        });
      }
      if (original.status !== 'succeeded') {
        throw new BadRequestException({
          error: { code: 'INVALID_STATUS', message: 'Lze refundovat jen úspěšné platby.' },
        });
      }

      const refundAmount = dto.amountHellers ?? original.amountHellers;
      if (refundAmount > original.amountHellers) {
        throw new BadRequestException({
          error: {
            code: 'AMOUNT_TOO_HIGH',
            message: 'Refund nemůže být vyšší než původní částka.',
          },
        });
      }

      // Vytvor refund zaznam (zaporna castka jako konvence)
      const [refund] = await tx
        .insert(schema.payments)
        .values({
          tenantId,
          customerId: original.customerId,
          bookingId: original.bookingId,
          creditPackAllocationId: original.creditPackAllocationId,
          amountHellers: -refundAmount,
          currency: original.currency,
          methodType: original.methodType,
          status: 'refunded',
          description: dto.reason ? `Refund: ${dto.reason}` : 'Refund',
          refundedFromPaymentId: original.id,
          recordedBy: userId,
          paidAt: new Date(),
        })
        .returning();

      // Pokud full refund — oznac original jako refunded
      if (refundAmount === original.amountHellers) {
        await tx
          .update(schema.payments)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(eq(schema.payments.id, original.id));
      }

      await tx.insert(schema.paymentEvents).values({
        tenantId,
        paymentId: refund!.id,
        eventType: 'refund',
        payload: { originalPaymentId: original.id, reason: dto.reason, by: userId },
        verified: true,
      });

      return refund!;
    });
  }

  // ─── Lists ────────────────────────────────────────────────────

  async listPayments(
    tenantId: string,
    userId: string,
    role: AppRole,
    filters: ListPaymentsQueryDto,
  ) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const conditions = [eq(schema.payments.tenantId, tenantId)];
      if (filters.from) conditions.push(gte(schema.payments.createdAt, new Date(filters.from)));
      if (filters.to) conditions.push(lte(schema.payments.createdAt, new Date(filters.to)));
      if (filters.status) conditions.push(eq(schema.payments.status, filters.status));
      if (filters.methodType) conditions.push(eq(schema.payments.methodType, filters.methodType));
      if (filters.customerId) conditions.push(eq(schema.payments.customerId, filters.customerId));

      const rows = await tx
        .select()
        .from(schema.payments)
        .where(and(...conditions))
        .orderBy(desc(schema.payments.createdAt))
        .limit(500);

      // Filter pro receptionist — skry online platby
      return rows.filter((r) => canViewMethod(role, r.methodType));
    });
  }

  async getPayment(tenantId: string, userId: string, role: AppRole, id: string) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [p] = await tx
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.id, id), eq(schema.payments.tenantId, tenantId)))
        .limit(1);
      if (!p) {
        throw new NotFoundException({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'Platba nenalezena.' },
        });
      }
      if (!canViewMethod(role, p.methodType)) {
        throw new ForbiddenException({
          error: { code: 'INSUFFICIENT_ROLE', message: 'Tuto platbu nemůžete vidět.' },
        });
      }
      return p;
    });
  }

  /** Sumy za obdobi (pro reports). */
  async summary(tenantId: string, userId: string, role: AppRole, from: Date, to: Date) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const rows = await tx
        .select({
          methodType: schema.payments.methodType,
          status: schema.payments.status,
          count: sql<number>`COUNT(*)`.mapWith(Number),
          totalHellers: sql<number>`SUM(amount_hellers)`.mapWith(Number),
        })
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.tenantId, tenantId),
            gte(schema.payments.createdAt, from),
            lte(schema.payments.createdAt, to),
          ),
        )
        .groupBy(schema.payments.methodType, schema.payments.status);
      return rows.filter((r) => canViewMethod(role, r.methodType));
    });
  }

  // ─── QR code generation ───────────────────────────────────────

  async generateQrPayment(
    tenantId: string,
    userId: string,
    role: AppRole,
    paymentId: string,
  ): Promise<{ spayd: string; amount: number; iban: string }> {
    assertCanRecord(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, tenantId)))
        .limit(1);
      if (!payment) {
        throw new NotFoundException({
          error: { code: 'PAYMENT_NOT_FOUND', message: 'Platba nenalezena.' },
        });
      }
      if (payment.methodType !== 'qr_bank') {
        throw new BadRequestException({
          error: { code: 'INVALID_METHOD', message: 'QR jen pro qr_bank platby.' },
        });
      }

      const [config] = await tx
        .select({ config: schema.paymentMethods.config })
        .from(schema.paymentMethods)
        .where(
          and(
            eq(schema.paymentMethods.tenantId, tenantId),
            eq(schema.paymentMethods.methodType, 'qr_bank'),
            eq(schema.paymentMethods.isEnabled, true),
          ),
        )
        .limit(1);
      if (!config) {
        throw new NotFoundException({
          error: {
            code: 'METHOD_NOT_CONFIGURED',
            message: 'QR platba není nakonfigurována (chybí IBAN).',
          },
        });
      }
      const iban = (config.config as Record<string, unknown>).iban as string;
      if (!iban) {
        throw new BadRequestException({
          error: { code: 'IBAN_MISSING', message: 'IBAN není nastaven.' },
        });
      }

      const spayd = generateSpaydString({
        iban,
        amount: payment.amountHellers / 100,
        currency: payment.currency,
        variableSymbol: payment.referenceCode ?? undefined,
        message: payment.description ?? `Platba ${payment.id.slice(0, 8)}`,
      });

      return {
        spayd,
        amount: payment.amountHellers / 100,
        iban,
      };
    });
  }
}
