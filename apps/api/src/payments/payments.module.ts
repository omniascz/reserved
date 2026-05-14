import { forwardRef, Module } from '@nestjs/common';
import { DbModule } from '../db/db.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { WebhookController } from './webhook.controller.js';
import { CheckoutController } from './checkout.controller.js';
import { StripePaymentProvider } from './providers/stripe.provider.js';
import { GoPayPaymentProvider } from './providers/gopay.provider.js';
import { MockPaymentProvider } from './providers/mock.provider.js';
import { PaymentProviderRegistry } from './providers/provider.registry.js';

@Module({
  imports: [DbModule, forwardRef(() => SubscriptionsModule)],
  controllers: [PaymentsController, WebhookController, CheckoutController],
  providers: [
    PaymentsService,
    StripePaymentProvider,
    GoPayPaymentProvider,
    MockPaymentProvider,
    PaymentProviderRegistry,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
