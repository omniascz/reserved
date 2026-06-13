import { forwardRef, Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { WebhookController } from './webhook.controller.js';
import { CheckoutController } from './checkout.controller.js';
import { StripePaymentProvider } from './providers/stripe.provider.js';
import { GoPayPaymentProvider } from './providers/gopay.provider.js';
import { MockPaymentProvider } from './providers/mock.provider.js';
import { ComgatePaymentProvider } from './providers/comgate.provider.js';
import { ThePayPaymentProvider } from './providers/thepay.provider.js';
import { PayUPaymentProvider } from './providers/payu.provider.js';
import { GpWebpayPaymentProvider } from './providers/gpwebpay.provider.js';
import { PaymentProviderRegistry } from './providers/provider.registry.js';

@Module({
  imports: [DbModule, TenantModule, forwardRef(() => SubscriptionsModule)],
  controllers: [PaymentsController, WebhookController, CheckoutController],
  providers: [
    PaymentsService,
    StripePaymentProvider,
    GoPayPaymentProvider,
    MockPaymentProvider,
    ComgatePaymentProvider,
    ThePayPaymentProvider,
    PayUPaymentProvider,
    GpWebpayPaymentProvider,
    PaymentProviderRegistry,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
