# 13c — Databázové schema: Services, Categories, Pricing, Availability

---

## BLOK 6 — Services & Categories

```sql
-- ============================================================
-- SERVICE CATEGORIES
-- ============================================================
CREATE TABLE service_categories (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  parent_id             UUID REFERENCES service_categories(id),  -- NULL = root
  
  name                  VARCHAR(255) NOT NULL,
  slug                  VARCHAR(100) NOT NULL,
  description           TEXT,
  
  -- Vizuální
  color                 VARCHAR(7),    -- hex
  icon                  VARCHAR(50),   -- název ikony nebo emoji
  image_url             TEXT,
  
  -- Dostupnost
  branch_ids            UUID[],        -- NULL = všechny pobočky; nebo konkrétní
  
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_sc_tenant ON service_categories(tenant_id) WHERE deleted_at IS NULL;

-- ============================================================
-- SERVICES (služby)
-- ============================================================
CREATE TYPE service_type AS ENUM (
  'individual',     -- jeden zákazník, jeden zaměstnanec
  'group',          -- více zákazníků, jeden nebo více zaměstnanců
  'workshop',       -- event s kapacitou a daným termínem
  'online',         -- video hovor
  'home_visit',     -- výjezd k zákazníkovi
  'multi_step'      -- více etapová (konzultace + procedura)
);

CREATE TABLE services (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  category_id           UUID REFERENCES service_categories(id),
  
  -- Identifikace
  name                  VARCHAR(255) NOT NULL,
  slug                  VARCHAR(100) NOT NULL,
  internal_name         VARCHAR(255),  -- interní název (jiný od zákaznického)
  description           TEXT,          -- veřejný popis
  internal_notes        TEXT,          -- interní poznámky
  
  service_type          service_type NOT NULL DEFAULT 'individual',
  
  -- Časové parametry
  duration_minutes      INTEGER NOT NULL,
  buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes  INTEGER NOT NULL DEFAULT 0,
  min_duration_minutes  INTEGER,       -- pokud je délka variabilní
  max_duration_minutes  INTEGER,
  duration_step_minutes INTEGER,       -- zákazník si vybírá v krocích po X minutách
  
  -- Kapacita (pro group / workshop)
  min_capacity          INTEGER NOT NULL DEFAULT 1,
  max_capacity          INTEGER NOT NULL DEFAULT 1,
  
  -- Vizuální
  color                 VARCHAR(7),    -- hex pro kalendář
  image_url             TEXT,
  
  -- Dostupnost
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_bookable_online    BOOLEAN NOT NULL DEFAULT TRUE,
  is_shown_in_catalog   BOOLEAN NOT NULL DEFAULT TRUE,  -- zobrazit na webu
  
  -- Přiřazení poboček
  branch_ids            UUID[],        -- NULL = dostupná ve všech; nebo seznam
  
  -- Požadavky na zdroje
  required_workspace_type VARCHAR(50), -- typ pracoviště ('chair','room','laser_room')
  required_resource_ids UUID[],        -- konkrétní přístroje/zdroje
  required_skill_tags   VARCHAR(50)[], -- zaměstnanec musí mít tato skills
  required_cert_tags    VARCHAR(50)[], -- zaměstnanec musí mít tyto certifikace
  
  -- Multi-step konfigurace
  steps                 JSONB,
  /*
  Pro service_type = 'multi_step':
  [
    { "name": "Konzultace", "duration_minutes": 30, "employee_role": "any" },
    { "name": "Procedura", "duration_minutes": 60, "same_employee": true },
    { "name": "Follow-up", "duration_minutes": 15, "delay_days": 7 }
  ]
  */
  
  -- Online meeting konfigurace
  online_meeting_provider VARCHAR(30),  -- 'zoom', 'google_meet', 'teams', 'custom'
  online_meeting_config   JSONB,
  
  -- Formulář před rezervací (intake)
  intake_form_id        UUID,          -- FK na intake_forms
  
  -- Tagy a metadata
  tags                  VARCHAR(50)[],
  sort_order            INTEGER NOT NULL DEFAULT 0,
  
  -- Statistiky (denormalizované)
  total_bookings        INTEGER NOT NULL DEFAULT 0,
  avg_rating            DECIMAL(3,2),
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ,
  
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_services_tenant ON services(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_category ON services(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_active ON services(tenant_id, is_active, is_bookable_online) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_branches ON services USING GIN(branch_ids);

-- ============================================================
-- SERVICE EMPLOYEE ASSIGNMENTS
-- Které služby smí který zaměstnanec nabízet
-- ============================================================
CREATE TABLE service_employees (
  service_id            UUID NOT NULL REFERENCES services(id),
  employee_id           UUID NOT NULL REFERENCES employees(id),
  tenant_id             UUID NOT NULL,
  
  -- Přiřazení může mít vlastní cenu (zaměstnanec A je dražší než B)
  price_override        INTEGER,       -- NULL = použij service cenu
  duration_override     INTEGER,       -- NULL = použij service délku
  
  -- Pořadí v nabídce pro tuto službu
  priority              INTEGER NOT NULL DEFAULT 0,
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  
  added_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by              UUID,
  
  PRIMARY KEY (service_id, employee_id)
);

CREATE INDEX idx_se_employee ON service_employees(employee_id) WHERE is_active = TRUE;
CREATE INDEX idx_se_service ON service_employees(service_id) WHERE is_active = TRUE;

-- ============================================================
-- INTAKE FORMS (dotazníky před rezervací)
-- ============================================================
CREATE TABLE intake_forms (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  name                  VARCHAR(255) NOT NULL,
  
  fields                JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    {
      "id": "uuid",
      "type": "text|textarea|select|multiselect|checkbox|date|phone|file",
      "label": "Alergie nebo kontraindikace?",
      "required": true,
      "options": [],          -- pro select/multiselect
      "validation": {
        "min_length": 0,
        "max_length": 500,
        "pattern": null
      },
      "visible_to": "staff",  -- kdo vidí odpovědi: 'all', 'staff', 'owner_only'
      "help_text": "...",
      "placeholder": "..."
    }
  ]
  */
  
  -- Kdy se zobrazí
  show_at               VARCHAR(20) NOT NULL DEFAULT 'booking',
  -- 'booking' = při rezervaci
  -- 'pre_visit' = X dní/hodin před termínem
  -- 'post_visit' = po návštěvě
  
  pre_visit_hours       INTEGER,       -- pokud show_at = 'pre_visit'
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INTAKE FORM RESPONSES
-- ============================================================
CREATE TABLE intake_form_responses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  form_id               UUID NOT NULL REFERENCES intake_forms(id),
  booking_id            UUID,    -- FK nastaví se po vytvoření bookings tabulky
  customer_id           UUID NOT NULL REFERENCES customers(id),
  
  responses             JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { "field_id": value, "field_id": value, ... }
  
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ifr_customer ON intake_form_responses(customer_id);
CREATE INDEX idx_ifr_booking ON intake_form_responses(booking_id);
```

---

## BLOK 7 — Pricing (víceúrovňový ceník)

```sql
-- ============================================================
-- PRICE LISTS (ceníky — více ceníků per tenant)
-- ============================================================
CREATE TABLE price_lists (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  name                  VARCHAR(100) NOT NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Na co platí tento ceník
  applies_to_branch_ids UUID[],           -- NULL = všechny
  applies_to_group_ids  UUID[],           -- zákaznické skupiny (VIP ceník)
  applies_to_tags       VARCHAR(50)[],    -- zákaznické tagy
  
  -- Platnost
  valid_from            TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,
  
  -- Priorita (vyšší = dříve se aplikuje)
  priority              INTEGER NOT NULL DEFAULT 0,
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ============================================================
-- SERVICE PRICES
-- Cena = kombinace: service × price_list × podmínky
-- ============================================================
CREATE TABLE service_prices (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  service_id            UUID NOT NULL REFERENCES services(id),
  price_list_id         UUID NOT NULL REFERENCES price_lists(id),
  
  -- Základní cena
  price                 INTEGER NOT NULL,   -- haléře
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  
  -- Typ ceny
  price_type            VARCHAR(20) NOT NULL DEFAULT 'fixed',
  -- 'fixed' = pevná cena
  -- 'from' = "od X Kč" (min. cena)
  -- 'range' = rozsah min–max
  -- 'by_duration' = cena za minutu/hodinu
  -- 'free' = zdarma
  -- 'on_request' = na vyžádání
  
  price_max             INTEGER,           -- pro range
  price_per_unit        INTEGER,           -- pro by_duration (cena za minutu v haléřích)
  
  -- Časové podmínky (dynamic pricing)
  time_conditions       JSONB,
  /*
  [
    {
      "name": "Víkendový příplatek",
      "days_of_week": ["saturday", "sunday"],
      "modifier_type": "percent|fixed",
      "modifier_value": 20   -- +20%
    },
    {
      "name": "Sezónní sleva",
      "date_from": "2025-01-01",
      "date_until": "2025-02-28",
      "modifier_type": "percent",
      "modifier_value": -10   -- -10%
    },
    {
      "name": "Ranní zvýhodněná cena",
      "time_from": "07:00",
      "time_until": "09:00",
      "modifier_type": "percent",
      "modifier_value": -15
    }
  ]
  */
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(service_id, price_list_id)
);

CREATE INDEX idx_sp_service ON service_prices(service_id) WHERE is_active = TRUE;
CREATE INDEX idx_sp_pricelist ON service_prices(price_list_id) WHERE is_active = TRUE;

-- ============================================================
-- PRICE CALCULATION LOG
-- Každý výpočet ceny se loguje pro transparentnost a audit
-- ============================================================
CREATE TABLE price_calculations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  booking_id            UUID,   -- nastaví se po vytvoření
  
  base_price            INTEGER NOT NULL,
  applied_price_list_id UUID,
  time_modifier         INTEGER NOT NULL DEFAULT 0,
  discount_amount       INTEGER NOT NULL DEFAULT 0,
  surcharge_amount      INTEGER NOT NULL DEFAULT 0,
  final_price           INTEGER NOT NULL,
  
  calculation_steps     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Krok-po-kroku co se aplikovalo
  
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## BLOK 8 — Availability Engine (dostupnost)

```sql
-- ============================================================
-- AVAILABILITY BLOCKS (explicitní blokování časů)
-- Na rozdíl od schedule exceptions — toto je rychlá blokace bez workflow
-- ============================================================
CREATE TYPE block_type AS ENUM (
  'vacation',
  'sick_leave',
  'training',
  'maintenance',
  'cleaning',
  'lunch',
  'personal',
  'event',
  'other'
);

CREATE TABLE availability_blocks (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Co se blokuje (alespoň jedno musí být vyplněno)
  employee_id           UUID REFERENCES employees(id),
  workspace_id          UUID REFERENCES workspaces(id),
  resource_id           UUID REFERENCES resources(id),
  branch_id             UUID REFERENCES branches(id),  -- blokuje celou pobočku
  
  -- Čas
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  
  -- Opakování (pro pravidelné blokace)
  is_recurring          BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule       JSONB,
  /*
  {
    "freq": "weekly|daily|monthly",
    "interval": 1,
    "days_of_week": ["monday", "friday"],
    "until": "2026-12-31",
    "count": null
  }
  */
  
  block_type            block_type NOT NULL DEFAULT 'other',
  label                 VARCHAR(255),        -- interní název
  visible_to_customer   BOOLEAN NOT NULL DEFAULT FALSE,
  customer_message      VARCHAR(500),        -- zpráva zákazníkovi (pokud visible)
  
  -- Kompenzace zaměstnance (pro HR)
  compensated           BOOLEAN,             -- NULL = neurčeno
  compensation_rate     VARCHAR(20),         -- 'full', 'half', 'none'
  
  created_by            UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_ab_employee_time ON availability_blocks(employee_id, starts_at, ends_at) 
  WHERE deleted_at IS NULL AND employee_id IS NOT NULL;
CREATE INDEX idx_ab_workspace_time ON availability_blocks(workspace_id, starts_at, ends_at) 
  WHERE deleted_at IS NULL AND workspace_id IS NOT NULL;
CREATE INDEX idx_ab_branch_time ON availability_blocks(branch_id, starts_at, ends_at) 
  WHERE deleted_at IS NULL AND branch_id IS NOT NULL;

-- ============================================================
-- AVAILABILITY CACHE (výkonnostní cache výpočtu dostupnosti)
-- Regeneruje se při každé změně bloků, rezervací nebo rozvrhů
-- ============================================================
CREATE TABLE availability_cache (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  branch_id             UUID NOT NULL REFERENCES branches(id),
  employee_id           UUID REFERENCES employees(id),
  service_id            UUID REFERENCES services(id),
  
  -- Datum pro který je cache
  date                  DATE NOT NULL,
  
  -- Dostupné sloty (pole časů)
  available_slots       JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    {
      "starts_at": "2026-04-10T09:00:00Z",
      "ends_at":   "2026-04-10T10:00:00Z",
      "employee_id": "uuid",
      "workspace_id": "uuid",
      "resource_ids": ["uuid"],
      "score": 85   -- pro priority_strategy (minimize_gaps)
    }
  ]
  */
  
  -- Metadata cache
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until           TIMESTAMPTZ NOT NULL,  -- kdy je cache neplatná
  computation_ms        INTEGER,               -- jak dlouho trvalo počítání
  
  UNIQUE(tenant_id, branch_id, employee_id, service_id, date)
);

CREATE INDEX idx_avail_cache_lookup ON availability_cache(tenant_id, branch_id, date)
  WHERE valid_until > NOW();

-- ============================================================
-- WAITING LIST
-- ============================================================
CREATE TABLE waiting_list (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Co zákazník čeká
  customer_id           UUID NOT NULL REFERENCES customers(id),
  service_id            UUID NOT NULL REFERENCES services(id),
  employee_id           UUID REFERENCES employees(id),   -- NULL = kdokoli
  branch_id             UUID REFERENCES branches(id),    -- NULL = kdekoli
  
  -- Preference
  preferred_date_from   DATE,
  preferred_date_until  DATE,
  preferred_time_from   TIME,
  preferred_time_until  TIME,
  preferred_days        VARCHAR(10)[],    -- ['monday','wednesday']
  
  -- Zda čeká na konkrétní slot (přesné datum a čas)
  specific_slot_date    DATE,
  specific_slot_time    TIME,
  
  -- Typ čekání
  wait_type             VARCHAR(20) NOT NULL DEFAULT 'general',
  -- 'general' = čeká na jakýkoli dostupný slot
  -- 'specific' = čeká na konkrétní uvolněný slot
  -- 'series' = čeká na místo v permanentce
  
  -- Stav
  status                VARCHAR(20) NOT NULL DEFAULT 'waiting',
  -- 'waiting' = čeká
  -- 'notified' = byl notifikován o slotu
  -- 'booked' = rezervoval
  -- 'expired' = timeout nebo datum minul
  -- 'cancelled' = sám se odebral
  
  position              INTEGER,          -- pořadí ve frontě (přepočítáváno)
  notified_at           TIMESTAMPTZ,      -- kdy byl notifikován
  notification_expires_at TIMESTAMPTZ,   -- do kdy musí reagovat
  booked_slot_id        UUID,             -- UUID rezervace pokud booked
  
  -- Opakované notifikování
  notification_count    INTEGER NOT NULL DEFAULT 0,
  last_notification_at  TIMESTAMPTZ,
  
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wl_customer ON waiting_list(customer_id) WHERE status = 'waiting';
CREATE INDEX idx_wl_service ON waiting_list(service_id, status) WHERE status = 'waiting';
CREATE INDEX idx_wl_specific ON waiting_list(specific_slot_date, specific_slot_time, service_id)
  WHERE wait_type = 'specific' AND status = 'waiting';
```
