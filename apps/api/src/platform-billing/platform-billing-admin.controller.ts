// Endpointy pro tenant adminu (Pavla) — správa vlastního předplatného.
// Chráněno standardním JWT, jen owner může (manager může jen číst).

import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { PlatformBillingService } from './platform-billing.service.js';

const CheckoutSchema = z.object({
  planKey: z.enum(['starter', 'professional', 'business']),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

const CancelSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});

const PortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});

@Controller('admin/billing')
export class PlatformBillingAdminController {
  constructor(@Inject(PlatformBillingService) private readonly billing: PlatformBillingService) {}

  private requireOwner(user: AccessTokenPayload): void {
    if (user.role !== 'owner') {
      throw new ForbiddenException({
        error: { code: 'INSUFFICIENT_ROLE', message: 'Spravovat fakturaci muze jen vlastnik.' },
      });
    }
  }

  @Get('plans')
  async listPlans() {
    const data = await this.billing.listPlans();
    return { data };
  }

  @Get('status')
  async getStatus(@CurrentUser() user: AccessTokenPayload) {
    const data = await this.billing.getStatus(user.tenantId);
    return { data };
  }

  @Post('checkout')
  async createCheckout(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CheckoutSchema)) dto: z.infer<typeof CheckoutSchema>,
  ) {
    this.requireOwner(user);
    const data = await this.billing.createCheckoutSession({
      tenantId: user.tenantId,
      planKey: dto.planKey,
      interval: dto.interval,
    });
    return { data };
  }

  @Post('portal')
  async createPortalSession(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(PortalSchema)) dto: z.infer<typeof PortalSchema>,
  ) {
    this.requireOwner(user);
    const data = await this.billing.createPortalSession({
      tenantId: user.tenantId,
      returnUrl: dto.returnUrl,
    });
    return { data };
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CancelSchema)) dto: z.infer<typeof CancelSchema>,
  ) {
    this.requireOwner(user);
    const data = await this.billing.cancelSubscription({
      tenantId: user.tenantId,
      atPeriodEnd: dto.atPeriodEnd,
    });
    return { data };
  }

  @Post('resume')
  @HttpCode(200)
  async resume(@CurrentUser() user: AccessTokenPayload) {
    this.requireOwner(user);
    const data = await this.billing.resumeSubscription(user.tenantId);
    return { data };
  }
}
