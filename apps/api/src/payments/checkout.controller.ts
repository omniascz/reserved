// CheckoutController — admin vytvori online checkout pro klienta.
//
// POST /admin/payments/checkout
//   → vrati { paymentId, checkoutUrl }
// Admin link posle klientovi (e-mailem) nebo klient otevre ve widgetu.

import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { PaymentsService } from './payments.service.js';

const CreateCheckoutSchema = z.object({
  methodType: z.enum(['stripe', 'gopay', 'mock']),
  amountHellers: z.number().int().positive(),
  currency: z.string().length(3).default('CZK'),
  description: z.string().min(1).max(500),
  customerId: z.string().uuid().optional(),
  customerEmail: z.string().email().optional(),
  bookingId: z.string().uuid().optional(),
  creditPackAllocationId: z.string().uuid().optional(),
  /** Volitelne override return URL. */
  returnBaseUrl: z.string().url().optional(),
});
type CreateCheckoutDto = z.infer<typeof CreateCheckoutSchema>;

@Controller('admin/payments')
export class CheckoutController {
  constructor(@Inject(PaymentsService) private readonly svc: PaymentsService) {}

  @Post('checkout')
  @HttpCode(200)
  async createCheckout(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CreateCheckoutSchema)) dto: CreateCheckoutDto,
  ) {
    const baseUrl = dto.returnBaseUrl ?? process.env.PORTAL_BASE_URL ?? 'http://localhost:3005';
    const result = await this.svc.createCheckout({
      tenantId: user.tenantId,
      role: user.role,
      methodType: dto.methodType,
      amountHellers: dto.amountHellers,
      currency: dto.currency,
      description: dto.description,
      customerId: dto.customerId,
      customerEmail: dto.customerEmail,
      bookingId: dto.bookingId,
      creditPackAllocationId: dto.creditPackAllocationId,
      successUrl: `${baseUrl}/payments/success?id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/payments/cancel`,
    });
    return { data: result };
  }
}
