// Stripe webhook handler pro platform billing.
// POST /api/v1/platform/webhooks/stripe-billing
//
// Endpoint je @Public() (Stripe nezná naše JWT). Verifikace přes signature.

import { BadRequestException, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { PlatformBillingService } from './platform-billing.service.js';

@Public()
@Controller('platform/webhooks')
export class PlatformBillingWebhookController {
  constructor(@Inject(PlatformBillingService) private readonly billing: PlatformBillingService) {}

  @Post('stripe-billing')
  @HttpCode(200)
  async stripeBilling(@Req() req: Request & { rawBody?: Buffer }): Promise<{ received: true }> {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      throw new BadRequestException({
        error: { code: 'MISSING_SIGNATURE', message: 'Stripe-Signature header chybí.' },
      });
    }
    if (!req.rawBody) {
      throw new BadRequestException({
        error: { code: 'MISSING_BODY', message: 'Raw body required for signature verification.' },
      });
    }
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}
