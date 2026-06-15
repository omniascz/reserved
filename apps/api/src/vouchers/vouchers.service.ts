// VouchersService — dárkové poukazy (sprint 10.9). Uplatnění s row-lockem
// (FOR UPDATE) proti dvojímu odečtu, podpora částečného uplatnění.

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@reserved/db';
import { type AppRole, serviceContext, type TenantContext } from '@reserved/rls-multitenancy';
import { randomBytes } from 'node:crypto';
import { DbService } from '../db/db.service.js';
import { EmailService } from '../email/email.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import type { IssueVoucherDto, RedeemVoucherDto } from './dto/voucher.dto.js';

const MANAGE_ROLES: AppRole[] = ['owner', 'manager', 'receptionist'];

function ctxFor(tenantId: string, userId: string, role: AppRole): TenantContext {
  return { tenantId, userId, role };
}

function assertCanManage(role: AppRole): void {
  if (!MANAGE_ROLES.includes(role)) {
    throw new ForbiddenException({
      error: { code: 'INSUFFICIENT_ROLE', message: 'Tento účet nemůže spravovat poukazy.' },
    });
  }
}

function generateCode(): string {
  const part = () =>
    randomBytes(2)
      .toString('hex')
      .toUpperCase()
      .replace(/[0OIL1]/g, 'X');
  return `GV-${part()}-${part()}`;
}

@Injectable()
export class VouchersService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
  ) {}

  /**
   * Online samoobslužný nákup voucheru (veřejné). Vytvoří voucher ve stavu
   * 'pending_payment', spustí checkout a vrátí URL. Po zaplacení webhook voucher
   * aktivuje (PaymentsService.handleWebhook) a pošle příjemci.
   */
  async purchaseOnline(
    tenantId: string,
    dto: {
      valueHellers: number;
      currency: string;
      recipientName?: string | null;
      recipientEmail?: string | null;
      purchaserEmail: string;
      methodType: 'stripe' | 'gopay' | 'mock' | 'comgate' | 'thepay' | 'payu' | 'gpwebpay';
    },
  ) {
    // 1. Vytvoř voucher pending_payment.
    const voucher = await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const [r] = await tx
            .insert(schema.giftVouchers)
            .values({
              tenantId,
              code: generateCode(),
              initialValueHellers: dto.valueHellers,
              remainingValueHellers: dto.valueHellers,
              currency: dto.currency,
              status: 'pending_payment',
              recipientName: dto.recipientName ?? null,
              recipientEmail: dto.recipientEmail ?? null,
              purchaserEmail: dto.purchaserEmail,
            })
            .returning();
          return r!;
        } catch (err) {
          const e = err as { code?: string; cause?: { code?: string } };
          if ((e.code ?? e.cause?.code) === '23505') continue;
          throw err;
        }
      }
      throw new BadRequestException({
        error: { code: 'CODE_GENERATION_FAILED', message: 'Nepodařilo se vygenerovat kód.' },
      });
    });

    // 2. Checkout na hodnotu voucheru.
    const base = process.env.APP_URL ?? 'http://localhost:4002';
    const checkout = await this.payments.createCheckoutSystem({
      tenantId,
      methodType: dto.methodType,
      amountHellers: dto.valueHellers,
      currency: dto.currency,
      description: `Dárkový poukaz ${voucher.code}`,
      customerEmail: dto.purchaserEmail,
      successUrl: `${base}/payment/success`,
      cancelUrl: `${base}/payment/cancel`,
    });

    // 3. Naváž platbu na voucher (webhook ho pak aktivuje).
    await this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      await tx
        .update(schema.giftVouchers)
        .set({ paymentId: checkout.paymentId, updatedAt: new Date() })
        .where(eq(schema.giftVouchers.id, voucher.id));
    });

    return {
      voucherId: voucher.id,
      code: voucher.code,
      status: 'pending_payment' as const,
      paymentId: checkout.paymentId,
      checkoutUrl: checkout.checkoutUrl,
    };
  }

  async issue(tenantId: string, userId: string, role: AppRole, dto: IssueVoucherDto) {
    assertCanManage(role);
    const row = await this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      // Generuj unikátní kód (retry na kolizi).
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        try {
          const [r] = await tx
            .insert(schema.giftVouchers)
            .values({
              tenantId,
              code,
              initialValueHellers: dto.valueHellers,
              remainingValueHellers: dto.valueHellers,
              currency: dto.currency,
              status: 'active',
              recipientName: dto.recipientName ?? null,
              recipientEmail: dto.recipientEmail ?? null,
              validUntil: dto.validUntilIso ? new Date(dto.validUntilIso) : null,
              note: dto.note ?? null,
              createdBy: userId,
            })
            .returning();
          return r!;
        } catch (err) {
          const e = err as { code?: string; cause?: { code?: string } };
          if ((e.code ?? e.cause?.code) === '23505') continue; // kolize kódu → zkus znovu
          throw err;
        }
      }
      throw new BadRequestException({
        error: { code: 'CODE_GENERATION_FAILED', message: 'Nepodařilo se vygenerovat kód.' },
      });
    });

    // Pošli dárek příjemci (po commitu, best-effort).
    if (row.recipientEmail) {
      await this.sendGiftEmail(tenantId, row);
    }
    return row;
  }

  /** Odešle dárkový poukaz příjemci e-mailem (kód + hodnota + vzkaz). */
  private async sendGiftEmail(
    tenantId: string,
    voucher: typeof schema.giftVouchers.$inferSelect,
  ): Promise<void> {
    if (!voucher.recipientEmail) return;
    const value = (voucher.initialValueHellers / 100).toLocaleString('cs-CZ');
    const greeting = voucher.recipientName ? `Ahoj ${voucher.recipientName},` : 'Dobrý den,';
    const note = voucher.note ? `\n\nVzkaz: ${voucher.note}` : '';
    try {
      await this.email.enqueue({
        tenantId,
        templateCode: 'custom',
        recipient: voucher.recipientEmail,
        vars: {
          __customSubject: `Dárkový poukaz na ${value} ${voucher.currency}`,
          __customBody:
            `${greeting}\n\nbyl vám darován poukaz v hodnotě ${value} ${voucher.currency}.\n` +
            `Kód poukazu: ${voucher.code}` +
            note,
        },
      });
    } catch {
      // odeslání e-mailu nesmí shodit vydání poukazu
    }
  }

  async listForAdmin(tenantId: string, userId: string, role: AppRole) {
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      return tx
        .select()
        .from(schema.giftVouchers)
        .where(eq(schema.giftVouchers.tenantId, tenantId))
        .orderBy(desc(schema.giftVouchers.createdAt))
        .limit(500);
    });
  }

  /** Veřejné ověření poukazu dle kódu (zůstatek + platnost). */
  async getByCode(tenantId: string, code: string) {
    return this.dbService.withRlsContext(serviceContext(tenantId), async (tx) => {
      const [v] = await tx
        .select()
        .from(schema.giftVouchers)
        .where(and(eq(schema.giftVouchers.tenantId, tenantId), eq(schema.giftVouchers.code, code)))
        .limit(1);
      if (!v) {
        throw new NotFoundException({
          error: { code: 'VOUCHER_NOT_FOUND', message: 'Poukaz nenalezen.' },
        });
      }
      const expired = v.validUntil != null && v.validUntil.getTime() <= Date.now();
      return {
        code: v.code,
        remainingValueHellers: v.remainingValueHellers,
        currency: v.currency,
        status: v.status,
        validUntil: v.validUntil,
        expired,
      };
    });
  }

  async redeem(tenantId: string, userId: string, role: AppRole, dto: RedeemVoucherDto) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [voucher] = await tx
        .select()
        .from(schema.giftVouchers)
        .where(
          and(eq(schema.giftVouchers.tenantId, tenantId), eq(schema.giftVouchers.code, dto.code)),
        )
        .limit(1)
        .for('update'); // row-lock proti souběžnému uplatnění

      if (!voucher) {
        throw new NotFoundException({
          error: { code: 'VOUCHER_NOT_FOUND', message: 'Poukaz nenalezen.' },
        });
      }
      if (voucher.status !== 'active') {
        throw new BadRequestException({
          error: { code: 'VOUCHER_NOT_ACTIVE', message: 'Poukaz není aktivní.' },
        });
      }
      if (voucher.validUntil && voucher.validUntil.getTime() <= Date.now()) {
        throw new BadRequestException({
          error: { code: 'VOUCHER_EXPIRED', message: 'Platnost poukazu vypršela.' },
        });
      }
      if (voucher.remainingValueHellers < dto.amountHellers) {
        throw new BadRequestException({
          error: {
            code: 'INSUFFICIENT_VALUE',
            message: `Na poukazu zbývá ${voucher.remainingValueHellers} hal., požadováno ${dto.amountHellers}.`,
          },
        });
      }

      const newRemaining = voucher.remainingValueHellers - dto.amountHellers;
      const [updated] = await tx
        .update(schema.giftVouchers)
        .set({
          remainingValueHellers: newRemaining,
          status: newRemaining === 0 ? 'redeemed' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.giftVouchers.id, voucher.id))
        .returning();

      await tx.insert(schema.voucherRedemptions).values({
        tenantId,
        voucherId: voucher.id,
        amountHellers: dto.amountHellers,
        bookingId: dto.bookingId ?? null,
        note: dto.note ?? null,
        createdBy: userId,
      });

      return {
        remainingValueHellers: updated!.remainingValueHellers,
        status: updated!.status,
      };
    });
  }

  async cancel(tenantId: string, userId: string, role: AppRole, voucherId: string) {
    assertCanManage(role);
    return this.dbService.withRlsContext(ctxFor(tenantId, userId, role), async (tx) => {
      const [updated] = await tx
        .update(schema.giftVouchers)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(eq(schema.giftVouchers.id, voucherId), eq(schema.giftVouchers.tenantId, tenantId)),
        )
        .returning();
      if (!updated) {
        throw new NotFoundException({
          error: { code: 'VOUCHER_NOT_FOUND', message: 'Poukaz nenalezen.' },
        });
      }
      return updated;
    });
  }
}
