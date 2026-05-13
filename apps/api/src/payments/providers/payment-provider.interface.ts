// PaymentProvider — sjednoceny interface pro online platebni brany.
//
// Konkretni implementace: StripeProvider, GoPayProvider, MockProvider.
// Vsechny vraci stejne tvary, takze controller volá jeden z nich podle
// tenant config bez znalosti detailu.

export interface CheckoutInput {
  /** Castka v halerich. */
  amountHellers: number;
  currency: string;
  /** Popis pro checkout UI (napr. '10x EMS trenink'). */
  description: string;
  /** URL pro redirect po uspechu. */
  successUrl: string;
  /** URL pro redirect po cancel/failure. */
  cancelUrl: string;
  /** Pro audit: tenant a payment ID. */
  metadata: Record<string, string>;
  /** Volitelne customer email pro pre-fill. */
  customerEmail?: string;
}

export interface CheckoutResult {
  /** URL kam redirectovat klienta (Stripe Checkout, GoPay payment URL). */
  checkoutUrl: string;
  /** Externi ID transakce (pi_xxx, ord_xxx) — ulozit do payments.externalId. */
  externalId: string;
}

export interface WebhookEvent {
  /** Mapped na nase status enum. */
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
  externalId: string;
  /** Castka v halerich (pro overeni). */
  amountHellers?: number;
  /** Selhani: duvod. */
  failureReason?: string;
  /** Raw payload pro audit log. */
  rawPayload: Record<string, unknown>;
}

export interface RefundInput {
  externalId: string;
  amountHellers?: number; // partial refund, default full
  reason?: string;
}

export interface RefundResult {
  externalId: string;
  status: 'succeeded' | 'pending' | 'failed';
}

export interface PaymentProvider {
  /** Provider identifier (matches DB methodType). */
  readonly type: 'stripe' | 'gopay' | 'mock';

  /** Vytvori checkout session, vrati URL. */
  createCheckout(input: CheckoutInput, config: Record<string, unknown>): Promise<CheckoutResult>;

  /** Parse + verify webhook. Hodi error pokud signature neplati. */
  verifyWebhook(
    rawBody: string | Buffer,
    signatureHeader: string,
    config: Record<string, unknown>,
  ): Promise<WebhookEvent>;

  /** Refund existing payment. */
  refund(input: RefundInput, config: Record<string, unknown>): Promise<RefundResult>;
}
