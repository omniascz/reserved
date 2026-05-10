# 18 — Background Jobs: Kompletní definice

> Každý job má: trigger, frekvenci, co přesně dělá, co se stane při selhání,
> timeout, prioritu a které tabulky čte/píše.
> Stack: BullMQ (Redis) + Node.js workers

---

## Architektura

```
API Server
    │
    ├── Emituje jobs do Redis Queue
    │
Redis (BullMQ)
    │
    ├── Queue: critical    (slot holds, platby)        workers: 5
    ├── Queue: default     (notifikace, série)         workers: 3
    ├── Queue: scheduled   (připomínky, emaily)        workers: 2
    └── Queue: maintenance (cleanup, stats, cache)     workers: 1
    │
Worker Servers (separátní process od API)
    └── Zpracovávají jobs z front
```

**Proč BullMQ a ne cron:**
- Job se při selhání automaticky retry (s exponential backoff)
- Vidíme historii každého jobu (succeeded / failed / retrying)
- Distribuované — více worker instancí bez duplicit
- Prioritizace — kritické joby jdou před méně důležité

---

## SKUPINA 1 — Kritické joby (Queue: critical)

### JOB-001: release_expired_holds

```yaml
název:      release_expired_holds
trigger:    Každých 30 sekund (repeat job)
queue:      critical
timeout:    10 sekund
priority:   1 (nejvyšší)
workers:    1 (singleton — nesmí běžet paralelně)

co_dělá:
  1. SELECT slot_holds WHERE status='active' AND expires_at < NOW()
  2. UPDATE slot_holds SET status='expired'
  3. Pro každý expirovaný hold:
     - Invaliduj availability_cache pro daný (tenant, branch, date)
     - Pokud existuje waiting_list pro daný slot → spusť JOB-021

čte:    slot_holds, waiting_list
píše:   slot_holds, availability_cache (DELETE)
emituje: notify_waiting_list (per uvolněný slot)

při_selhání:
  - Retry ihned 3×
  - Pokud stále selhává → alert (Slack/email) + pokračuj příštím cyklem
  - Expirované holds jsou sice stale ale nezpůsobují double booking
    (EXCLUDE constraint na bookings je druhá pojistka)

metrika:   Počet uvolněných holds per run (logovat)
```

---

### JOB-002: process_stripe_webhook

```yaml
název:      process_stripe_webhook
trigger:    Na vyžádání — Stripe pošle webhook → API ho zařadí do fronty
queue:      critical
timeout:    30 sekund
priority:   1

co_dělá:
  Dle event_type:

  payment_intent.succeeded:
    1. Najdi booking nebo customer_package dle metadata.reference_id
    2. UPDATE payments SET status='succeeded'
    3. UPDATE bookings SET payment_status='paid'
    4. Pokud booking: enqueue send_booking_confirmation (JOB-011)
    5. Pokud package: aktivuj customer_package

  payment_intent.payment_failed:
    1. UPDATE payments SET status='failed'
    2. Pokud booking vyžaduje platbu → booking zůstane 'pending'
    3. Enqueue: send_payment_failed_email

  charge.dispute.created:
    1. UPDATE marketplace_transactions SET payout_status='held'
    2. Vytvoř marketplace_disputes záznam
    3. Notifikuj admina platformy

  customer.subscription.deleted:
    1. UPDATE tenant_subscriptions SET status='cancelled'
    2. Nastav grace period 3 dny
    3. Enqueue: send_subscription_cancelled_email

  invoice.payment_failed (tenant billing):
    1. INCREMENT tenant.payment_failures
    2. Pokud failures >= 3 → suspend tenant
    3. Enqueue: dunning email

idempotence:
  Každý webhook se uloží do webhook_events PŘED zpracováním.
  Pokud event_id již existuje → skip (already processed).

čte:    webhook_events, bookings, payments, tenant_subscriptions
píše:   webhook_events, bookings, payments, customer_packages,
        tenant_subscriptions, marketplace_disputes

při_selhání:
  - Retry 5× s exponential backoff (1s, 5s, 30s, 2min, 10min)
  - Po 5 selháních → dead letter queue + alert
  - Stripe čeká na 200 OK max 5 sekund → API vrátí 200 ihned,
    zpracování je async v tomto jobu
```

---

### JOB-003: process_payment_refund

```yaml
název:      process_payment_refund
trigger:    Na vyžádání (admin spustí refund)
queue:      critical
timeout:    20 sekund
priority:   1

co_dělá:
  1. Zavolej Stripe API: refunds.create(charge_id, amount)
  2. UPDATE payments SET refunded_amount, status
  3. Pokud je booking součástí série:
     - Aktualizuj recurring_series_sessions
     - Aplikuj lapse_policy
  4. Enqueue: send_refund_confirmation (JOB-018)
  5. Audit log

čte:    payments, bookings, recurring_series_sessions
píše:   payments, bookings, audit_logs

při_selhání:
  - Retry 3×
  - Pokud Stripe vrátí error → alert + manuální řešení
  - NIKDY neopakovat refund bez ověření že předchozí pokus selhal
    (idempotency key pro Stripe)
```

---

## SKUPINA 2 — Generování rezervací ze sérií (Queue: default)

### JOB-010: generate_series_bookings

```yaml
název:      generate_series_bookings
trigger:    Každou noc ve 02:00 (cron: '0 2 * * *')
queue:      default
timeout:    10 minut
priority:   2

co_dělá:
  Pro každý aktivní tenant:
    Pro každou active recurring_series:
      1. Zjisti poslední vygenerovaný booking v sérii
         (MAX(actual_date) FROM recurring_series_sessions)
      2. Generuj sessions na příštích 60 dní dopředu
         (pokud ještě neexistují)
      3. Pro každou novou session:
         a. Ověř dostupnost zaměstnance (working_hours, exceptions, holidays)
         b. Ověř dostupnost workspace/resource
         c. Pokud dostupný:
            - INSERT INTO bookings (status='confirmed')
            - INSERT INTO recurring_series_sessions
         d. Pokud NEDOSTUPNÝ (svátek, dovolená zaměstnance):
            - INSERT INTO recurring_series_sessions (status='skipped_holiday'
              nebo status='paused_business')
            - Aplikuj lapse_policy pro danou sérii
            - Pokud lapse_policy='rollover':
              → Naplánuj náhradní session na konec série
            - Enqueue: notify_series_skip (JOB-014)

  Batch processing: po 100 sériích najednou
  (ochrana před memory overflow)

čte:    recurring_series, recurring_series_sessions, employee_working_hours,
        employee_schedule_exceptions, holidays, availability_blocks, workspaces
píše:   bookings, recurring_series_sessions, notification_queue

při_selhání:
  - Retry 3× s 5min odstupem
  - Logovej které série se nepodařilo generovat
  - Pokračuj ostatními sériemi (chyba v jedné nesmí zastavit ostatní)
  - Alert pokud > 5 % sérií selže

metrika:
  - Počet sérií zpracováno
  - Počet bookings vytvořeno
  - Počet přeskočených (holiday/exception)
  - Čas běhu (cíl: < 5 minut)
```

---

### JOB-011: check_series_health

```yaml
název:      check_series_health
trigger:    Každou noc ve 03:00 (cron: '0 3 * * *')
queue:      default
timeout:    5 minut

co_dělá:
  Pro každou active sérii:

  1. EXPIRY CHECK — blíží se konec prepaid bloku?
     IF prepaid_sessions_remaining <= 3 OR prepaid_expires_at <= NOW() + 30 days:
       → Enqueue: notify_series_expiring (JOB-019)
       → UPDATE series_status = 'expiring_soon'

  2. NO-SHOW THRESHOLD — příliš mnoho no-show?
     IF sessions_no_show >= rule.threshold_suspend_series:
       → UPDATE series_status = 'suspended'
       → Enqueue: notify_series_suspended

  3. PAYMENT OVERDUE — neuhrazená platba?
     IF billing_model='monthly_sub' AND subscription_status='past_due':
       → UPDATE series_status = 'suspended'

  4. PAUSED TOO LONG — pauza překročila limit?
     IF status='paused' AND paused_at < NOW() - (max_pause_duration_weeks || ' weeks')::INTERVAL:
       → UPDATE series_status = 'terminated'
       → Enqueue: notify_series_auto_terminated

  5. AUTO-RENEWAL — série expiruje a má auto_renew=true?
     IF prepaid_sessions_remaining = 0 AND auto_renew = TRUE:
       → Enqueue: process_series_renewal (JOB-012)

čte:    recurring_series, rules, tenant_subscriptions
píše:   recurring_series, notification_queue
```

---

### JOB-012: process_series_renewal

```yaml
název:      process_series_renewal
trigger:    Na vyžádání (z JOB-011 nebo admin)
queue:      default
timeout:    30 sekund

co_dělá:
  1. Načti sérii a renewal_payment_method_id
  2. Zavolej Stripe: vytvoř PaymentIntent pro renewal_block_size × price_per_session
  3. Pokud platba úspěšná:
     - UPDATE prepaid_sessions_total += renewal_block_size
     - UPDATE prepaid_expires_at (prodloužit)
     - UPDATE series_status = 'active' (pokud byl 'expiring_soon')
     - Enqueue: notify_series_renewed
     - Enqueue: generate_series_bookings (pro tuto sérii ihned)
  4. Pokud platba selhala:
     - Retry za 24h (max 3 pokusy)
     - Enqueue: notify_renewal_failed
     - Po 3 selháních: UPDATE series_status = 'suspended'

čte:    recurring_series, customer_packages
píše:   recurring_series, payments, notification_queue
```

---

## SKUPINA 3 — Notifikace (Queue: scheduled)

### JOB-020: send_reminders

```yaml
název:      send_reminders
trigger:    Každých 5 minut (cron: '*/5 * * * *')
queue:      scheduled
timeout:    2 minuty

co_dělá:
  1. SELECT bookings kde:
     - status IN ('confirmed', 'pending')
     - starts_at BETWEEN NOW() AND NOW() + 25h
     - reminder_1_sent_at IS NULL (pro 24h připomínku)
     NEBO
     - starts_at BETWEEN NOW() AND NOW() + 2h 5min
     - reminder_2_sent_at IS NULL (pro 2h připomínku)

  2. Pro každý booking:
     a. Načti tenant notification settings (jaké kanály, jak dlouho před)
     b. Načti customer notification preferences
     c. Pokud email → enqueue email job
     d. Pokud SMS → enqueue SMS job
     e. UPDATE bookings SET reminder_1_sent_at nebo reminder_2_sent_at = NOW()

  Batch: max 500 bookings per run

čte:    bookings, tenants, customers, notification_templates
píše:   bookings, notification_queue

pozn:   Každých 5 minut zajistí že připomínka odejde maximálně
        5 minut pozdě — akceptovatelné
```

---

### JOB-021: notify_waiting_list

```yaml
název:      notify_waiting_list
trigger:    Na vyžádání (slot uvolněn: storno, expirovaný hold)
queue:      scheduled
timeout:    10 sekund

co_dělá:
  1. Vstup: { tenantId, serviceId, employeeId, startsAt }
  2. SELECT waiting_list WHERE:
     - service_id = vstup.serviceId
     - employee_id = vstup.employeeId OR employee_id IS NULL
     - status = 'waiting'
     - (specific_slot_date = vstup.date OR wait_type = 'general')
     ORDER BY created_at ASC
     LIMIT 1

  3. Pokud existuje čekající:
     a. UPDATE waiting_list SET
          status = 'notified',
          notified_at = NOW(),
          notification_expires_at = NOW() + INTERVAL '30 minutes'
     b. Enqueue: send_slot_available_notification (email + SMS)
     c. Vytvoř slot_hold PRO TOHOTO zákazníka (rezervuje slot na 30 min)

  4. Pokud nikdo nečeká:
     → Uvolni slot (nic se neděje, slot je dostupný)

čte:    waiting_list, slot_holds
píše:   waiting_list, slot_holds, notification_queue
```

---

### JOB-022: process_notification_queue

```yaml
název:      process_notification_queue
trigger:    Každých 30 sekund
queue:      scheduled
timeout:    1 minuta

co_dělá:
  1. SELECT notification_queue WHERE
       status = 'queued'
       AND send_at <= NOW()
     ORDER BY send_at ASC
     LIMIT 100

  2. Pro každou notifikaci:
     a. Označit jako 'processing'
     b. Renderuj šablonu (dosaď proměnné)
     c. Dle channel:
        'email' → Postmark API
        'sms'   → Twilio API
        'push'  → Firebase FCM
     d. Pokud úspěch: UPDATE status='sent', sent_at=NOW(), provider_message_id
     e. Pokud chyba: UPDATE attempts++, next_retry_at = exponential_backoff()
     f. INSERT INTO notification_log

  3. Pokud attempts >= max_attempts → status='failed', alert

čte:    notification_queue, notification_templates
píše:   notification_queue, notification_log
```

---

### JOB-023: send_followup_and_review_request

```yaml
název:      send_followup_and_review_request
trigger:    Každou hodinu (cron: '0 * * * *')
queue:      scheduled
timeout:    2 minuty

co_dělá:
  1. SELECT bookings WHERE
       status = 'completed'
       AND ends_at BETWEEN NOW() - 3h AND NOW() - 1h
       AND followup_sent_at IS NULL
       AND review_requested_at IS NULL

  2. Pro každý booking:
     a. Pokud tenant má reviews zapnuté:
        → Enqueue: review request email
        → UPDATE bookings SET review_requested_at = NOW()
     b. Pokud tenant má followup zapnutý:
        → Enqueue: followup email (díky za návštěvu, příští termín)
        → UPDATE bookings SET followup_sent_at = NOW()

čte:    bookings, tenants
píše:   bookings, notification_queue
```

---

## SKUPINA 4 — Marketing & Retence (Queue: scheduled)

### JOB-030: churn_detection

```yaml
název:      churn_detection
trigger:    Každou noc ve 04:00 (cron: '0 4 * * *')
queue:      scheduled
timeout:    5 minut

co_dělá:
  1. Najdi zákazníky kteří jsou "at risk":
     SELECT customers WHERE
       last_booking_at < NOW() - INTERVAL '60 days'
       AND total_bookings >= 2
       AND status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM notification_log
         WHERE recipient_id = customers.id
           AND template_key = 'reactivation'
           AND sent_at > NOW() - INTERVAL '90 days'
       )

  2. Pro každého at-risk zákazníka:
     a. Aktualizuj tag: přidej 'at_risk'
     b. Enqueue: reactivation email
     c. Pokud zákazník má sérii → přidej do série health check

  3. Najdi zákazníky kteří se vrátili (last_booking > 60 dní, pak rezervovali):
     → Odeber tag 'at_risk', přidej 'returning'

čte:    customers, notification_log, bookings
píše:   customer_tags, notification_queue
```

---

### JOB-031: birthday_campaigns

```yaml
název:      birthday_campaigns
trigger:    Každý den v 08:00 (cron: '0 8 * * *')
queue:      scheduled
timeout:    2 minuty

co_dělá:
  1. SELECT customers WHERE
       EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM NOW() + INTERVAL '1 day')
       AND EXTRACT(DAY FROM date_of_birth) = EXTRACT(DAY FROM NOW() + INTERVAL '1 day')
       AND gdpr_consent->'marketing_email'->>'granted' = 'true'

  2. Pro každého:
     → Enqueue: birthday email (s personalizovanou nabídkou nebo slevou)

čte:    customers
píše:   notification_queue
```

---

### JOB-032: tenant_dunning

```yaml
název:      tenant_dunning
trigger:    Každý den v 09:00 (cron: '0 9 * * *')
queue:      scheduled
timeout:    2 minuty

co_dělá:
  Dunning sekvence pro tenanty s neúspěšnou platbou:

  D+1 po selhání platby:
    → Email: "Vaše platba selhala, zkuste znovu"
    → Stripe: retry platby

  D+3:
    → Email: "Poslední upozornění před pozastavením"
    → Stripe: retry platby

  D+7:
    → UPDATE tenants SET status='suspended'
    → Email: "Účet pozastaven"
    → Zákazníci tenanta: online formulář deaktivován

  D+37 (30 dní po pozastavení):
    → Email: "Data budou smazána za 30 dní"

  D+67:
    → Soft delete tenant dat (GDPR)
    → Zachovat anonymizované transakce pro účetnictví

čte:    tenants, tenant_subscriptions, payments
píše:   tenants, tenant_subscriptions, notification_queue
```

---

## SKUPINA 5 — Analytics & Maintenance (Queue: maintenance)

### JOB-040: rebuild_availability_cache

```yaml
název:      rebuild_availability_cache
trigger:    Každých 30 minut (cron: '*/30 * * * *')
            + Na vyžádání po větší změně (přidání zaměstnance, změna služby)
queue:      maintenance
timeout:    10 minut

co_dělá:
  1. Najdi záznamy kde valid_until < NOW() + INTERVAL '2 hours'
     (cache expiruje brzy nebo již expirovala)

  2. Pro každý (tenant, branch, employee, service, date) tuple:
     a. Spočítej dostupné sloty:
        - working_hours zaměstnance pro daný den
        - MINUS existující bookings (+ buffer)
        - MINUS availability_blocks
        - MINUS slot_holds (active)
        - MINUS holidays
        - Aplikuj display_rules (interval, zaokrouhlení)
        - Aplikuj priority_strategy (minimize_gaps, earliest...)
     b. UPSERT do availability_cache

  3. Generuj pouze pro:
     - Dnes + příštích 60 dní
     - Aktivní zaměstnance v aktivních pobočkách

  Batch: po 50 tuples najednou

čte:    employee_working_hours, bookings, availability_blocks,
        slot_holds, holidays, rules, services
píše:   availability_cache

metrika:
  - Počet přepočítaných cache záznamů
  - Průměrný čas výpočtu per tuple (cíl < 50ms)
```

---

### JOB-041: recalculate_risk_scores

```yaml
název:      recalculate_risk_scores
trigger:    Každou noc ve 01:00 (cron: '0 1 * * *')
queue:      maintenance
timeout:    10 minut

co_dělá:
  1. Pro každého zákazníka (batch po 1000):
     a. Spočítej za posledních 12 měsíců:
        - no_show_rate = no_show / total_bookings
        - late_cancel_rate = cancelled_late / total_bookings
        - payment_failure_count
     b. Spočítej risk_score (0–100)
     c. UPDATE customers SET risk_score

  2. Auto-tagging dle skóre:
     risk_score > 70 → přidej tag 'high_risk'
     risk_score > 40 → přidej tag 'at_risk'
     risk_score < 10 → přidej tag 'trusted'

  3. Aktualizuj auto_rule skupiny zákazníků

čte:    bookings, payments
píše:   customers, customer_tags
```

---

### JOB-042: update_marketplace_rankings

```yaml
název:      update_marketplace_rankings
trigger:    Každou noc ve 03:30 (cron: '30 3 * * *')
queue:      maintenance
timeout:    5 minut

co_dělá:
  1. Pro každého marketplace providera:
     a. Spočítej response_rate:
        = bookings confirmed within 24h / total bookings (last 30 days)
     b. Spočítej response_time_hours (průměr)
     c. Aktualizuj total_bookings
     d. Zavolej calculate_provider_rank()
     e. UPDATE marketplace_providers SET search_rank_score, response_rate, ...

  2. Pro každý marketplace_listing:
     a. Aktualizuj rating_average a rating_count z reviews
     b. Přepočítej listing search_rank_score

  3. Aktualizuj provider_count v marketplace_categories

čte:    bookings, reviews, marketplace_providers, marketplace_listings
píše:   marketplace_providers, marketplace_listings, marketplace_categories
```

---

### JOB-043: generate_commission_reports

```yaml
název:      generate_commission_reports
trigger:    1. den každého měsíce v 06:00 (cron: '0 6 1 * *')
queue:      maintenance
timeout:    15 minut

co_dělá:
  Pro každého tenanta s aktivními commission schemas:
    1. Najdi všechny completed bookings za minulý měsíc
       per zaměstnanec
    2. Aplikuj commission schema pravidla
    3. Vypočítej provize
    4. INSERT INTO employee_commissions (per zaměstnanec per měsíc)
    5. Enqueue: send commission report email (zaměstnanci + manažerovi)

čte:    bookings, commission_schemas, employees, service_employees
píše:   employee_commissions, notification_queue
```

---

### JOB-044: gdpr_data_retention

```yaml
název:      gdpr_data_retention
trigger:    Každou neděli ve 03:00 (cron: '0 3 * * 0')
queue:      maintenance
timeout:    30 minut

co_dělá:
  1. GDPR deletion requests:
     SELECT customers WHERE gdpr_deletion_requested_at < NOW() - INTERVAL '30 days'
     → Anonymizuj: first_name='Deleted', last_name='User', email=NULL, phone=NULL
     → UPDATE customers SET status='gdpr_deleted', gdpr_deleted_at=NOW()
     → Zachej záznamy v bookings a payments (účetní povinnost)

  2. Old audit logs:
     DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '7 years'
     (účetní archivace 7 let)

  3. Old notification logs:
     DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '2 years'

  4. Expirované slot holds:
     DELETE FROM slot_holds WHERE expires_at < NOW() - INTERVAL '7 days'
       AND status IN ('expired', 'released')

  5. Stale availability cache:
     DELETE FROM availability_cache WHERE valid_until < NOW() - INTERVAL '1 day'

  6. Deleted tenants:
     SELECT tenants WHERE deleted_at < NOW() - INTERVAL '90 days'
     → Hard delete všech tenant dat (kaskádově)
     → Zachej anonymizované finanční záznamy

čte:    customers, audit_logs, notification_log, slot_holds, tenants
píše:   customers, audit_logs, notification_log, slot_holds, tenants (hard delete)

důležité:
  - Celá funkce v jedné transakci per tenant
  - Logovej co bylo smazáno (do separátního deletion_log)
  - Nikdy nemaž data která jsou ještě v soudním sporu (dispute)
```

---

### JOB-045: generate_tenant_usage_stats

```yaml
název:      generate_tenant_usage_stats
trigger:    Každou noc ve 00:30 (cron: '30 0 * * *')
queue:      maintenance
timeout:    5 minut

co_dělá:
  Pro každého tenanta:
    1. Spočítej za aktuální měsíc:
       - employees_count (aktivní zaměstnanci)
       - branches_count (aktivní pobočky)
       - bookings_count (za aktuální měsíc)
       - sms_sent (z notification_log)
       - api_calls (z rate limit logu)
    2. UPSERT INTO tenant_usage
    3. Zkontroluj překročení limitů plánu:
       - Pokud employees > plan_limit → zobraz warning v dashboardu
       - Pokud SMS > included_sms → účtuj overage

čte:    employees, branches, bookings, notification_log
píše:   tenant_usage
```

---

### JOB-046: sync_google_calendar

```yaml
název:      sync_google_calendar
trigger:    Každých 15 minut (cron: '*/15 * * * *')
            + Webhooks z Google Calendar (push notifikace)
queue:      default
timeout:    2 minuty per tenant

co_dělá:
  Pro každou aktivní Google Calendar integraci:

  OUTBOUND (naše → Google):
    1. Najdi bookings které se změnily od posledního syncu
       (updated_at > last_synced_at)
    2. Pro každý booking:
       - CREATE/UPDATE/DELETE Google Calendar event
       - Ulož google_event_id do bookings.metadata

  INBOUND (Google → naše):
    1. Načti Google Calendar eventy od last_synced_at
    2. Pro každý event:
       - Pokud odpovídá booking → ignoruj (naše event)
       - Pokud je to nový "busy" blok → vytvoř availability_block
       - Pokud byl busy blok smazán → smaž availability_block

  UPDATE tenant_integrations SET last_synced_at = NOW()

čte:    bookings, tenant_integrations, availability_blocks
píše:   bookings, availability_blocks, tenant_integrations

error_handling:
  - OAuth token expiroval → refresh token → retry
  - Pokud refresh selže → notify tenant admina
  - Rate limit Google API → exponential backoff
```

---

### JOB-047: process_marketplace_payouts

```yaml
název:      process_marketplace_payouts
trigger:    Každý den v 10:00 (cron: '0 10 * * *')
queue:      maintenance
timeout:    10 minut

co_dělá:
  1. Najdi provider_payment_accounts kde payout je scheduled na dnes
     (dle payout_schedule: daily/weekly/monthly)

  2. Pro každého providera:
     a. Najdi marketplace_transactions kde:
        - payout_status = 'pending'
        - booking.status = 'completed'
        - booking.ends_at < NOW() - INTERVAL '24 hours'
          (ochrana před okamžitým payout — čas na dispute)
     b. Pokud žádné transakce → skip
     c. Spočítej net_amount = SUM(provider_amount)
     d. Pokud net_amount < minimum_payout → skip (akumuluj)
     e. Zavolej Stripe Transfer API:
        stripe.transfers.create({
          amount: net_amount,
          currency: 'czk',
          destination: stripe_account_id
        })
     f. INSERT INTO provider_payouts
     g. UPDATE marketplace_transactions SET payout_status='paid'
     h. Enqueue: send_payout_confirmation

čte:    provider_payment_accounts, marketplace_transactions, bookings
píše:   provider_payouts, marketplace_transactions, notification_queue
```

---

## Přehled všech jobů

| Job ID | Název | Trigger | Queue | Timeout |
|--------|-------|---------|-------|---------|
| JOB-001 | release_expired_holds | každých 30s | critical | 10s |
| JOB-002 | process_stripe_webhook | na vyžádání | critical | 30s |
| JOB-003 | process_payment_refund | na vyžádání | critical | 20s |
| JOB-010 | generate_series_bookings | 02:00 denně | default | 10min |
| JOB-011 | check_series_health | 03:00 denně | default | 5min |
| JOB-012 | process_series_renewal | na vyžádání | default | 30s |
| JOB-020 | send_reminders | každých 5min | scheduled | 2min |
| JOB-021 | notify_waiting_list | na vyžádání | scheduled | 10s |
| JOB-022 | process_notification_queue | každých 30s | scheduled | 1min |
| JOB-023 | send_followup_and_review | každou hodinu | scheduled | 2min |
| JOB-030 | churn_detection | 04:00 denně | scheduled | 5min |
| JOB-031 | birthday_campaigns | 08:00 denně | scheduled | 2min |
| JOB-032 | tenant_dunning | 09:00 denně | scheduled | 2min |
| JOB-040 | rebuild_availability_cache | každých 30min | maintenance | 10min |
| JOB-041 | recalculate_risk_scores | 01:00 denně | maintenance | 10min |
| JOB-042 | update_marketplace_rankings | 03:30 denně | maintenance | 5min |
| JOB-043 | generate_commission_reports | 1. den měsíce | maintenance | 15min |
| JOB-044 | gdpr_data_retention | neděle 03:00 | maintenance | 30min |
| JOB-045 | generate_tenant_usage_stats | 00:30 denně | maintenance | 5min |
| JOB-046 | sync_google_calendar | každých 15min | default | 2min |
| JOB-047 | process_marketplace_payouts | 10:00 denně | maintenance | 10min |

---

## Monitoring jobů

```typescript
// Každý job loguje:
{
  job_id:       "JOB-010",
  run_id:       uuid,
  started_at:   timestamp,
  finished_at:  timestamp,
  duration_ms:  number,
  status:       "success" | "failed" | "partial",
  items_processed: number,
  items_failed:    number,
  error:        string | null
}

// Alerting pravidla:
// - Job neběžel déle než 2× jeho interval → alert
// - Job selhal 3× za sebou → alert
// - Duration > 2× normálního průměru → warning
// - Dead letter queue má položky → alert
```
