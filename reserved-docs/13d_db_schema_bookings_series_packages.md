# 13d — Databázové schema: Bookings, Recurring Series, Packages, Payments

---

## BLOK 9 — Bookings (rezervace)

```sql
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE booking_status AS ENUM (
  'draft',              -- rozepsaná, nezafinalizovaná (guest checkout)
  'pending',            -- čeká na schválení adminem
  'confirmed',          -- potvrzená aktivní rezervace
  'arrived',            -- zákazník dorazil (custom milestone)
  'in_progress',        -- probíhá (custom milestone)
  'completed',          -- dokončeno + checkout
  'cancelled',          -- zrušeno
  'no_show'             -- zákazník nedorazil
);

CREATE TYPE booking_source AS ENUM (
  'online_widget',      -- zákazník přes online formulář
  'customer_portal',    -- zákazník přes svůj portál
  'admin_manual',       -- admin ručně
  'employee_manual',    -- zaměstnanec ručně
  'api',                -- přes API
  'walk_in',            -- příchod bez rezervace
  'phone',              -- telefonická (zadána adminem)
  'instagram',          -- přes Instagram
  'facebook',           -- přes Facebook
  'google',             -- přes Google Business
  'whatsapp',           -- přes WhatsApp
  'recurring_auto'      -- automaticky generovaná z série
);

CREATE TYPE cancellation_initiator AS ENUM (
  'customer_self',
  'customer_request_approved',
  'admin_manual',
  'employee_manual',
  'system_auto',        -- threshold, expiry
  'business_operational',
  'force_majeure'
);

CREATE TYPE cancellation_reason AS ENUM (
  'customer_no_show',
  'customer_illness',
  'customer_personal',
  'customer_travel',
  'customer_no_reason',
  'employee_illness',
  'employee_vacation',
  'employee_left',
  'business_holiday',
  'business_closed',
  'business_error',
  'technical_issue',
  'weather',
  'force_majeure',
  'duplicate_booking',
  'payment_failed',
  'other'
);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE bookings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  
  -- Aktéři
  service_id            UUID NOT NULL REFERENCES services(id),
  employee_id           UUID REFERENCES employees(id),   -- NULL = nezadán
  customer_id           UUID REFERENCES customers(id),   -- NULL = walk-in/guest
  workspace_id          UUID REFERENCES workspaces(id),  -- NULL = nezadáno
  
  -- Guest booking (pokud customer_id = NULL)
  guest_name            VARCHAR(200),
  guest_email           VARCHAR(255),
  guest_phone           VARCHAR(50),
  
  -- Čas
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  duration_minutes      INTEGER NOT NULL,
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes  INTEGER NOT NULL DEFAULT 0,
  timezone              VARCHAR(64) NOT NULL,  -- timezone zákazníka v době rezervace
  
  -- Stav
  status                booking_status NOT NULL DEFAULT 'confirmed',
  source                booking_source NOT NULL DEFAULT 'online_widget',
  
  -- Série
  series_id             UUID,  -- FK na recurring_series (nastaví se níže)
  series_sequence       INTEGER,  -- pořadové číslo v sérii
  
  -- Storno / no-show detail
  cancelled_at          TIMESTAMPTZ,
  cancelled_by          UUID,
  cancellation_initiator cancellation_initiator,
  cancellation_reason   cancellation_reason,
  cancellation_notes    TEXT,
  no_show_at            TIMESTAMPTZ,
  no_show_marked_by     UUID,
  
  -- Přesun
  rescheduled_from_id   UUID REFERENCES bookings(id),   -- odkud bylo přesunuto
  rescheduled_to_id     UUID REFERENCES bookings(id),   -- kam bylo přesunuto
  reschedule_initiator  VARCHAR(30),
  reschedule_reason     TEXT,
  
  -- Finance
  base_price            INTEGER NOT NULL DEFAULT 0,  -- haléře
  final_price           INTEGER NOT NULL DEFAULT 0,  -- po slevách
  discount_amount       INTEGER NOT NULL DEFAULT 0,
  surcharge_amount      INTEGER NOT NULL DEFAULT 0,
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  payment_status        VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  -- 'unpaid', 'partial', 'paid', 'refunded', 'partially_refunded', 'waived'
  deposit_amount        INTEGER NOT NULL DEFAULT 0,
  deposit_paid          INTEGER NOT NULL DEFAULT 0,
  
  -- Package / credit čerpání
  package_credit_id     UUID,   -- FK na customer_package_credits
  credits_used          INTEGER NOT NULL DEFAULT 0,
  
  -- Interní
  internal_notes        TEXT,
  admin_notes           TEXT,
  
  -- Customer-facing poznámka (od zákazníka při rezervaci)
  customer_notes        TEXT,
  
  -- Custom fields (odpovědi z intake formu)
  custom_field_values   JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Online meeting
  meeting_url           TEXT,
  meeting_id            VARCHAR(255),
  meeting_provider      VARCHAR(30),
  
  -- Notifikace
  confirmation_sent_at  TIMESTAMPTZ,
  reminder_1_sent_at    TIMESTAMPTZ,
  reminder_2_sent_at    TIMESTAMPTZ,
  followup_sent_at      TIMESTAMPTZ,
  
  -- Recenze
  review_requested_at   TIMESTAMPTZ,
  review_id             UUID,   -- FK na reviews
  
  -- Skupina (pro group bookings — odkaz na skupinový slot)
  group_slot_id         UUID,   -- FK na group_slots
  
  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_by            UUID,
  
  -- Constraints
  CONSTRAINT bookings_time_check CHECK (ends_at > starts_at),
  CONSTRAINT bookings_price_check CHECK (final_price >= 0)
);

-- Kritické indexy pro výkon
CREATE INDEX idx_bookings_tenant_time ON bookings(tenant_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled', 'no_show');
CREATE INDEX idx_bookings_employee_time ON bookings(employee_id, starts_at, ends_at)
  WHERE status NOT IN ('cancelled', 'no_show') AND employee_id IS NOT NULL;
CREATE INDEX idx_bookings_customer ON bookings(customer_id, starts_at DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX idx_bookings_branch_date ON bookings(branch_id, starts_at)
  WHERE status NOT IN ('cancelled', 'no_show');
CREATE INDEX idx_bookings_series ON bookings(series_id)
  WHERE series_id IS NOT NULL;
CREATE INDEX idx_bookings_status ON bookings(tenant_id, status);
CREATE INDEX idx_bookings_workspace ON bookings(workspace_id, starts_at, ends_at)
  WHERE workspace_id IS NOT NULL AND status NOT IN ('cancelled', 'no_show');
-- Partial index pro aktuální a budoucí rezervace (nejčastější query)
CREATE INDEX idx_bookings_upcoming ON bookings(tenant_id, starts_at)
  WHERE status IN ('confirmed', 'pending') AND starts_at > NOW();

-- ============================================================
-- BOOKING RESOURCES (které zdroje jsou rezervovány s danou rezervací)
-- ============================================================
CREATE TABLE booking_resources (
  booking_id            UUID NOT NULL REFERENCES bookings(id),
  resource_id           UUID NOT NULL REFERENCES resources(id),
  tenant_id             UUID NOT NULL,
  quantity              INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (booking_id, resource_id)
);

-- ============================================================
-- GROUP SLOTS (pro skupinové lekce a workshopy)
-- GroupSlot je "kontejner" pro více bookings na stejný čas
-- ============================================================
CREATE TABLE group_slots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  service_id            UUID NOT NULL REFERENCES services(id),
  employee_id           UUID REFERENCES employees(id),
  workspace_id          UUID REFERENCES workspaces(id),
  
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  
  min_capacity          INTEGER NOT NULL DEFAULT 1,
  max_capacity          INTEGER NOT NULL,
  enrolled_count        INTEGER NOT NULL DEFAULT 0,  -- denormalizované
  
  status                VARCHAR(20) NOT NULL DEFAULT 'open',
  -- 'open', 'full', 'cancelled', 'completed'
  
  -- Série
  series_id             UUID,
  
  -- Cancellation (celá lekce)
  cancelled_at          TIMESTAMPTZ,
  cancelled_by          UUID,
  cancellation_reason   cancellation_reason,
  refund_issued         BOOLEAN,
  
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gs_tenant_time ON group_slots(tenant_id, starts_at) WHERE status = 'open';
CREATE INDEX idx_gs_series ON group_slots(series_id) WHERE series_id IS NOT NULL;

-- ============================================================
-- BOOKING STATUS HISTORY (každá změna stavu = záznam)
-- ============================================================
CREATE TABLE booking_status_history (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id            UUID NOT NULL REFERENCES bookings(id),
  tenant_id             UUID NOT NULL,
  
  from_status           booking_status,   -- NULL = první stav
  to_status             booking_status NOT NULL,
  
  changed_by_type       VARCHAR(30) NOT NULL,
  -- 'customer_self', 'admin', 'employee', 'system', 'api'
  changed_by_id         UUID,
  
  reason                TEXT,
  metadata              JSONB,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bsh_booking ON booking_status_history(booking_id, created_at DESC);

-- ============================================================
-- APPROVAL REQUESTS (žádosti zákazníka ke schválení adminem)
-- ============================================================
CREATE TYPE approval_request_type AS ENUM (
  'cancel',
  'reschedule',
  'pause_series',
  'transfer_series',
  'branch_change',
  'employee_change',
  'exception_request'
);

CREATE TABLE approval_requests (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  request_type          approval_request_type NOT NULL,
  
  -- Žadatel
  customer_id           UUID NOT NULL REFERENCES customers(id),
  
  -- Co se týká
  booking_id            UUID REFERENCES bookings(id),
  series_id             UUID,   -- FK na recurring_series
  
  -- Detaily žádosti
  reason                TEXT,
  customer_message      TEXT,
  preferred_new_date    DATE,
  preferred_new_time    TIME,
  preferred_new_employee_id UUID,
  preferred_new_branch_id   UUID,
  
  -- Stav
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending', 'approved', 'rejected', 'auto_approved', 'expired', 'withdrawn'
  
  -- Vyřízení
  resolved_by           UUID,
  resolved_at           TIMESTAMPTZ,
  resolution_notes      TEXT,
  
  -- Automatická expirace (pokud admin nereaguje)
  expires_at            TIMESTAMPTZ,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ar_tenant_status ON approval_requests(tenant_id, status) WHERE status = 'pending';
CREATE INDEX idx_ar_customer ON approval_requests(customer_id);
```

---

## BLOK 10 — Recurring Series (permanentky)

```sql
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE series_status AS ENUM (
  'active',
  'paused',          -- dočasně pozastavena
  'suspended',       -- pozastavena systémem (dluh, pravidla)
  'expiring_soon',   -- < X lekcí zbývá
  'completed',       -- přirozeně ukončena
  'terminated',      -- předčasně ukončena
  'archived'         -- archivovaná (read-only)
);

CREATE TYPE recurrence_freq AS ENUM (
  'daily', 'weekly', 'biweekly', 'monthly', 'custom'
);

CREATE TYPE billing_model AS ENUM (
  'per_session',     -- platba za každou lekci
  'prepaid_block',   -- předplacený blok X lekcí
  'monthly_sub',     -- měsíční předplatné
  'membership'       -- čerpání z členství/balíčku
);

CREATE TYPE session_lapse_policy AS ENUM (
  'lapse',           -- lekce propadá (zákazník za ni platí ale neměl ji)
  'rollover',        -- přidá se na konec série
  'credit',          -- zákazník dostane kredit
  'prorate',         -- poměrná část se neúčtuje
  'custom'           -- dle custom rules
);

-- ============================================================
-- RECURRING SERIES
-- ============================================================
CREATE TABLE recurring_series (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  
  -- Zákazník a služba
  customer_id           UUID NOT NULL REFERENCES customers(id),
  service_id            UUID NOT NULL REFERENCES services(id),
  
  -- Zaměstnanec (může být NULL = "kdokoli dostupný")
  employee_id           UUID REFERENCES employees(id),
  employee_required     BOOLEAN NOT NULL DEFAULT FALSE,
  -- TRUE = přeskočit slot pokud zaměstnanec není dostupný
  -- FALSE = nabídnout náhradníka
  
  -- Alternativní zaměstnanci (pro střídání)
  employee_schedule     JSONB,
  /*
  NULL = vždy stejný zaměstnanec
  [
    { "week_type": "odd",  "employee_id": "uuid-jana" },
    { "week_type": "even", "employee_id": "uuid-petra" }
  ]
  nebo
  [
    { "sequence": [1, 3, 5, ...], "employee_id": "uuid-jana" },
    { "sequence": [2, 4, 6, ...], "employee_id": "uuid-petra" }
  ]
  */
  
  -- Pracoviště
  workspace_id          UUID REFERENCES workspaces(id),
  
  -- Recurrence pravidlo
  freq                  recurrence_freq NOT NULL DEFAULT 'weekly',
  interval_count        INTEGER NOT NULL DEFAULT 1,   -- každý X týdnů/dní
  days_of_week          VARCHAR(10)[],                -- ['wednesday'] nebo ['monday','thursday']
  time_of_day           TIME NOT NULL,
  timezone              VARCHAR(64) NOT NULL,
  
  -- Rozsah série
  start_date            DATE NOT NULL,
  end_date              DATE,     -- NULL = nekonečná
  total_sessions_planned INTEGER, -- NULL = nekonečná
  
  -- Počítadla
  sessions_completed    INTEGER NOT NULL DEFAULT 0,
  sessions_cancelled_free INTEGER NOT NULL DEFAULT 0,
  sessions_cancelled_paid INTEGER NOT NULL DEFAULT 0,
  sessions_cancelled_business INTEGER NOT NULL DEFAULT 0,
  sessions_no_show      INTEGER NOT NULL DEFAULT 0,
  sessions_rescheduled  INTEGER NOT NULL DEFAULT 0,
  sessions_gifted       INTEGER NOT NULL DEFAULT 0,
  sessions_paused       INTEGER NOT NULL DEFAULT 0,
  
  -- Limity (per série — přepisují globální rules)
  max_free_cancels      INTEGER,  -- NULL = dědí z Rules Engine
  max_reschedules       INTEGER,  -- NULL = dědí z Rules Engine
  max_pauses_per_year   INTEGER,
  max_pause_duration_weeks INTEGER,
  
  -- Reschedule strategie
  reschedule_strategy   VARCHAR(30) NOT NULL DEFAULT 'end_of_series',
  -- 'end_of_series', 'any_available', 'adjacent_only', 'same_week'
  
  -- Lapse policy (co se stane s lekcí při různých událostech)
  lapse_on_customer_cancel    session_lapse_policy NOT NULL DEFAULT 'lapse',
  lapse_on_customer_no_show   session_lapse_policy NOT NULL DEFAULT 'lapse',
  lapse_on_pause              session_lapse_policy NOT NULL DEFAULT 'rollover',
  lapse_on_business_cancel    session_lapse_policy NOT NULL DEFAULT 'rollover',
  lapse_on_holiday            session_lapse_policy NOT NULL DEFAULT 'rollover',
  -- Každá událost má vlastní politiku — majitel nastavuje per sérii nebo per typ série
  
  -- Finanční model
  billing_model         billing_model NOT NULL DEFAULT 'per_session',
  price_per_session     INTEGER NOT NULL,  -- haléře (locked-in cena)
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  price_locked          BOOLEAN NOT NULL DEFAULT TRUE,
  -- TRUE = cena je zamčená i při zdražení ceníku
  price_locked_until    DATE,
  
  -- Prepaid blok
  prepaid_sessions_total    INTEGER,      -- kolik lekcí bylo koupeno
  prepaid_sessions_used     INTEGER NOT NULL DEFAULT 0,
  prepaid_sessions_remaining INTEGER GENERATED ALWAYS AS (
    COALESCE(prepaid_sessions_total, 0) - prepaid_sessions_used
  ) STORED,
  prepaid_expires_at    TIMESTAMPTZ,     -- platnost bloku
  
  -- Auto-renewal
  auto_renew            BOOLEAN NOT NULL DEFAULT FALSE,
  renewal_block_size    INTEGER,         -- kolik lekcí obnovit
  renewal_payment_method_id VARCHAR(255), -- Stripe payment method ID
  renewal_reminder_days INTEGER[],       -- [30, 7, 1] = upozornění X dní před
  
  -- Pauzy
  paused_at             TIMESTAMPTZ,
  paused_until          TIMESTAMPTZ,     -- NULL = na neurčito
  pause_reason          TEXT,
  pause_initiated_by    VARCHAR(30),
  total_pause_days_used INTEGER NOT NULL DEFAULT 0,  -- kumulativní dny pauzy za rok
  
  -- Stav
  status                series_status NOT NULL DEFAULT 'active',
  terminated_at         TIMESTAMPTZ,
  termination_reason    TEXT,
  termination_initiator VARCHAR(30),
  
  -- Sdílení a přenos
  is_shareable          BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_to_customer_id UUID REFERENCES customers(id),  -- probíhající přenos
  transfer_requested_at TIMESTAMPTZ,
  transfer_approved_at  TIMESTAMPTZ,
  
  -- Přidané poznámky
  notes                 TEXT,           -- zákazníkovi viditelné
  internal_notes        TEXT,           -- jen pro staff
  
  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_by            UUID
);

CREATE INDEX idx_rs_customer ON recurring_series(customer_id) WHERE status NOT IN ('archived','terminated');
CREATE INDEX idx_rs_employee ON recurring_series(employee_id) WHERE status = 'active';
CREATE INDEX idx_rs_tenant_status ON recurring_series(tenant_id, status);
CREATE INDEX idx_rs_prepaid_expiry ON recurring_series(tenant_id, prepaid_expires_at)
  WHERE billing_model = 'prepaid_block' AND status = 'active';

-- ============================================================
-- RECURRING SERIES SESSIONS (jednotlivé lekce v sérii)
-- ============================================================
CREATE TYPE session_status AS ENUM (
  'scheduled',
  'completed',
  'cancelled_free',          -- zrušeno zákazníkem, z free_cancels
  'cancelled_paid',          -- zrušeno zákazníkem, s poplatkem
  'cancelled_business',      -- zrušeno provozovnou
  'cancelled_force_majeure', -- zrušeno z vyšší moci
  'no_show',
  'rescheduled_out',         -- přesunuto pryč z tohoto slotu
  'rescheduled_in',          -- náhradní slot vzniklý přesunem
  'paused',                  -- přeskočeno (pauza série)
  'paused_business',         -- přeskočeno provozovnou
  'skipped_holiday',         -- přeskočeno kvůli svátku
  'gifted',                  -- slot darován jinému zákazníkovi
  'substituted',             -- zákazník přijal náhradníka
  'pending_makeup',          -- čeká na náhradní lekci
  'expired',                 -- propadlo (nevyužitý prepaid po expiraci)
  'transferred_out'          -- přešlo na jiného zákazníka
);

CREATE TABLE recurring_series_sessions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  series_id             UUID NOT NULL REFERENCES recurring_series(id),
  
  -- Propojení na booking
  booking_id            UUID REFERENCES bookings(id),   -- NULL pokud cancelled před vytvořením
  
  -- Pořadí v sérii
  sequence_number       INTEGER NOT NULL,
  
  -- Datum (co bylo plánováno vs. co se stalo)
  original_date         DATE NOT NULL,   -- kdy byla lekce původně naplánována
  actual_date           DATE,            -- kdy skutečně proběhla (NULL pokud ne)
  original_starts_at    TIMESTAMPTZ NOT NULL,
  actual_starts_at      TIMESTAMPTZ,
  
  -- Zaměstnanec (kdo to vedl — může se lišit od série)
  employee_id           UUID REFERENCES employees(id),
  was_substituted       BOOLEAN NOT NULL DEFAULT FALSE,  -- byl to náhradník?
  
  -- Stav
  status                session_status NOT NULL DEFAULT 'scheduled',
  
  -- Lapse policy aplikovaná
  lapse_policy_applied  session_lapse_policy,
  
  -- Darování
  gifted_to_customer_id UUID REFERENCES customers(id),
  gifted_at             TIMESTAMPTZ,
  
  -- Přesun
  rescheduled_from_session_id UUID REFERENCES recurring_series_sessions(id),
  rescheduled_to_session_id   UUID REFERENCES recurring_series_sessions(id),
  
  -- Finance
  session_price         INTEGER,         -- cena za tuto lekci (může se lišit od série.price)
  was_charged           BOOLEAN NOT NULL DEFAULT FALSE,
  charged_amount        INTEGER,
  was_refunded          BOOLEAN NOT NULL DEFAULT FALSE,
  refunded_amount       INTEGER,
  
  -- Iniciátor akce
  initiator_type        VARCHAR(30),     -- 'customer_self','admin','employee','system'
  initiator_id          UUID,
  
  -- Důvod
  reason                cancellation_reason,
  notes                 TEXT,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(series_id, sequence_number)
);

CREATE INDEX idx_rss_series ON recurring_series_sessions(series_id, sequence_number);
CREATE INDEX idx_rss_booking ON recurring_series_sessions(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_rss_status ON recurring_series_sessions(series_id, status);
CREATE INDEX idx_rss_date ON recurring_series_sessions(original_date, series_id);

-- ============================================================
-- Přidat FK zpětně do bookings
-- ============================================================
ALTER TABLE bookings ADD CONSTRAINT fk_bookings_series
  FOREIGN KEY (series_id) REFERENCES recurring_series(id);
```

---

## BLOK 11 — Packages & Credits

```sql
-- ============================================================
-- PACKAGE DEFINITIONS (definice balíčků)
-- ============================================================
CREATE TYPE package_type AS ENUM (
  'credit',          -- X vstupů
  'time_unlimited',  -- neomezeno po dobu X
  'bundle',          -- svazek konkrétních služeb
  'subscription',    -- opakující se s auto-renewal
  'gift_voucher',    -- dárkový poukaz
  'membership'       -- členství s výhodami
);

CREATE TYPE package_visibility AS ENUM (
  'public',          -- vidí všichni
  'logged_in',       -- jen přihlášení zákazníci
  'group',           -- jen určitá skupina zákazníků
  'internal',        -- jen admin přiřadí
  'corporate',       -- B2B
  'conditional'      -- dle podmínky
);

CREATE TABLE packages (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  internal_notes        TEXT,
  
  package_type          package_type NOT NULL,
  visibility            package_visibility NOT NULL DEFAULT 'public',
  
  -- Cena
  price                 INTEGER NOT NULL,  -- haléře
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  compare_at_price      INTEGER,           -- přeškrtnutá "původní" cena
  
  -- Credit konfigurace
  credits_total         INTEGER,           -- pro type='credit'
  credits_value         JSONB,
  /*
  Pro různé váhy kreditů per služba:
  {
    "default": 1,
    "service_overrides": {
      "uuid-masaz-90min": 2,
      "uuid-konzultace": 0.5
    }
  }
  */
  
  -- Time konfigurace
  duration_days         INTEGER,           -- platnost v dnech
  duration_from         VARCHAR(10) NOT NULL DEFAULT 'purchase',
  -- 'purchase' = od nákupu
  -- 'first_use' = od první rezervace
  -- 'fixed_date' = do konkrétního data
  fixed_expires_at      TIMESTAMPTZ,
  
  -- Bundle položky
  bundle_items          JSONB,
  /*
  [
    { "service_id": "uuid", "quantity": 1, "employee_id": null },
    { "service_id": "uuid", "quantity": 2 }
  ]
  */
  require_same_visit    BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Subscription
  billing_interval      billing_interval,
  auto_renew            BOOLEAN NOT NULL DEFAULT FALSE,
  trial_days            INTEGER,
  cancellation_policy   VARCHAR(20) DEFAULT 'end_of_period',
  -- 'immediate', 'end_of_period'
  
  -- Podmínky dostupnosti
  valid_from            TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,         -- flash sale konec
  max_purchases_total   INTEGER,             -- celkem pro všechny zákazníky
  max_purchases_per_customer INTEGER DEFAULT 1,
  
  -- Viditelnost podmínky
  visibility_condition  JSONB,
  /*
  {
    "type": "has_tag|in_group|has_completed_service|min_bookings|min_revenue",
    "value": "uuid nebo číslo"
  }
  */
  
  -- Omezení čerpání
  applicable_service_ids   UUID[],         -- NULL = vše
  applicable_category_ids  UUID[],
  applicable_branch_ids    UUID[],
  applicable_employee_ids  UUID[],
  
  transferable          BOOLEAN NOT NULL DEFAULT FALSE,
  combinable_with_discounts BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Membership výhody
  membership_benefits   JSONB,
  /*
  {
    "discount_percent": 20,
    "priority_booking": true,
    "free_credits_per_month": 1,
    "exclusive_service_ids": ["uuid"],
    "free_cancels_per_month": 999
  }
  */
  
  -- Statistiky
  total_sold            INTEGER NOT NULL DEFAULT 0,
  total_revenue         INTEGER NOT NULL DEFAULT 0,
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_packages_tenant ON packages(tenant_id) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_packages_type ON packages(tenant_id, package_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_packages_validity ON packages(valid_from, valid_until) WHERE is_active = TRUE;

-- ============================================================
-- CUSTOMER PACKAGES (zakoupené balíčky zákazníků)
-- ============================================================
CREATE TABLE customer_packages (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  package_id            UUID NOT NULL REFERENCES packages(id),
  
  -- Kód pro uplatnění
  code                  VARCHAR(30) UNIQUE,  -- např. GIFT-X7K2 nebo auto-generovaný
  
  -- Kredity
  credits_total         INTEGER NOT NULL DEFAULT 0,
  credits_used          INTEGER NOT NULL DEFAULT 0,
  credits_remaining     INTEGER GENERATED ALWAYS AS (credits_total - credits_used) STORED,
  
  -- Platnost
  valid_from            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until           TIMESTAMPTZ,
  
  -- Status
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  -- 'active', 'exhausted', 'expired', 'suspended', 'cancelled', 'transferred'
  
  -- Subscription
  subscription_status   VARCHAR(20),
  -- 'trialing', 'active', 'past_due', 'cancelled', 'paused'
  next_billing_at       TIMESTAMPTZ,
  stripe_subscription_id VARCHAR(255),
  
  -- Přenos
  transferred_from_id   UUID REFERENCES customer_packages(id),
  transferred_to_id     UUID REFERENCES customer_packages(id),
  transferred_at        TIMESTAMPTZ,
  transferred_to_customer_id UUID REFERENCES customers(id),
  
  -- Firemní alokace
  corporate_account_id  UUID REFERENCES corporate_accounts(id),
  
  -- Nákup
  purchased_at          TIMESTAMPTZ,
  purchased_price       INTEGER,         -- kolik skutečně zaplatil
  payment_id            UUID,            -- FK na payments
  assigned_by           UUID,            -- admin ručně přiřadil
  
  notes                 TEXT,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cp_customer ON customer_packages(customer_id) WHERE status = 'active';
CREATE INDEX idx_cp_code ON customer_packages(code) WHERE code IS NOT NULL;
CREATE INDEX idx_cp_expiry ON customer_packages(valid_until) WHERE status = 'active';

-- ============================================================
-- CUSTOMER PACKAGE CREDIT TRANSACTIONS
-- Každé čerpání nebo přidání kreditů = záznam
-- ============================================================
CREATE TABLE package_credit_transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  customer_package_id   UUID NOT NULL REFERENCES customer_packages(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  
  -- Transakce
  transaction_type      VARCHAR(20) NOT NULL,
  -- 'debit' = čerpání (rezervace)
  -- 'credit' = přidání (nákup, bonus, refund)
  -- 'adjustment' = ruční úprava adminem
  -- 'transfer_out' = převod jinam
  -- 'transfer_in' = převod odjinud
  -- 'expiry' = propadnutí
  
  credits_amount        INTEGER NOT NULL,  -- kladné = přidání, záporné = čerpání
  credits_weight        DECIMAL(5,2),      -- váha kreditu pro tuto transakci (1.0, 2.0, 0.5)
  credits_before        INTEGER NOT NULL,  -- stav před transakcí
  credits_after         INTEGER NOT NULL,  -- stav po transakci
  
  -- Odkaz na rezervaci (pokud debit)
  booking_id            UUID REFERENCES bookings(id),
  series_session_id     UUID REFERENCES recurring_series_sessions(id),
  
  -- Kdo
  initiated_by_type     VARCHAR(20) NOT NULL,  -- 'customer', 'admin', 'system'
  initiated_by_id       UUID,
  
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pct_package ON package_credit_transactions(customer_package_id, created_at DESC);
CREATE INDEX idx_pct_booking ON package_credit_transactions(booking_id) WHERE booking_id IS NOT NULL;
```

---

## BLOK 12 — Payments & Invoices

```sql
-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TYPE payment_status AS ENUM (
  'pending', 'processing', 'succeeded', 'failed',
  'cancelled', 'refunded', 'partially_refunded', 'disputed'
);

CREATE TYPE payment_method_type AS ENUM (
  'card', 'bank_transfer', 'cash', 'voucher', 'package_credit',
  'bnpl', 'crypto', 'manual'
);

CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  customer_id           UUID REFERENCES customers(id),
  booking_id            UUID REFERENCES bookings(id),
  customer_package_id   UUID REFERENCES customer_packages(id),
  
  -- Částka
  amount                INTEGER NOT NULL,       -- haléře
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  
  -- Typ a stav
  payment_method        payment_method_type NOT NULL,
  status                payment_status NOT NULL DEFAULT 'pending',
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id         VARCHAR(255),
  stripe_customer_id       VARCHAR(255),
  stripe_payment_method_id VARCHAR(255),
  
  -- Karta (tokenizovaná metadata)
  card_brand            VARCHAR(20),   -- 'visa', 'mastercard'
  card_last4            CHAR(4),
  card_exp_month        SMALLINT,
  card_exp_year         SMALLINT,
  
  -- Refundy
  refunded_amount       INTEGER NOT NULL DEFAULT 0,
  refund_reason         TEXT,
  refunded_at           TIMESTAMPTZ,
  refunded_by           UUID,
  
  -- Dispute
  disputed_at           TIMESTAMPTZ,
  dispute_status        VARCHAR(30),
  
  -- Metadata
  description           TEXT,
  metadata              JSONB DEFAULT '{}'::jsonb,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_booking ON payments(booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_payments_customer ON payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_payments_tenant_date ON payments(tenant_id, created_at DESC);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  customer_id           UUID REFERENCES customers(id),
  corporate_account_id  UUID REFERENCES corporate_accounts(id),
  
  invoice_number        VARCHAR(50) NOT NULL UNIQUE,
  
  -- Položky
  line_items            JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    {
      "description": "Masáž 60 min — 10.4.2026",
      "quantity": 1,
      "unit_price": 90000,
      "vat_rate": 21,
      "vat_amount": 18900,
      "total": 108900,
      "booking_id": "uuid"
    }
  ]
  */
  
  subtotal              INTEGER NOT NULL,  -- bez DPH
  vat_amount            INTEGER NOT NULL,
  total                 INTEGER NOT NULL,  -- s DPH
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  
  -- Stav
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- 'draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'
  
  issued_at             DATE NOT NULL DEFAULT CURRENT_DATE,
  due_at                DATE,
  paid_at               TIMESTAMPTZ,
  payment_id            UUID REFERENCES payments(id),
  
  -- PDF
  pdf_url               TEXT,
  pdf_generated_at      TIMESTAMPTZ,
  
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DISCOUNT CODES / COUPONS
-- ============================================================
CREATE TABLE discount_codes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  code                  VARCHAR(50) NOT NULL,
  
  discount_type         VARCHAR(20) NOT NULL DEFAULT 'percent',
  -- 'percent', 'fixed', 'free_session'
  discount_value        INTEGER NOT NULL,  -- procenta nebo haléře
  
  -- Omezení
  max_uses_total        INTEGER,           -- NULL = neomezeno
  max_uses_per_customer INTEGER DEFAULT 1,
  uses_count            INTEGER NOT NULL DEFAULT 0,
  
  applicable_service_ids UUID[],
  applicable_category_ids UUID[],
  minimum_order_amount  INTEGER,
  
  valid_from            TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,
  
  combinable_with_packages BOOLEAN NOT NULL DEFAULT TRUE,
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, code)
);

CREATE TABLE discount_code_uses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discount_code_id      UUID NOT NULL REFERENCES discount_codes(id),
  customer_id           UUID REFERENCES customers(id),
  booking_id            UUID REFERENCES bookings(id),
  tenant_id             UUID NOT NULL,
  discount_amount       INTEGER NOT NULL,
  used_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dcu_code ON discount_code_uses(discount_code_id);
CREATE INDEX idx_dcu_customer ON discount_code_uses(customer_id);
```
