import { Inject, Injectable } from '@nestjs/common';
import type { PaymentProvider } from './payment-provider.interface.js';
import { StripePaymentProvider } from './stripe.provider.js';
import { GoPayPaymentProvider } from './gopay.provider.js';
import { MockPaymentProvider } from './mock.provider.js';
import { ComgatePaymentProvider } from './comgate.provider.js';
import { ThePayPaymentProvider } from './thepay.provider.js';
import { PayUPaymentProvider } from './payu.provider.js';
import { GpWebpayPaymentProvider } from './gpwebpay.provider.js';

@Injectable()
export class PaymentProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    @Inject(StripePaymentProvider) stripe: StripePaymentProvider,
    @Inject(GoPayPaymentProvider) gopay: GoPayPaymentProvider,
    @Inject(MockPaymentProvider) mock: MockPaymentProvider,
    @Inject(ComgatePaymentProvider) comgate: ComgatePaymentProvider,
    @Inject(ThePayPaymentProvider) thepay: ThePayPaymentProvider,
    @Inject(PayUPaymentProvider) payu: PayUPaymentProvider,
    @Inject(GpWebpayPaymentProvider) gpwebpay: GpWebpayPaymentProvider,
  ) {
    this.providers.set('stripe', stripe);
    this.providers.set('gopay', gopay);
    this.providers.set('mock', mock);
    this.providers.set('comgate', comgate);
    this.providers.set('thepay', thepay);
    this.providers.set('payu', payu);
    this.providers.set('gpwebpay', gpwebpay);
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
