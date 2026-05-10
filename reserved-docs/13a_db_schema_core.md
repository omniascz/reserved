# 13a — Databázové schema: Core, Tenants, Branches, Konfigurace

> PostgreSQL schema. Každá tabulka je navržena do posledního sloupce.
> Filozofie: co se může lišit per mikrojednotku, MUSÍ být konfigurovatelné — nikdy hardcoded.

---

## Principy návrhu

1. **Row-Level Security (RLS)** — `tenant_id` na každé tabulce, PostgreSQL RLS policy zajistí izolaci
2. **Soft delete** — nic se nesmaže fyzicky, vždy `deleted_at` timestamp
3. **Audit trail** — `created_at`, `updated_at`, `created_by`, `updated_by` na každé tabulce
4. **JSONB pro konfiguraci** — co se bude měnit a je strukturované, jde do JSONB
5. **Enums jako PostgreSQL TYPE** — ne VARCHAR s magic strings
6. **Timezone vždy WITH TIME ZONE** — nikdy bez
7. **Money vždy INTEGER (haléře/centy)** — nikdy DECIMAL pro peníze
8. **Verzování konfigurací** — každá změna nastavení vytvoří nový záznam, ne přepis

---

## BLOK 1 — Identity & Tenants

```sql
-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- composite indexes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- šifrování

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE plan_type AS ENUM (
  'free', 'starter', 'pro', 'business', 'enterprise', 'custom'
);

CREATE TYPE tenant_status AS ENUM (
  'trial', 'active', 'suspended', 'cancelled', 'churned'
);

CREATE TYPE billing_interval AS ENUM (
  'monthly', 'quarterly', 'yearly', 'lifetime'
);

CREATE TYPE currency_code AS CHAR(3);  -- ISO 4217

CREATE TYPE locale_code AS VARCHAR(10); -- cs_CZ, en_US, sk_SK...

-- ============================================================
-- TENANTS (firmy / účty)
-- ============================================================
CREATE TABLE tenants (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identifikace
  slug                  VARCHAR(63) NOT NULL UNIQUE,  -- URL safe, subdoména
  name                  VARCHAR(255) NOT NULL,
  legal_name            VARCHAR(255),                 -- právní název firmy
  vat_number            VARCHAR(50),                  -- IČO / DIČ
  
  -- Plán
  plan                  plan_type NOT NULL DEFAULT 'trial',
  plan_started_at       TIMESTAMPTZ,
  plan_ends_at          TIMESTAMPTZ,
  billing_interval      billing_interval,
  trial_ends_at         TIMESTAMPTZ,
  
  -- Kontakt a sídlo
  contact_email         VARCHAR(255) NOT NULL,
  contact_phone         VARCHAR(50),
  country_code          CHAR(2) NOT NULL DEFAULT 'CZ',  -- ISO 3166-1
  timezone              VARCHAR(64) NOT NULL DEFAULT 'Europe/Prague',
  locale                locale_code NOT NULL DEFAULT 'cs_CZ',
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  
  -- Stav
  status                tenant_status NOT NULL DEFAULT 'trial',
  suspended_at          TIMESTAMPTZ,
  suspended_reason      TEXT,
  
  -- Globální konfigurace (JSONB — strukturovaná, ale flexibilní)
  settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  settings schema:
  {
    "booking": {
      "require_customer_account": bool,
      "allow_guest_booking": bool,
      "min_advance_hours": int,
      "max_advance_days": int,
      "slot_interval_minutes": int,
      "buffer_before_minutes": int,
      "buffer_after_minutes": int,
      "allow_overlapping_bookings": bool
    },
    "notifications": {
      "send_confirmation": bool,
      "reminder_hours": [24, 2],
      "send_sms": bool,
      "send_email": bool,
      "from_email": string,
      "from_name": string
    },
    "cancellation": {
      "allow_customer_cancel": bool,
      "min_hours_before": int,
      "fee_type": "none|fixed|percent",
      "fee_value": int,
      "free_cancels_per_month": int
    },
    "reschedule": {
      "allow_customer_reschedule": bool,
      "min_hours_before": int,
      "max_per_booking": int
    },
    "payments": {
      "require_deposit": bool,
      "deposit_type": "none|fixed|percent",
      "deposit_value": int,
      "stripe_account_id": string,
      "invoice_prefix": string
    },
    "branding": {
      "logo_url": string,
      "favicon_url": string,
      "primary_color": string,
      "secondary_color": string,
      "font_family": string,
      "custom_css": string
    },
    "features": {
      "multi_branch": bool,
      "hr_module": bool,
      "packages": bool,
      "recurring_series": bool,
      "waiting_list": bool,
      "reviews": bool,
      "pos": bool
    }
  }
  */
  
  -- White-label
  custom_domain         VARCHAR(255) UNIQUE,
  custom_domain_verified BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,  -- NULL pro systémem vytvořené
  deleted_at            TIMESTAMPTZ  -- soft delete
);

CREATE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;

-- ============================================================
-- TENANT SETTINGS VERSIONS (verzování konfigurací)
-- ============================================================
CREATE TABLE tenant_settings_versions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  settings              JSONB NOT NULL,
  changed_by            UUID NOT NULL,
  change_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Trigger: při každém UPDATE tenants.settings → INSERT zde

CREATE INDEX idx_tsv_tenant ON tenant_settings_versions(tenant_id, created_at DESC);

-- ============================================================
-- TENANT INTEGRATIONS
-- ============================================================
CREATE TABLE tenant_integrations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  provider              VARCHAR(50) NOT NULL,  -- 'stripe','google_calendar','zoom','mailchimp'...
  status                VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, disabled, error
  credentials           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- šifrované tokeny
  config                JSONB NOT NULL DEFAULT '{}'::jsonb,   -- provider-specific konfigurace
  last_synced_at        TIMESTAMPTZ,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);
```

---

## BLOK 2 — Pobočky, Pracovní místa, Zóny

```sql
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE branch_status AS ENUM (
  'active', 'inactive', 'coming_soon', 'temporarily_closed', 'permanently_closed'
);

-- ============================================================
-- BRANCHES (pobočky)
-- ============================================================
CREATE TABLE branches (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Identifikace
  name                  VARCHAR(255) NOT NULL,
  slug                  VARCHAR(63) NOT NULL,
  code                  VARCHAR(20),  -- interní kód pobočky (PR1, BR2...)
  
  -- Fyzické umístění
  address_line1         VARCHAR(255),
  address_line2         VARCHAR(255),
  city                  VARCHAR(100),
  state                 VARCHAR(100),
  postal_code           VARCHAR(20),
  country_code          CHAR(2) NOT NULL DEFAULT 'CZ',
  latitude              DECIMAL(10, 8),
  longitude             DECIMAL(11, 8),
  
  -- Provozní konfigurace
  timezone              VARCHAR(64) NOT NULL DEFAULT 'Europe/Prague',
  locale                locale_code,   -- NULL = dědí od tenant
  currency              CHAR(3),       -- NULL = dědí od tenant
  phone                 VARCHAR(50),
  email                 VARCHAR(255),
  
  -- Stav
  status                branch_status NOT NULL DEFAULT 'active',
  
  -- Konfigurace pobočky (přepisuje tenant.settings pro tuto pobočku)
  -- Klíče, které NEJSOU přítomny → dědí od tenant
  -- Klíče, které jsou přítomny → přepisují tenant nastavení
  settings_override     JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  Stejná struktura jako tenant.settings, jen podmnožina.
  Příklad: pobočka Praha může mít jiný slot_interval_minutes,
  jiné cancellation pravidla, jiný deposit requirement.
  */
  
  -- Kapacita
  max_concurrent_bookings INTEGER,     -- NULL = bez limitu
  
  -- Metadata
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ,
  
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_branches_tenant ON branches(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_branches_status ON branches(tenant_id, status) WHERE deleted_at IS NULL;

-- ============================================================
-- AREAS (zóny / patra / sekce pobočky)
-- Příklad: "Přízemí", "Patro 1", "Relaxační zóna", "Fitness sál"
-- ============================================================
CREATE TABLE areas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  capacity              INTEGER,       -- max. počet lidí najednou
  sort_order            INTEGER NOT NULL DEFAULT 0,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ============================================================
-- WORKSPACES (pracoviště — konkrétní místo výkonu)
-- Příklad: "Křeslo A", "Box 1", "Masážní stůl 2", "Solárium"
-- ============================================================
CREATE TABLE workspaces (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  area_id               UUID REFERENCES areas(id),  -- NULL = mimo zónu
  
  name                  VARCHAR(255) NOT NULL,
  code                  VARCHAR(20),   -- interní kód "KR-A", "BOX-1"
  description           TEXT,
  
  -- Typ pracoviště
  workspace_type        VARCHAR(50),   -- 'chair', 'room', 'table', 'machine', 'vehicle', 'outdoor'
  
  -- Kapacita (kolik zákazníků může být najednou)
  capacity              INTEGER NOT NULL DEFAULT 1,
  
  -- Vybavení (tagový seznam)
  equipment_tags        VARCHAR(50)[],  -- ['laser', 'music_system', 'heating']
  
  -- Stav
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_bookable_online    BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Fyzická poloha (pro seat-map)
  position_x            INTEGER,       -- pro interaktivní mapu
  position_y            INTEGER,
  floor_plan_url        TEXT,
  
  -- Konfigurace
  settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "requires_employee": bool,    -- musí být vždy přiřazen zaměstnanec
    "shareable": bool,            -- může být sdíleno více zákazníky najednou
    "cleaning_time_minutes": int, -- čas na přípravu mezi rezervacemi
    "photo_url": string
  }
  */
  
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_workspaces_branch ON workspaces(branch_id) WHERE deleted_at IS NULL;

-- ============================================================
-- RESOURCES (sdílené zdroje — ne pracoviště, ale přístroje)
-- Příklad: "Kavitační přístroj", "Laser Soprano", "Projektor"
-- Zdroj se rezervuje spolu se zaměstnancem a pracovištěm
-- ============================================================
CREATE TABLE resources (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  
  name                  VARCHAR(255) NOT NULL,
  resource_type         VARCHAR(50),   -- 'machine', 'vehicle', 'equipment', 'room'
  quantity              INTEGER NOT NULL DEFAULT 1,  -- kolik kusů existuje
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  requires_certification VARCHAR(50)[],  -- zaměstnanec musí mít tyto certifikace
  
  settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ============================================================
-- HOLIDAY CALENDARS (svátky a uzavřené dny)
-- ============================================================
CREATE TABLE holiday_calendars (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  name                  VARCHAR(100) NOT NULL,  -- "CZ státní svátky", "Firemní dovolená"
  country_code          CHAR(2),  -- NULL = vlastní (firemní)
  is_default            BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE holidays (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  calendar_id           UUID NOT NULL REFERENCES holiday_calendars(id),
  tenant_id             UUID NOT NULL,
  
  name                  VARCHAR(255) NOT NULL,
  date                  DATE NOT NULL,
  is_recurring_yearly   BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Dopad na rezervace
  impact                VARCHAR(20) NOT NULL DEFAULT 'closed',
  -- 'closed' = pobočka zavřená
  -- 'reduced' = zkrácený provoz (použij working_hours_override)
  -- 'surcharge' = příplatek (vánoce, novoroční)
  
  surcharge_percent     INTEGER,  -- pokud impact = surcharge
  working_hours_override JSONB,   -- pokud impact = reduced
  
  applies_to_branch_ids UUID[],   -- NULL = všechny pobočky
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BRANCH HOLIDAY CALENDAR ASSIGNMENTS
-- ============================================================
CREATE TABLE branch_holiday_calendars (
  branch_id             UUID NOT NULL REFERENCES branches(id),
  calendar_id           UUID NOT NULL REFERENCES holiday_calendars(id),
  tenant_id             UUID NOT NULL,
  PRIMARY KEY (branch_id, calendar_id)
);
```

---

## BLOK 3 — Konfigurace a Permission System

```sql
-- ============================================================
-- CUSTOM ROLES
-- ============================================================
CREATE TABLE custom_roles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  name                  VARCHAR(100) NOT NULL,
  description           TEXT,
  base_role             VARCHAR(30) NOT NULL,
  -- Základní systémová role ze které dědí:
  -- 'owner','manager','employee','receptionist','viewer','api'
  
  -- Bitová mapa nebo JSONB oprávnění
  permissions           JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "bookings": {
      "create": true,
      "read_own": true,
      "read_all": false,
      "update_own": true,
      "update_all": false,
      "delete_own": false,
      "delete_all": false,
      "bulk_operations": false,
      "export": false
    },
    "customers": {
      "read": true,
      "create": true,
      "update": true,
      "delete": false,
      "export": false,
      "view_contact_details": true,
      "view_payment_info": false,
      "add_notes": true,
      "view_notes": true
    },
    "services": {
      "read": true,
      "create": false,
      "update": false,
      "delete": false
    },
    "employees": {
      "read_own_profile": true,
      "read_all": false,
      "update_own_schedule": true,
      "update_all_schedules": false,
      "view_performance": false,
      "view_commissions": false
    },
    "branches": {
      "read": true,
      "manage": false
    },
    "reports": {
      "view_revenue": false,
      "view_bookings": true,
      "view_customers": false,
      "view_performance": false,
      "export": false
    },
    "rules": {
      "manage": false
    },
    "packages": {
      "sell": true,
      "manage": false,
      "assign_to_customer": false
    },
    "settings": {
      "view": false,
      "manage": false
    },
    "pos": {
      "checkout": true,
      "apply_discount": false,
      "apply_refund": false,
      "view_drawer": false
    }
  }
  */
  
  is_system             BOOLEAN NOT NULL DEFAULT FALSE,  -- systémové role nelze smazat
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  
  UNIQUE(tenant_id, name)
);

-- ============================================================
-- RULES ENGINE
-- ============================================================
CREATE TYPE rule_type AS ENUM (
  'cancellation',
  'reschedule',
  'visibility',
  'booking_limit',
  'display',
  'no_show',
  'payment_policy',
  'series_policy',
  'customer_self_service'
);

CREATE TYPE rule_scope AS ENUM (
  'tenant',
  'branch',
  'area',
  'workspace',
  'service',
  'service_category',
  'employee',
  'customer_group',
  'customer_tag',
  'time_slot',
  'recurring_series'
);

CREATE TABLE rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  rule_type             rule_type NOT NULL,
  
  -- Scope: na co pravidlo platí
  scope                 rule_scope NOT NULL DEFAULT 'tenant',
  scope_id              UUID,   -- NULL = platí na vše v daném scope
  -- Příklad: scope='branch', scope_id='uuid-pobocky-A'
  -- Příklad: scope='customer_group', scope_id='uuid-vip-skupiny'
  
  -- Podmínky aktivace pravidla (kdy se pravidlo aplikuje)
  conditions            JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  Array podmínek (AND logika — všechny musí platit):
  [
    { "field": "days_until_booking", "op": "lt", "value": 24 },
    { "field": "customer_tag", "op": "in", "value": ["new", "risk"] },
    { "field": "booking_count_this_month", "op": "gte", "value": 3 },
    { "field": "series_cancels_used", "op": "gte", "value": 2 },
    { "field": "time_of_day", "op": "between", "value": ["08:00", "10:00"] },
    { "field": "day_of_week", "op": "in", "value": ["saturday", "sunday"] },
    { "field": "initiator", "op": "eq", "value": "customer_self" }
  ]
  */
  
  -- Konfigurace pravidla (co se stane)
  config                JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  Závisí na rule_type.
  
  cancellation:
  {
    "allow": true|false,
    "fee_type": "none|fixed|percent",
    "fee_value": int,
    "fee_currency": "CZK",
    "free_cancels_limit": int,
    "free_cancels_scope": "per_month|per_series|per_year|per_booking",
    "after_limit": "deny|fee|require_approval",
    "force_majeure_exempt": bool,
    "business_cancel_exempt": bool,
    "require_reason": bool,
    "allowed_reasons": ["illness","travel","personal","no_reason"],
    "documentation_required_for": ["illness"]
  }
  
  reschedule:
  {
    "allow": true|false,
    "min_hours_before": int,
    "max_per_booking": int,
    "max_per_series": int,
    "strategy": "any_available|adjacent_only|same_week|end_of_series|custom",
    "custom_strategy_days": int,
    "allow_employee_change": bool,
    "allow_branch_change": bool,
    "require_approval": bool
  }
  
  visibility:
  {
    "visible_to": "all|logged_in|group|tag|condition",
    "customer_group_ids": [uuid],
    "customer_tags": [string],
    "show_from_days_ahead": int,
    "hide_hours_before": int,
    "condition_type": "has_package|has_completed_service|min_booking_count",
    "condition_value": any
  }
  
  booking_limit:
  {
    "max_active_bookings": int,
    "max_per_service_per_period": int,
    "period": "day|week|month|year",
    "min_gap_hours": int,
    "max_concurrent": int
  }
  
  display:
  {
    "slot_interval_minutes": int,
    "round_to": "none|5min|15min|30min|hour",
    "show_only_round_hours": bool,
    "priority_strategy": "minimize_gaps|earliest|latest|balanced",
    "min_buffer_before": int,
    "min_buffer_after": int,
    "show_next_available": bool,
    "max_slots_shown_per_day": int
  }
  
  no_show:
  {
    "fee_type": "none|fixed|percent",
    "fee_value": int,
    "auto_charge": bool,
    "threshold_suspend_series": int,
    "threshold_block_customer": int,
    "notify_customer": bool,
    "message_template_id": uuid
  }
  
  payment_policy:
  {
    "require_card_on_file": bool,
    "deposit_type": "none|fixed|percent",
    "deposit_value": int,
    "deposit_refundable_hours": int,
    "prepay_full": bool,
    "auto_charge_on_completion": bool
  }
  
  series_policy:
  {
    "lapse_on_cancel": bool,
    "lapse_on_no_show": bool,
    "lapse_on_pause": bool,
    "makeup_allowed": bool,
    "makeup_window_days": int,
    "max_pauses_per_year": int,
    "max_pause_duration_weeks": int,
    "pause_billing": "continue|pause|prorate",
    "transfer_allowed": bool,
    "sharing_allowed": bool,
    "auto_renew": bool,
    "expiry_warning_days": [30, 7, 1]
  }
  
  customer_self_service:
  {
    "can_cancel": bool,
    "can_reschedule": bool,
    "can_pause_series": bool,
    "can_gift_slot": bool,
    "can_transfer_series": bool,
    "can_change_employee": bool,
    "can_change_branch": bool,
    "can_edit_profile": bool,
    "can_download_invoice": bool,
    "can_buy_packages": bool,
    "can_add_to_calendar": bool,
    "requires_approval_for": ["cancel_late","transfer","branch_change"]
  }
  */
  
  -- Výsledek při splnění podmínek
  action                VARCHAR(50) NOT NULL DEFAULT 'apply',
  -- 'apply' = aplikuj config
  -- 'deny' = zamítni akci
  -- 'require_approval' = pošli ke schválení
  -- 'notify_only' = jen notifikuj, ale proveď
  
  -- Priorita (nižší = vyšší priorita = aplikuje se dříve)
  priority              INTEGER NOT NULL DEFAULT 100,
  
  -- Platnost
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from            DATE,   -- NULL = vždy
  valid_until           DATE,   -- NULL = navždy
  
  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID NOT NULL,
  updated_by            UUID,
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_rules_tenant_type ON rules(tenant_id, rule_type) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_rules_scope ON rules(scope, scope_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_rules_priority ON rules(tenant_id, priority) WHERE deleted_at IS NULL AND is_active = TRUE;

-- ============================================================
-- RULE EVALUATION LOG (audit každého vyhodnocení pravidla)
-- ============================================================
CREATE TABLE rule_evaluations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  rule_id               UUID REFERENCES rules(id),
  
  -- Kontext vyhodnocení
  entity_type           VARCHAR(50) NOT NULL,   -- 'booking','series','customer'
  entity_id             UUID NOT NULL,
  action_requested      VARCHAR(50) NOT NULL,   -- 'cancel','reschedule','create'...
  initiator_type        VARCHAR(30) NOT NULL,   -- 'customer_self','admin','system'
  initiator_id          UUID,
  
  -- Výsledek
  result                VARCHAR(20) NOT NULL,   -- 'allowed','denied','approval_required'
  matched_rules         UUID[],                 -- které rules se aplikovaly
  evaluation_detail     JSONB,                  -- krok-po-kroku proč
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_re_entity ON rule_evaluations(entity_id, created_at DESC);
CREATE INDEX idx_re_tenant_date ON rule_evaluations(tenant_id, created_at DESC);
```
