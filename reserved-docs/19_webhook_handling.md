# 19 — Webhook Handling: Stripe, Twilio, Google, Zoom

> Každý příchozí webhook = potenciálně kritická událost.
> Pravidlo číslo jedna: vždy vrátit 200 OK okamžitě, zpracovat async.
> Pravidlo číslo dvě: idempotence — stejný webhook může přijít 2×, výsledek musí být stejný.

---

## Architektura příjmu webhooků

```
Stripe / Twilio / Google
        │
        │  POST /webhooks/{provider}
        ▼
   API Endpoint
        │
        ├─ 1. Ověř podpis (HMAC signature)
        ├─ 2. Ulož do webhook_events (idempotence check)
        ├─ 3. Vrať 200 OK (do 3 sekund — jinak provider retry)
        │
        ▼
   BullMQ Queue (critical)
        │
        ▼
   Worker → zpracuj event → aktualizuj DB → emit notifications
```

---

## Tabulka webhook_events (idempotence)

```sql
CREATE TABLE webhook_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider          VARCHAR(20) NOT NULL,
  -- 'stripe', 'twilio', 'google_calendar', 'zoom'

  event_id          VARCHAR(255) NOT NULL,
  -- Unikátní ID od providera (Stripe: evt_xxx, Twilio: SMxxx)

  event_type        VARCHAR(100) NOT NULL,
  -- 'payment_intent.succeeded', 'message.delivered', atd.

  payload           JSONB NOT NULL,
  -- Celý raw payload od providera

  tenant_id         UUID REFERENCES tenants(id),
  -- NULL pokud nelze určit z payloadu ihned

  -- Stav zpracování
  status            VARCHAR(20) NOT NULL DEFAULT 'received',
  -- 'received'   → přijato, čeká na zpracování
  -- 'processing' → worker to zpracovává
  -- 'processed'  → úspěšně zpracováno
  -- 'failed'     → selhalo i po retry
  -- 'ignored'    → event_type který nezpracováváme

  processed_at      TIMESTAMPTZ,
  attempts          SMALLINT NOT NULL DEFAULT 0,
  last_error        TEXT,

  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotence constraint
  UNIQUE(provider, event_id)
);

CREATE INDEX idx_we_status ON webhook_events(status, received_at)
  WHERE status IN ('received', 'failed');
CREATE INDEX idx_we_tenant ON webhook_events(tenant_id, received_at DESC)
  WHERE tenant_id IS NOT NULL;
```

---

## Endpoint implementace

```typescript
// POST /webhooks/stripe
@Post('stripe')
@HttpCode(200)
async handleStripeWebhook(
  @RawBody() rawBody: Buffer,
  @Headers('stripe-signature') signature: string,
): Promise<{ received: boolean }> {

  // 1. Ověř podpis — pokud selže, vrať 400 (ne 200)
  let event: Stripe.Event;
  try {
    event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    throw new BadRequestException(`Webhook signature invalid: ${err.message}`);
  }

  // 2. Idempotence check + uložení
  try {
    await this.db.insert(webhookEvents).values({
      provider: 'stripe',
      event_id: event.id,
      event_type: event.type,
      payload: event,
    });
  } catch (err) {
    if (err.code === '23505') {
      // UNIQUE violation → already received → ignore safely
      return { received: true };
    }
    throw err;
  }

  // 3. Zařaď do fronty — NEBLOKUJ
  await this.queue.add('process_stripe_webhook', {
    webhookEventId: event.id,
    eventType: event.type,
  }, {
    priority: 1,
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });

  // 4. Vrať 200 ihned
  return { received: true };
}
```

---

## STRIPE WEBHOOKS

### Přehled — které eventy zpracováváme

```
PLATBY ZÁKAZNÍKŮ (bookings, packages):
  payment_intent.created              → zaznamenat
  payment_intent.succeeded            → ✅ KRITICKÉ
  payment_intent.payment_failed       → ✅ KRITICKÉ
  payment_intent.canceled             → aktualizovat stav
  charge.refunded                     → ✅ KRITICKÉ
  charge.dispute.created              → ✅ KRITICKÉ
  charge.dispute.updated              → aktualizovat spor
  charge.dispute.closed               → uzavřít spor

SUBSCRIPTIONS ZÁKAZNÍKŮ (series, packages):
  customer.subscription.created       → aktivovat
  customer.subscription.updated       → sync stavu
  customer.subscription.deleted       → ✅ KRITICKÉ
  invoice.paid                        → aktivovat/prodloužit
  invoice.payment_failed              → ✅ KRITICKÉ
  invoice.upcoming                    → notifikovat zákazníka

TENANT BILLING (naše SaaS platby):
  customer.subscription.created       → aktivovat plán
  customer.subscription.deleted       → spustit dunning
  invoice.paid                        → prodloužit plán
  invoice.payment_failed              → dunning sekvence

STRIPE CONNECT (marketplace):
  account.updated                     → sync KYC statusu
  account.application.deauthorized    → odpojit providera
  transfer.created                    → zaznamenat
  transfer.failed                     → ✅ KRITICKÉ
  payout.paid                         → sync zůstatku
  payout.failed                       → alert
```

---

### payment_intent.succeeded

```typescript
async handlePaymentIntentSucceeded(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const { reference_type, reference_id, tenant_id } = pi.metadata;

  // Aktualizuj payment záznam
  await db.update(payments)
    .set({ status: 'succeeded', stripe_charge_id: pi.latest_charge })
    .where(eq(payments.stripe_payment_intent_id, pi.id));

  if (reference_type === 'booking') {
    // Potvrď rezervaci
    await db.update(bookings)
      .set({ payment_status: 'paid' })
      .where(eq(bookings.id, reference_id));

    // Spusť confirmation email
    await this.notifications.enqueue('booking_confirmed', {
      booking_id: reference_id,
      tenant_id,
    });

    // Pokud je součástí série — aktualizuj session
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, reference_id),
    });
    if (booking.series_id) {
      await db.update(recurringSeriesSessions)
        .set({ was_charged: true, charged_amount: pi.amount })
        .where(eq(recurringSeriesSessions.booking_id, reference_id));
    }

  } else if (reference_type === 'customer_package') {
    // Aktivuj balíček
    await db.update(customerPackages)
      .set({
        status: 'active',
        purchased_at: new Date(),
        purchased_price: pi.amount,
      })
      .where(eq(customerPackages.id, reference_id));

    await this.notifications.enqueue('package_purchased', {
      customer_package_id: reference_id,
      tenant_id,
    });

  } else if (reference_type === 'tenant_subscription') {
    // Tenant zaplatil za SaaS plán
    await db.update(tenantSubscriptions)
      .set({ status: 'active' })
      .where(eq(tenantSubscriptions.id, reference_id));

    await db.update(tenants)
      .set({ status: 'active' })
      .where(eq(tenants.id, tenant_id));
  }

  // Audit log
  await this.audit.log({
    action: 'payment.succeeded',
    entity_type: reference_type,
    entity_id: reference_id,
    after_state: { amount: pi.amount, currency: pi.currency },
  });
}
```

---

### payment_intent.payment_failed

```typescript
async handlePaymentIntentFailed(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const { reference_type, reference_id, tenant_id } = pi.metadata;
  const failureCode = pi.last_payment_error?.code;
  const failureMessage = pi.last_payment_error?.message;

  await db.update(payments)
    .set({
      status: 'failed',
      metadata: { failure_code: failureCode, failure_message: failureMessage },
    })
    .where(eq(payments.stripe_payment_intent_id, pi.id));

  if (reference_type === 'booking') {
    // Booking zůstane v 'pending' — zákazník musí zaplatit znovu
    // Pokud byl hold aktivní — necháme ho expirovat přirozeně

    await this.notifications.enqueue('payment_failed_booking', {
      booking_id: reference_id,
      tenant_id,
      retry_url: `${process.env.APP_URL}/pay/${pi.id}`,
    });

    // Pokud 3. selhání → zruš booking automaticky
    const failCount = await this.getPaymentFailCount(reference_id);
    if (failCount >= 3) {
      await db.update(bookings)
        .set({
          status: 'cancelled',
          cancellation_initiator: 'system_auto',
          cancellation_reason: 'payment_failed',
        })
        .where(eq(bookings.id, reference_id));
    }

  } else if (reference_type === 'tenant_subscription') {
    // Spusť dunning sekvenci
    await this.jobs.add('tenant_dunning', { tenant_id, failure_count: 1 });
  }
}
```

---

### charge.refunded

```typescript
async handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;

  // Najdi payment dle stripe_charge_id
  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripe_charge_id, charge.id),
  });
  if (!payment) return; // Neznámý charge — ignore

  const refundedAmount = charge.amount_refunded;
  const isFullRefund = refundedAmount === charge.amount;

  await db.update(payments)
    .set({
      refunded_amount: refundedAmount,
      status: isFullRefund ? 'refunded' : 'partially_refunded',
      refunded_at: new Date(),
    })
    .where(eq(payments.id, payment.id));

  // Aktualizuj booking payment_status
  if (payment.booking_id) {
    await db.update(bookings)
      .set({
        payment_status: isFullRefund ? 'refunded' : 'partially_refunded',
      })
      .where(eq(bookings.id, payment.booking_id));
  }

  // Aktualizuj marketplace transakci
  if (payment.booking_id) {
    await db.update(marketplaceTransactions)
      .set({
        refunded_amount: refundedAmount,
        payout_status: isFullRefund ? 'refunded' : 'partial_refund',
      })
      .where(eq(marketplaceTransactions.booking_id, payment.booking_id));
  }

  await this.notifications.enqueue('refund_confirmed', {
    payment_id: payment.id,
    amount: refundedAmount,
  });
}
```

---

### charge.dispute.created

```typescript
async handleDisputeCreated(event: Stripe.Event) {
  const dispute = event.data.object as Stripe.Dispute;
  const charge = await this.stripe.charges.retrieve(dispute.charge as string);
  const pi_id = charge.payment_intent as string;

  // Najdi payment
  const payment = await db.query.payments.findFirst({
    where: eq(payments.stripe_payment_intent_id, pi_id),
  });
  if (!payment) return;

  // Zadržení marketplace payout
  if (payment.booking_id) {
    await db.update(marketplaceTransactions)
      .set({ payout_status: 'held' })
      .where(eq(marketplaceTransactions.booking_id, payment.booking_id));

    // Vytvoř dispute záznam
    await db.insert(marketplaceDisputes).values({
      booking_id: payment.booking_id,
      reason: 'unauthorized_charge',
      status: 'opened',
      customer_description: `Stripe dispute: ${dispute.reason}`,
      provider_response_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  // Alert platformnímu adminovi
  await this.notifications.enqueueAdmin('dispute_created', {
    dispute_id: dispute.id,
    amount: dispute.amount,
    reason: dispute.reason,
    due_by: dispute.evidence_details?.due_by,
  });

  await db.update(payments)
    .set({ disputed_at: new Date(), dispute_status: dispute.status })
    .where(eq(payments.id, payment.id));
}
```

---

### invoice.payment_failed (subscription)

```typescript
async handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoice.subscription as string;

  // Najdi tenant nebo customer subscription
  const tenantSub = await db.query.tenantSubscriptions.findFirst({
    where: eq(tenantSubscriptions.stripe_subscription_id, subscriptionId),
  });

  if (tenantSub) {
    // Tenant neplatí za SaaS
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantSub.tenant_id),
    });

    // Increment failure count
    const failureCount = (tenant.payment_failures ?? 0) + 1;
    await db.update(tenants)
      .set({ payment_failures: failureCount })
      .where(eq(tenants.id, tenantSub.tenant_id));

    // Dunning logika
    if (failureCount === 1) {
      await this.notifications.enqueue('tenant_payment_failed_1', {
        tenant_id: tenantSub.tenant_id,
      });
    } else if (failureCount === 2) {
      await this.notifications.enqueue('tenant_payment_failed_2', {
        tenant_id: tenantSub.tenant_id,
      });
    } else if (failureCount >= 3) {
      // Suspend tenant
      await db.update(tenants)
        .set({ status: 'suspended', suspended_at: new Date() })
        .where(eq(tenants.id, tenantSub.tenant_id));

      await this.notifications.enqueue('tenant_suspended', {
        tenant_id: tenantSub.tenant_id,
      });
    }
    return;
  }

  // Hledej customer package subscription
  const customerPackage = await db.query.customerPackages.findFirst({
    where: eq(customerPackages.stripe_subscription_id, subscriptionId),
  });
  if (customerPackage) {
    await db.update(customerPackages)
      .set({ subscription_status: 'past_due' })
      .where(eq(customerPackages.id, customerPackage.id));

    await this.notifications.enqueue('subscription_payment_failed', {
      customer_package_id: customerPackage.id,
    });
  }
}
```

---

### customer.subscription.deleted

```typescript
async handleSubscriptionDeleted(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;

  // Tenant subscription?
  const tenantSub = await db.query.tenantSubscriptions.findFirst({
    where: eq(tenantSubscriptions.stripe_subscription_id, sub.id),
  });

  if (tenantSub) {
    await db.update(tenantSubscriptions)
      .set({ status: 'cancelled', cancelled_at: new Date() })
      .where(eq(tenantSubscriptions.id, tenantSub.id));

    // Grace period 3 dny — tenant ještě funguje
    await db.update(tenants)
      .set({
        plan: 'free',
        plan_ends_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      })
      .where(eq(tenants.id, tenantSub.tenant_id));

    await this.notifications.enqueue('tenant_subscription_cancelled', {
      tenant_id: tenantSub.tenant_id,
    });
    return;
  }

  // Customer package subscription?
  const customerPackage = await db.query.customerPackages.findFirst({
    where: eq(customerPackages.stripe_subscription_id, sub.id),
  });
  if (customerPackage) {
    await db.update(customerPackages)
      .set({
        subscription_status: 'cancelled',
        status: 'cancelled',
      })
      .where(eq(customerPackages.id, customerPackage.id));

    // Aktivní série napojené na toto membership?
    await db.update(recurringSeries)
      .set({ status: 'suspended' })
      .where(
        and(
          eq(recurringSeries.billing_model, 'membership'),
          // Najdi série napojené na tento package
        )
      );

    await this.notifications.enqueue('subscription_cancelled', {
      customer_package_id: customerPackage.id,
    });
  }
}
```

---

### Stripe Connect — account.updated

```typescript
async handleConnectAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;

  const providerAccount = await db.query.providerPaymentAccounts.findFirst({
    where: eq(providerPaymentAccounts.stripe_account_id, account.id),
  });
  if (!providerAccount) return;

  await db.update(providerPaymentAccounts)
    .set({
      stripe_charges_enabled: account.charges_enabled,
      stripe_payouts_enabled: account.payouts_enabled,
      stripe_kyc_status: account.details_submitted
        ? (account.charges_enabled ? 'verified' : 'restricted')
        : 'pending',
    })
    .where(eq(providerPaymentAccounts.id, providerAccount.id));

  // Pokud právě prošel KYC → aktivuj providera
  if (account.charges_enabled && !providerAccount.stripe_charges_enabled) {
    await db.update(marketplaceProviders)
      .set({ is_verified: true })
      .where(eq(marketplaceProviders.id, providerAccount.provider_id));

    await this.notifications.enqueue('provider_kyc_approved', {
      provider_id: providerAccount.provider_id,
    });
  }
}
```

---

### transfer.failed (marketplace payout selhal)

```typescript
async handleTransferFailed(event: Stripe.Event) {
  const transfer = event.data.object as Stripe.Transfer;

  // Najdi payout dle stripe_transfer_id
  const payout = await db.query.providerPayouts.findFirst({
    where: eq(providerPayouts.stripe_payout_id, transfer.id),
  });
  if (!payout) return;

  await db.update(providerPayouts)
    .set({
      status: 'failed',
      failed_at: new Date(),
      failure_reason: transfer.failure_message ?? 'Unknown',
    })
    .where(eq(providerPayouts.id, payout.id));

  // Vrať transakce zpět na 'pending'
  await db.update(marketplaceTransactions)
    .set({ payout_status: 'pending' })
    .where(inArray(marketplaceTransactions.id, payout.transaction_ids));

  // Alert platformnímu adminovi + notifikuj providera
  await this.notifications.enqueueAdmin('payout_failed', {
    provider_id: payout.provider_id,
    amount: payout.net_amount,
    reason: transfer.failure_message,
  });

  await this.notifications.enqueue('provider_payout_failed', {
    provider_id: payout.provider_id,
    amount: payout.net_amount,
  });
}
```

---

## TWILIO WEBHOOKS

### Přehled

```
POST /webhooks/twilio/sms-status

MessageSid + MessageStatus:
  'queued'      → ignore
  'sent'        → ignore
  'delivered'   → UPDATE notification_log SET delivered_at
  'failed'      → mark failed, log error, try email fallback
  'undelivered' → totéž jako failed
```

```typescript
async handleTwilioSmsStatus(body: TwilioStatusBody) {
  const { MessageSid, MessageStatus, ErrorCode, To } = body;

  // Ověř Twilio signature
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    request.headers['x-twilio-signature'],
    `${process.env.APP_URL}/webhooks/twilio/sms-status`,
    body,
  );
  if (!valid) throw new UnauthorizedException();

  const notification = await db.query.notificationLog.findFirst({
    where: eq(notificationLog.provider_message_id, MessageSid),
  });
  if (!notification) return;

  if (MessageStatus === 'delivered') {
    await db.update(notificationLog)
      .set({ delivered_at: new Date() })
      .where(eq(notificationLog.id, notification.id));

  } else if (['failed', 'undelivered'].includes(MessageStatus)) {
    await db.update(notificationQueue)
      .set({ status: 'failed', failure_reason: `Twilio error ${ErrorCode}` })
      .where(eq(notificationQueue.id, notification.queue_id));

    // Fallback na email pokud má zákazník email
    await this.tryEmailFallback(notification, To);
  }
}
```

---

## GOOGLE CALENDAR WEBHOOKS

### Přehled

Google Calendar posílá push notifikace přes **Channel + Watch** mechanismus.
Musíme pravidelně obnovovat watch (každých 7 dní).

```
POST /webhooks/google-calendar/{channelId}
Headers:
  X-Goog-Channel-ID: channel_id
  X-Goog-Resource-State: 'sync' | 'exists' | 'not_exists'
```

```typescript
async handleGoogleCalendarPush(
  channelId: string,
  resourceState: string,
) {
  if (resourceState === 'sync') {
    // Inicializační event — ignore nebo proveď full sync
    return;
  }

  // Najdi integraci dle channelId
  const integration = await db.query.tenantIntegrations.findFirst({
    where: sql`config->>'channel_id' = ${channelId}`,
  });
  if (!integration) return;

  // Zařaď sync job (nesyncruj přímo zde — může být pomalé)
  await this.jobs.add('sync_google_calendar', {
    tenant_id: integration.tenant_id,
    trigger: 'push',
  }, { priority: 2 });
}
```

---

## ZOOM WEBHOOKS

### Přehled

```
POST /webhooks/zoom
Headers: Authorization: {zoom_webhook_secret_token}

meeting.ended       → označit booking jako completed
meeting.participant_joined → log (volitelné)
recording.completed → uložit recording URL do booking metadata
```

```typescript
async handleZoomWebhook(event: ZoomWebhookEvent) {
  // Ověř Zoom signature
  const message = `v0:${event.timestamp}:${JSON.stringify(event.payload)}`;
  const hash = crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
    .update(message).digest('hex');
  if (`v0=${hash}` !== event.headers['x-zm-signature']) {
    throw new UnauthorizedException();
  }

  if (event.event === 'meeting.ended') {
    const meetingId = event.payload.object.id;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.meeting_id, meetingId.toString()),
    });
    if (!booking) return;

    // Meeting skončil = booking completed
    await db.update(bookings)
      .set({ status: 'completed' })
      .where(eq(bookings.id, booking.id));

    await this.jobs.add('send_followup_and_review_request', {
      booking_id: booking.id,
    });

  } else if (event.event === 'recording.completed') {
    const meetingId = event.payload.object.id;
    const recordingUrl = event.payload.object.recording_files?.[0]?.download_url;

    if (recordingUrl) {
      await db.update(bookings)
        .set({
          metadata: sql`metadata || ${JSON.stringify({ recording_url: recordingUrl })}::jsonb`,
        })
        .where(eq(bookings.meeting_id, meetingId.toString()));
    }
  }
}
```

---

## Retry logika a dead letter queue

```typescript
// BullMQ konfigurace per typ jobu
const webhookJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 1000,        // 1s, 2s, 4s, 8s, 16s
  },
  removeOnComplete: false,  // zachovej historii
  removeOnFail: false,      // zachovej failures pro debugging
};

// Dead Letter Queue — po 5 selháních
queue.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    // Přesuň do DLQ
    await dlqQueue.add('dead_letter', {
      original_job: job.name,
      original_data: job.data,
      error: error.message,
      failed_at: new Date(),
    });

    // Alert
    await alerting.send({
      severity: 'critical',
      message: `Webhook job ${job.name} failed permanently`,
      data: job.data,
      error: error.message,
    });
  }
});
```

---

## Monitoring webhooků

```sql
-- Query: webhooky které se nepodařilo zpracovat za posledních 24h
SELECT
  provider,
  event_type,
  COUNT(*) AS failed_count,
  MIN(received_at) AS first_failed,
  MAX(received_at) AS last_failed
FROM webhook_events
WHERE status = 'failed'
  AND received_at > NOW() - INTERVAL '24 hours'
GROUP BY provider, event_type
ORDER BY failed_count DESC;

-- Query: průměrná doba zpracování per provider
SELECT
  provider,
  AVG(EXTRACT(EPOCH FROM (processed_at - received_at))) AS avg_processing_seconds,
  MAX(EXTRACT(EPOCH FROM (processed_at - received_at))) AS max_processing_seconds,
  COUNT(*) AS total
FROM webhook_events
WHERE status = 'processed'
  AND received_at > NOW() - INTERVAL '7 days'
GROUP BY provider;
```

---

## Přehled všech webhooků

| Provider | Event | Kritičnost | Akce |
|----------|-------|-----------|------|
| Stripe | payment_intent.succeeded | 🔴 Kritická | Potvrď platbu, aktivuj booking/package |
| Stripe | payment_intent.payment_failed | 🔴 Kritická | Oznám selhání, 3× retry pak zruš |
| Stripe | charge.refunded | 🔴 Kritická | Aktualizuj payment, notifikuj |
| Stripe | charge.dispute.created | 🔴 Kritická | Zadržet payout, vytvořit dispute |
| Stripe | charge.dispute.closed | 🟡 Důležitá | Uvolnit/propadnout payout |
| Stripe | invoice.paid | 🔴 Kritická | Aktivuj/prodlož subscription |
| Stripe | invoice.payment_failed | 🔴 Kritická | Dunning sekvence |
| Stripe | customer.subscription.deleted | 🔴 Kritická | Grace period, pak suspend |
| Stripe | account.updated (Connect) | 🟡 Důležitá | Sync KYC statusu |
| Stripe | transfer.failed (Connect) | 🔴 Kritická | Alert, vrátit payout do pending |
| Stripe | payout.paid (Connect) | 🟢 Info | Sync zůstatku |
| Twilio | MessageStatus=delivered | 🟢 Info | Potvrdit doručení |
| Twilio | MessageStatus=failed | 🟡 Důležitá | Email fallback |
| Google Cal | resource.exists | 🟡 Důležitá | Spustit calendar sync |
| Zoom | meeting.ended | 🟡 Důležitá | Dokončit booking |
| Zoom | recording.completed | 🟢 Info | Uložit URL záznamu |
