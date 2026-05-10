# 13b — Databázové schema: Users, Employees, Customers, Groups

---

## BLOK 4 — Users & Employees

```sql
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE system_role AS ENUM (
  'owner',
  'manager',
  'employee',
  'receptionist',
  'viewer',
  'api_key'
);

CREATE TYPE employment_type AS ENUM (
  'hpp',        -- hlavní pracovní poměr
  'dpp',        -- dohoda o provedení práce
  'dpc',        -- dohoda o pracovní činnosti
  'osvč',       -- živnostník
  'contractor', -- externí spolupracovník
  'volunteer'
);

CREATE TYPE user_status AS ENUM (
  'invited',    -- pozván, ještě nepřijal
  'active',
  'suspended',
  'inactive',
  'deleted'
);

-- ============================================================
-- USERS (přístupy do systému — admin, zaměstnanci, recepce)
-- ============================================================
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Autentizace
  email                 VARCHAR(255) NOT NULL,
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash         VARCHAR(255),
  totp_secret           VARCHAR(100),    -- 2FA
  totp_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Identita
  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  display_name          VARCHAR(200),
  phone                 VARCHAR(50),
  avatar_url            TEXT,
  locale                locale_code,
  timezone              VARCHAR(64),
  
  -- Oprávnění
  system_role           system_role NOT NULL DEFAULT 'employee',
  custom_role_id        UUID REFERENCES custom_roles(id),
  -- Pokud custom_role_id IS NOT NULL → použij custom_role permissions
  -- Jinak → použij system_role defaults
  
  -- Stav
  status                user_status NOT NULL DEFAULT 'invited',
  invited_at            TIMESTAMPTZ,
  invited_by            UUID,
  last_login_at         TIMESTAMPTZ,
  last_active_at        TIMESTAMPTZ,
  
  -- Bezpečnost
  login_attempts        INTEGER NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  password_changed_at   TIMESTAMPTZ,
  
  -- Meta
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON users(tenant_id, status) WHERE deleted_at IS NULL;

-- ============================================================
-- USER SESSIONS
-- ============================================================
CREATE TABLE user_sessions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id),
  tenant_id             UUID NOT NULL,
  
  refresh_token_hash    VARCHAR(255) NOT NULL,
  device_info           JSONB,   -- { browser, os, ip, user_agent }
  
  expires_at            TIMESTAMPTZ NOT NULL,
  last_used_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at            TIMESTAMPTZ,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON user_sessions(user_id) WHERE revoked_at IS NULL;

-- ============================================================
-- EMPLOYEES (zaměstnanecký profil — oddělený od user account)
-- Zaměstnanec může mít user account nebo ne (pak ho admin spravuje)
-- ============================================================
CREATE TABLE employees (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID REFERENCES users(id),   -- NULL = nemá přístup do systému
  
  -- Identita
  first_name            VARCHAR(100) NOT NULL,
  last_name             VARCHAR(100) NOT NULL,
  display_name          VARCHAR(200),   -- jak se zobrazí zákazníkům
  bio                   TEXT,           -- veřejný popis (pro výběr zaměstnance)
  photo_url             TEXT,
  phone                 VARCHAR(50),
  email                 VARCHAR(255),
  
  -- Pracovní podmínky
  employment_type       employment_type,
  hire_date             DATE,
  termination_date      DATE,
  contract_reference    VARCHAR(100),   -- číslo smlouvy
  
  -- Odměňování
  hourly_rate           INTEGER,        -- v haléřích
  monthly_salary        INTEGER,        -- v haléřích
  commission_schema_id  UUID,           -- odkaz na commission schema
  
  -- Certifikace a dovednosti (tagový systém)
  skill_tags            VARCHAR(50)[],  -- ['laser', 'coloring', 'massage', 'yoga']
  certification_tags    VARCHAR(50)[],  -- ['schwarzkopf', 'pilates_level2']
  
  -- Veřejný profil
  is_bookable_online    BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_directory     BOOLEAN NOT NULL DEFAULT TRUE,
  booking_priority      INTEGER NOT NULL DEFAULT 0,  -- pořadí v nabídce (nižší = dříve)
  
  -- Stav
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Interní poznámky (vidí jen owner/manager)
  internal_notes        TEXT,
  
  -- Dokumenty (metadata, soubory jsou v S3)
  documents             JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    {
      "type": "contract|certificate|id_card|health_card",
      "name": "Smlouva HPP 2024",
      "file_key": "s3://...",
      "expires_at": "2026-12-31",
      "verified": true
    }
  ]
  */
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_employees_tenant ON employees(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_user ON employees(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_employees_active ON employees(tenant_id, is_active) WHERE deleted_at IS NULL;
-- Full-text search přes jméno
CREATE INDEX idx_employees_name_search ON employees 
  USING gin(to_tsvector('simple', coalesce(first_name,'') || ' ' || coalesce(last_name,'')));

-- ============================================================
-- EMPLOYEE BRANCH ASSIGNMENTS
-- Jeden zaměstnanec může pracovat ve více pobočkách
-- ============================================================
CREATE TABLE employee_branches (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employees(id),
  branch_id             UUID NOT NULL REFERENCES branches(id),
  
  is_primary            BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Pracovní doba pro tuto pobočku
  -- NULL = dědí z employee_working_hours (výchozí)
  -- Přítomnost záznamu = custom pro tuto pobočku
  working_hours         JSONB,
  /*
  {
    "monday":    { "enabled": true,  "slots": [{ "from": "09:00", "to": "17:00" }] },
    "tuesday":   { "enabled": true,  "slots": [{ "from": "09:00", "to": "12:00" }, { "from": "13:00", "to": "17:00" }] },
    "wednesday": { "enabled": true,  "slots": [{ "from": "09:00", "to": "17:00" }] },
    "thursday":  { "enabled": false, "slots": [] },
    "friday":    { "enabled": true,  "slots": [{ "from": "09:00", "to": "15:00" }] },
    "saturday":  { "enabled": false, "slots": [] },
    "sunday":    { "enabled": false, "slots": [] }
  }
  */
  
  -- Datum začátku/konce přiřazení k pobočce
  assigned_from         DATE,
  assigned_until        DATE,   -- NULL = trvalé
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(employee_id, branch_id)
);

CREATE INDEX idx_eb_employee ON employee_branches(employee_id) WHERE is_active = TRUE;
CREATE INDEX idx_eb_branch ON employee_branches(branch_id) WHERE is_active = TRUE;

-- ============================================================
-- EMPLOYEE WORKING HOURS (výchozí — override per branch výše)
-- ============================================================
CREATE TABLE employee_working_hours (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employees(id),
  
  -- Standardní týdenní rozvrh
  schedule              JSONB NOT NULL,  -- stejná struktura jako employee_branches.working_hours
  
  -- Platnost tohoto rozvrhu
  valid_from            DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until           DATE,   -- NULL = aktuální
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID
);

CREATE INDEX idx_ewh_employee ON employee_working_hours(employee_id, valid_from DESC);

-- ============================================================
-- EMPLOYEE EXCEPTIONS (jednorázové výjimky z rozvrhu)
-- ============================================================
CREATE TYPE exception_type AS ENUM (
  'day_off',            -- volno (celý den)
  'partial_day_off',    -- zkrácený den
  'extended_hours',     -- prodloužený den
  'vacation',           -- dovolená
  'sick_leave',         -- nemoc
  'training',           -- školení
  'other'
);

CREATE TABLE employee_schedule_exceptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employees(id),
  branch_id             UUID REFERENCES branches(id),  -- NULL = všechny pobočky
  
  exception_type        exception_type NOT NULL,
  date_from             DATE NOT NULL,
  date_until            DATE NOT NULL,   -- i pro jednorázové = stejné datum
  
  -- Pro partial_day_off a extended_hours
  hours_override        JSONB,
  
  -- Stav schválení
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' = čeká na schválení
  -- 'approved' = schváleno
  -- 'rejected' = zamítnuto
  -- 'auto_approved' = automaticky schváleno (dle pravidla)
  
  requested_by          UUID,   -- employee nebo manager
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  
  -- Vliv na rezervace
  affected_bookings_count INTEGER DEFAULT 0,
  affected_series_count   INTEGER DEFAULT 0,
  resolution              VARCHAR(30),
  -- 'pending_reassign' = čeká na přeřazení
  -- 'bulk_reassigned' = hromadně přeřazeno
  -- 'customer_notified' = zákazníci upozorněni
  -- 'cancelled' = rezervace zrušeny
  
  notes                 TEXT,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ese_employee_dates ON employee_schedule_exceptions(employee_id, date_from, date_until);
CREATE INDEX idx_ese_status ON employee_schedule_exceptions(tenant_id, status) WHERE status = 'pending';

-- ============================================================
-- COMMISSION SCHEMAS
-- ============================================================
CREATE TABLE commission_schemas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  name                  VARCHAR(100) NOT NULL,
  
  -- Pravidla provize (pole pravidel, aplikují se v pořadí)
  rules                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    {
      "type": "percent_of_service",
      "value": 15,
      "applies_to_service_ids": [],   -- prázdné = vše
      "applies_to_category_ids": [],
      "min_monthly_revenue": null,    -- null = vždy
      "max_monthly_revenue": null
    },
    {
      "type": "fixed_per_booking",
      "value": 5000,   -- 50 Kč
      "applies_to_service_ids": ["uuid-masaz"]
    },
    {
      "type": "tiered",
      "tiers": [
        { "from": 0, "to": 20000, "rate": 10 },
        { "from": 20001, "to": 50000, "rate": 15 },
        { "from": 50001, "to": null, "rate": 20 }
      ]
    }
  ]
  */
  
  payout_day            INTEGER,  -- den v měsíci (1-28), NULL = manuální
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ============================================================
-- EMPLOYEE COMMISSION RECORDS
-- ============================================================
CREATE TABLE employee_commissions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employees(id),
  booking_id            UUID,   -- NULL pokud agregátní záznam
  
  period_month          INTEGER NOT NULL,   -- YYYYMM
  gross_revenue         INTEGER NOT NULL,   -- tržby v haléřích
  commission_amount     INTEGER NOT NULL,   -- provize v haléřích
  schema_id             UUID REFERENCES commission_schemas(id),
  calculation_detail    JSONB,             -- krok-po-kroku výpočet
  
  status                VARCHAR(20) NOT NULL DEFAULT 'calculated',
  -- 'calculated', 'approved', 'paid', 'disputed'
  
  paid_at               TIMESTAMPTZ,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ec_employee_period ON employee_commissions(employee_id, period_month);
```

---

## BLOK 5 — Customers & Groups

```sql
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE customer_status AS ENUM (
  'active',
  'inactive',      -- 90+ dní bez rezervace
  'blocked',       -- admin zablokoval
  'gdpr_deleted'   -- data smazána, prázdný záznam zachován pro referenci
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Identita
  first_name            VARCHAR(100),
  last_name             VARCHAR(100),
  display_name          VARCHAR(200),
  email                 VARCHAR(255),
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  phone                 VARCHAR(50),
  phone_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  date_of_birth         DATE,
  gender                VARCHAR(20),
  avatar_url            TEXT,
  
  -- Adresa
  address_line1         VARCHAR(255),
  address_line2         VARCHAR(255),
  city                  VARCHAR(100),
  postal_code           VARCHAR(20),
  country_code          CHAR(2),
  
  -- Autentizace (klientský portál)
  password_hash         VARCHAR(255),
  totp_secret           VARCHAR(100),
  last_login_at         TIMESTAMPTZ,
  
  -- Stav a riziko
  status                customer_status NOT NULL DEFAULT 'active',
  blocked_at            TIMESTAMPTZ,
  blocked_by            UUID,
  block_reason          TEXT,
  
  -- Statistiky (denormalizované pro výkon — updatuje se triggerem)
  total_bookings        INTEGER NOT NULL DEFAULT 0,
  completed_bookings    INTEGER NOT NULL DEFAULT 0,
  cancelled_bookings    INTEGER NOT NULL DEFAULT 0,
  no_show_count         INTEGER NOT NULL DEFAULT 0,
  total_revenue         INTEGER NOT NULL DEFAULT 0,   -- haléře
  first_booking_at      TIMESTAMPTZ,
  last_booking_at       TIMESTAMPTZ,
  
  -- Rizikové skóre (pro Rules Engine)
  risk_score            SMALLINT NOT NULL DEFAULT 0,  -- 0-100
  -- 0 = bezpečný, 100 = vysoce rizikový
  -- Počítá se automaticky z: no_show_rate, late_cancel_rate, payment_failures
  
  -- Preference
  preferred_employee_ids UUID[],   -- seřazené preference zaměstnanců
  preferred_branch_id   UUID REFERENCES branches(id),
  locale                locale_code,
  timezone              VARCHAR(64),
  
  -- Komunikace
  notification_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "email_confirmation": true,
    "email_reminder": true,
    "email_marketing": false,
    "sms_confirmation": true,
    "sms_reminder": false,
    "sms_marketing": false,
    "reminder_hours": [24, 2],
    "preferred_channel": "email"
  }
  */
  
  -- GDPR
  gdpr_consent          JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "marketing_email": { "granted": false, "at": null },
    "marketing_sms": { "granted": false, "at": null },
    "data_processing": { "granted": true, "at": "2025-01-01T10:00:00Z" },
    "analytics": { "granted": true, "at": "2025-01-01T10:00:00Z" }
  }
  */
  gdpr_deletion_requested_at TIMESTAMPTZ,
  gdpr_deleted_at       TIMESTAMPTZ,
  
  -- Interní poznámky (vidí jen zaměstnanci dle oprávnění)
  notes                 TEXT,
  
  -- Zdravotní/preferencní dotazník
  intake_responses      JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "allergies": "latex",
    "medical_notes": "...",
    "last_updated": "2025-03-01"
  }
  */
  
  -- Import tracking
  external_id           VARCHAR(255),   -- ID ze zdrojového systému při importu
  import_source         VARCHAR(50),
  
  -- Meta
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_email ON customers(tenant_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_customers_status ON customers(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_risk ON customers(tenant_id, risk_score DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_last_booking ON customers(tenant_id, last_booking_at DESC) WHERE deleted_at IS NULL;
-- Full-text search
CREATE INDEX idx_customers_name_search ON customers
  USING gin(to_tsvector('simple',
    coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'')
  ));

-- ============================================================
-- CUSTOMER TAGS (flexibilní tagging)
-- ============================================================
CREATE TABLE customer_tags (
  tenant_id             UUID NOT NULL,
  customer_id           UUID NOT NULL REFERENCES customers(id),
  tag                   VARCHAR(50) NOT NULL,
  tagged_by             UUID,   -- NULL = systém automaticky
  tagged_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (customer_id, tag)
);

CREATE INDEX idx_customer_tags_tenant ON customer_tags(tenant_id, tag);
CREATE INDEX idx_customer_tags_customer ON customer_tags(customer_id);

-- Systémové tagy (automaticky přidávané):
-- 'vip', 'new', 'loyal', 'at_risk', 'no_show_risk', 'high_value',
-- 'corporate', 'referred', 'first_visit', 'returning'

-- ============================================================
-- CUSTOMER GROUPS
-- ============================================================
CREATE TABLE customer_groups (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  name                  VARCHAR(100) NOT NULL,
  description           TEXT,
  color                 VARCHAR(7),   -- hex barva pro UI
  
  -- Typ skupiny
  group_type            VARCHAR(20) NOT NULL DEFAULT 'manual',
  -- 'manual' = admin ručně přidává
  -- 'auto_tag' = automaticky dle tagu zákazníka
  -- 'auto_rule' = automaticky dle pravidla (risk_score, revenue, visits...)
  
  auto_rule             JSONB,
  /*
  {
    "field": "total_bookings",
    "op": "gte",
    "value": 20
  }
  */
  
  -- Přístupová práva skupiny (pro Rules Engine)
  -- Zákazníci ve skupině zdědí tato pravidla
  inherited_rule_ids    UUID[],
  
  member_count          INTEGER NOT NULL DEFAULT 0,   -- denormalizované
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  
  UNIQUE(tenant_id, name)
);

-- ============================================================
-- CUSTOMER GROUP MEMBERS
-- ============================================================
CREATE TABLE customer_group_members (
  group_id              UUID NOT NULL REFERENCES customer_groups(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  tenant_id             UUID NOT NULL,
  
  added_by              UUID,   -- NULL = systém automaticky
  added_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (group_id, customer_id)
);

CREATE INDEX idx_cgm_customer ON customer_group_members(customer_id);
CREATE INDEX idx_cgm_group ON customer_group_members(group_id);

-- ============================================================
-- CUSTOMER NOTES (oddělené od customers.notes — každá poznámka je záznam)
-- ============================================================
CREATE TABLE customer_notes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  customer_id           UUID NOT NULL REFERENCES customers(id),
  
  content               TEXT NOT NULL,
  note_type             VARCHAR(30) NOT NULL DEFAULT 'general',
  -- 'general', 'health', 'preference', 'complaint', 'compliment', 'financial'
  
  is_pinned             BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible_to         VARCHAR(20) NOT NULL DEFAULT 'staff',
  -- 'owner_only', 'manager_only', 'staff', 'all'
  
  booking_id            UUID,   -- NULL = obecná poznámka, nebo odkaz na konkrétní rezervaci
  
  created_by            UUID NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_customer_notes_customer ON customer_notes(customer_id, created_at DESC) WHERE deleted_at IS NULL;

-- ============================================================
-- CUSTOMER RELATIONSHIPS (propojení zákazníků mezi sebou)
-- ============================================================
CREATE TABLE customer_relationships (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  customer_id_a         UUID NOT NULL REFERENCES customers(id),
  customer_id_b         UUID NOT NULL REFERENCES customers(id),
  
  relationship_type     VARCHAR(30) NOT NULL,
  -- 'partner', 'family', 'friend', 'referred_by', 'corporate_contact', 'guardian'
  
  -- Sdílení oprávnění
  can_gift_slots        BOOLEAN NOT NULL DEFAULT FALSE,   -- A může darovat slot B
  can_share_packages    BOOLEAN NOT NULL DEFAULT FALSE,   -- B může čerpat z balíčku A
  can_transfer_series   BOOLEAN NOT NULL DEFAULT FALSE,   -- série může přejít na B
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, customer_id_a, customer_id_b)
);

-- ============================================================
-- CORPORATE ACCOUNTS (firemní zákazníci)
-- ============================================================
CREATE TABLE corporate_accounts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  company_name          VARCHAR(255) NOT NULL,
  vat_number            VARCHAR(50),
  billing_email         VARCHAR(255),
  billing_address       JSONB,
  
  -- Firemní kontakt (zákazník v systému, který spravuje účet)
  primary_contact_id    UUID REFERENCES customers(id),
  
  -- Nastavení
  invoice_required      BOOLEAN NOT NULL DEFAULT TRUE,
  payment_terms_days    INTEGER NOT NULL DEFAULT 30,   -- splatnost faktur
  credit_limit          INTEGER,   -- max. výše dlužného, v haléřích
  
  -- Skupina zákazníků pod tímto firemním účtem
  customer_group_id     UUID REFERENCES customer_groups(id),
  
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CORPORATE ACCOUNT MEMBERS
-- ============================================================
CREATE TABLE corporate_account_members (
  corporate_id          UUID NOT NULL REFERENCES corporate_accounts(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  tenant_id             UUID NOT NULL,
  
  role                  VARCHAR(20) NOT NULL DEFAULT 'member',
  -- 'admin' = spravuje firemní účet
  -- 'manager' = spravuje ostatní členy
  -- 'member' = běžný zaměstnanec
  
  credit_allocation     INTEGER,   -- kolik kreditů má tento zaměstnanec k dispozici
  
  added_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (corporate_id, customer_id)
);
```
