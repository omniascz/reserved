// OrdersService — sjednocený košík (sprint 10.41). Víc položek různého typu
// (lekce + vstup + 1:1 + produkt) v jedné objednávce, jedna platba.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, type TenantContext } from '@reserved/rls-multitenancy';
import { DbService } from '../db/db.service.js';
import { PaymentsService } from '../payments/payments.service.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];
const MANUAL_METHODS = new Set(['cash', 'card_terminal', 'qr_bank']);

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

type ItemInput = {
  kind: 'class' | 'admission' | 'appointment' | 'course' | 'product' | 'other';
  refId?: string | null;
  name: string;
  priceHellers: number;
  quantity?: number;
};

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  /** Vytvoří objednávku z položek a spočítá součet. */
  async create(
    tenantId: string,
    userId: string,
    role: AppRole,
    dto: {
      customerName: string;
      customerEmail?: string | null;
      customerId?: string | null;
      currency?: string;
      items: ItemInput[];
    },
  ) {
    assertCanManage(role);
    if (!dto.items.length) {
      throw new BadRequestException({
        error: { code: 'EMPTY_ORDER', message: 'Košík je prázdný.' },
      });
    }
    const total = dto.items.reduce((s, i) => s + i.priceHellers * (i.quantity ?? 1), 0);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [order] = await tx
        .insert(schema.orders)
        .values({
          tenantId,
          customerId: dto.customerId ?? null,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail ?? null,
          totalHellers: total,
          currency: dto.currency ?? 'CZK',
        })
        .returning();
      const items = await tx
        .insert(schema.orderItems)
        .values(
          dto.items.map((i) => ({
            tenantId,
            orderId: order!.id,
            kind: i.kind,
            refId: i.refId ?? null,
            name: i.name,
            priceHellers: i.priceHellers,
            quantity: i.quantity ?? 1,
          })),
        )
        .returning();
      return { order: order!, items };
    });
  }

  async get(tenantId: string, userId: string, role: AppRole, orderId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [order] = await tx
        .select()
        .from(schema.orders)
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
        .limit(1);
      if (!order) {
        throw new NotFoundException({
          error: { code: 'ORDER_NOT_FOUND', message: 'Objednávka nenalezena.' },
        });
      }
      const items = await tx
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderId))
        .orderBy(schema.orderItems.createdAt);
      return { order, items };
    });
  }

  async list(tenantId: string, userId: string, role: AppRole) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.tenantId, tenantId))
        .orderBy(desc(schema.orders.createdAt))
        .limit(500);
    });
  }

  /**
   * Zaplatí CELOU objednávku jednou platbou. Manuální (hotovost/terminál/QR) =
   * rovnou zaplaceno; online brána = vrátí checkout URL.
   */
  async pay(tenantId: string, userId: string, role: AppRole, orderId: string, methodType: string) {
    assertCanManage(role);
    const { order } = await this.get(tenantId, userId, role, orderId);
    if (order.status === 'paid') {
      throw new BadRequestException({
        error: { code: 'ALREADY_PAID', message: 'Objednávka už je zaplacená.' },
      });
    }

    if (MANUAL_METHODS.has(methodType)) {
      const payment = await this.payments.recordPayment(tenantId, userId, role, {
        amountHellers: order.totalHellers,
        currency: order.currency,
        methodType: methodType as 'cash' | 'card_terminal' | 'qr_bank',
        customerId: order.customerId ?? undefined,
        description: `Objednávka ${order.id.slice(0, 8)}`,
      });
      await this.setPaid(tenantId, userId, role, orderId, payment.id);
      return { status: 'paid' as const, paymentId: payment.id, totalHellers: order.totalHellers };
    }

    // Online brána → checkout na celou částku.
    const base = process.env.APP_URL ?? 'http://localhost:4002';
    const checkout = await this.payments.createCheckout({
      tenantId,
      role,
      methodType: methodType as
        | 'stripe'
        | 'gopay'
        | 'mock'
        | 'comgate'
        | 'thepay'
        | 'payu'
        | 'gpwebpay',
      amountHellers: order.totalHellers,
      currency: order.currency,
      description: `Objednávka ${order.id.slice(0, 8)}`,
      customerId: order.customerId ?? undefined,
      customerEmail: order.customerEmail ?? undefined,
      successUrl: `${base}/payment/success`,
      cancelUrl: `${base}/payment/cancel`,
    });
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.orders)
        .set({ paymentId: checkout.paymentId, status: 'pending_payment', updatedAt: new Date() })
        .where(eq(schema.orders.id, orderId));
    });
    return {
      status: 'pending_payment' as const,
      paymentId: checkout.paymentId,
      checkoutUrl: checkout.checkoutUrl,
      totalHellers: order.totalHellers,
    };
  }

  private async setPaid(
    tenantId: string,
    userId: string,
    role: AppRole,
    orderId: string,
    paymentId: string,
  ) {
    await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      await tx
        .update(schema.orders)
        .set({ status: 'paid', paymentId, updatedAt: new Date() })
        .where(eq(schema.orders.id, orderId));
    });
  }
}
