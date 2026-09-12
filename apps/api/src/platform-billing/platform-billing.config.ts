import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const EnvSchema = z.object({
  /** Stripe Secret Key Reserved platformy (jeden pro celý SaaS). */
  STRIPE_PLATFORM_SECRET_KEY: z.string().optional(),
  /** Stripe Webhook Signing Secret pro endpoint /platform/webhooks/stripe-billing. */
  STRIPE_PLATFORM_WEBHOOK_SECRET: z.string().optional(),
  /** Master URL pro success/cancel callbacks z Stripe Checkout. */
  MASTER_BASE_URL: z.string().default('http://localhost:4001'),
  ADMIN_BASE_URL: z.string().default('http://localhost:4002'),
});

@Injectable()
export class PlatformBillingConfig {
  private readonly env: z.infer<typeof EnvSchema>;

  constructor() {
    this.env = EnvSchema.parse(process.env);
  }

  get stripeSecretKey(): string | null {
    return this.env.STRIPE_PLATFORM_SECRET_KEY ?? null;
  }

  get webhookSecret(): string | null {
    return this.env.STRIPE_PLATFORM_WEBHOOK_SECRET ?? null;
  }

  get adminBaseUrl(): string {
    return this.env.ADMIN_BASE_URL;
  }

  get masterBaseUrl(): string {
    return this.env.MASTER_BASE_URL;
  }

  isConfigured(): boolean {
    return !!this.env.STRIPE_PLATFORM_SECRET_KEY;
  }
}
