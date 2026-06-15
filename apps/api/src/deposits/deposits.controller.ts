import { Body, Controller, Get, Inject, Post, Query, Redirect } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { AccessTokenPayload } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../auth/zod-validation.pipe.js';
import { DepositsService } from './deposits.service.js';

const PROVIDERS = ['stripe', 'gopay', 'mock', 'comgate', 'thepay', 'payu', 'gpwebpay'] as const;
const ProviderSchema = z.object({ provider: z.enum(PROVIDERS) });
const CollectSchema = z.object({
  bookingId: z.string().uuid(),
  methodType: z.enum(PROVIDERS).default('stripe'),
});

@Controller('admin/payments')
export class DepositsController {
  constructor(@Inject(DepositsService) private readonly svc: DepositsService) {}

  @Get('connect/status')
  async connectStatus(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.connectStatus(user.tenantId, user.sub, user.role) };
  }

  @Post('connect/start')
  async connectStart(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(ProviderSchema)) dto: z.infer<typeof ProviderSchema>,
  ) {
    return { data: await this.svc.connectStart(user.tenantId, user.sub, user.role, dto.provider) };
  }

  /** Stripe Connect: vrátí authorize URL pro onboarding (reálný OAuth). */
  @Get('connect/stripe/url')
  async stripeConnectUrl(@CurrentUser() user: AccessTokenPayload) {
    return { data: await this.svc.stripeConnectUrl(user.tenantId, user.sub, user.role) };
  }

  /** Stripe Connect OAuth callback (veřejné — Stripe sem přesměruje prohlížeč). */
  @Public()
  @Get('connect/stripe/callback')
  @Redirect()
  async stripeConnectCallback(@Query('code') code: string, @Query('state') state: string) {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    try {
      await this.svc.stripeConnectCallback(code, state);
      return { url: `${appUrl}/settings/payments?connected=stripe` };
    } catch {
      return { url: `${appUrl}/settings/payments?connect_error=1` };
    }
  }

  @Get('deposit/quote')
  async depositQuote(
    @CurrentUser() user: AccessTokenPayload,
    @Query('serviceId') serviceId: string,
    @Query('customerId') customerId?: string,
  ) {
    return {
      data: await this.svc.quoteDeposit(user.tenantId, user.sub, user.role, {
        serviceId,
        customerId,
      }),
    };
  }

  @Post('deposit/collect')
  async collectDeposit(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CollectSchema)) dto: z.infer<typeof CollectSchema>,
  ) {
    return {
      data: await this.svc.collectDeposit(user.tenantId, user.sub, user.role, {
        bookingId: dto.bookingId,
        methodType: dto.methodType,
      }),
    };
  }

  /** Pay-per-slot: vybere plnou cenu služby předem. */
  @Post('collect-full')
  async collectFull(
    @CurrentUser() user: AccessTokenPayload,
    @Body(new ZodValidationPipe(CollectSchema)) dto: z.infer<typeof CollectSchema>,
  ) {
    return {
      data: await this.svc.collectFullPayment(user.tenantId, user.sub, user.role, {
        bookingId: dto.bookingId,
        methodType: dto.methodType,
      }),
    };
  }
}
