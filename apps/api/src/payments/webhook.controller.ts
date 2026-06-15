// WebhookController — prijima notifikace od Stripe / GoPay / Mock.
//
// Verejne endpoint (bez auth), ale verifikuje signature pomocí webhook secretu
// z payment_methods.config. Pri uspechu update payment status, log do
// payment_events.
//
// URL format: /payments/webhooks/:tenantSlug/:provider
//   - tenantSlug — resolve tenantId
//   - provider — stripe | gopay | mock

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator.js';
import { DrizzleTenantLookup } from '../tenant/tenant-lookup.service.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments/webhooks')
export class WebhookController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(DrizzleTenantLookup) private readonly tenantLookup: DrizzleTenantLookup,
  ) {}

  private static readonly KNOWN_PROVIDERS = new Set([
    'stripe',
    'gopay',
    'mock',
    'comgate',
    'thepay',
    'payu',
    'gpwebpay',
  ]);

  @Public()
  @Post(':tenantSlug/:provider')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Param('tenantSlug') tenantSlug: string,
    @Param('provider') provider: string,
    @Headers('stripe-signature') stripeSig: string,
    @Headers('x-gopay-signature') gopaySig: string,
    @Headers('signature') genericSig: string,
    @Headers('x-signature') xSig: string,
    @Body() body: unknown,
  ): Promise<{ ok: boolean; status: string }> {
    const tenant = await this.tenantLookup.bySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: `Tenant ${tenantSlug} neexistuje.` },
      });
    }
    if (!WebhookController.KNOWN_PROVIDERS.has(provider)) {
      throw new NotFoundException({
        error: { code: 'UNKNOWN_PROVIDER', message: `Unknown provider: ${provider}` },
      });
    }

    // Raw body je potreba pro Stripe signature check. NestJS body parser jiz
    // proparsoval — pouzijeme req.rawBody (pokud middleware nastavil).
    // V main.ts musime povolit raw body capture pro tyto endpointy.
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(body);
    // CZ brány posílají podpis v různých hlavičkách (signature / x-signature),
    // GoPay nemá header (ověřuje se přes config). Vezmi první dostupný.
    const signature = stripeSig ?? gopaySig ?? genericSig ?? xSig ?? '';

    const result = await this.payments.handleWebhook(
      tenant.id,
      provider as 'stripe' | 'gopay' | 'mock' | 'comgate' | 'thepay' | 'payu' | 'gpwebpay',
      rawBody,
      signature,
    );
    return { ok: true, status: result.status };
  }
}
