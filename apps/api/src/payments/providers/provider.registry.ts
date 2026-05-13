import { Inject, Injectable } from '@nestjs/common';
import type { PaymentProvider } from './payment-provider.interface.js';
import { StripePaymentProvider } from './stripe.provider.js';
import { GoPayPaymentProvider } from './gopay.provider.js';
import { MockPaymentProvider } from './mock.provider.js';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    @Inject(StripePaymentProvider) stripe: StripePaymentProvider,
    @Inject(GoPayPaymentProvider) gopay: GoPayPaymentProvider,
    @Inject(MockPaymentProvider) mock: MockPaymentProvider,
  ) {
    this.providers.set('stripe', stripe);
    this.providers.set('gopay', gopay);
    this.providers.set('mock', mock);
  }

  get(type: string): PaymentProvider {
    const p = this.providers.get(type);
    if (!p) {
      throw new Error(`Unknown payment provider: ${type}`);
    }
    return p;
  }

  has(type: string): boolean {
    return this.providers.has(type);
  }
}
