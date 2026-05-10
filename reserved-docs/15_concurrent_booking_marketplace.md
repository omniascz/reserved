# 15 — Concurrent Booking & Marketplace Schema

---

## BLOK 1 — Slot Holds (race condition řešení)

```sql
-- ============================================================
-- SLOT HOLDS
-- Zamknutí slotu při otevření rezervačního formuláře
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE slot_holds (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  
  -- Co je zamčeno (alespoň jedno)
  employee_id       UUID REFERENCES employees(id),
  workspace_id      UUID REFERENCES workspaces(id),
  resource_id       UUID REFERENCES resources(id),
  
  -- Čas
  starts_at         TIMESTAMPTZ NOT NULL,
  ends_at           TIMESTAMPTZ NOT NULL,
  service_id        UUID NOT NULL REFERENCES services(id),
  
  -- Kdo zamkl
  session_token     VARCHAR(64) NOT NULL,  -- anonymous
  customer_id       UUID REFERENCES customers(id),
  
  -- Životní cyklus
  held_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL
                    DEFAULT (NOW() + INTERVAL '10 minutes'),
  
  status            VARCHAR(10) NOT NULL DEFAULT 'active',
  -- 'active'    = slot je zamčen
  -- 'converted' = přeměněno na booking
  -- 'expired'   = timeout, uvolněno
  -- 'released'  = zákazník opustil formulář
  
  booking_id        UUID REFERENCES bookings(id),
  
  -- Exclusion constraint zabrání dvojímu zamčení stejného slotu
  -- pro stejného zaměstnance ve stejném čase
  CONSTRAINT no_double_hold_employee
    EXCLUDE USING GIST (
      tenant_id   WITH =,
      employee_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status = 'active' AND employee_id IS NOT NULL),
    
  CONSTRAINT no_double_hold_workspace
    EXCLUDE USING GIST (
      tenant_id    WITH =,
      workspace_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status = 'active' AND workspace_id IS NOT NULL)
);

CREATE INDEX idx_sh_expires ON slot_holds(expires_at)
  WHERE status = 'active';
CREATE INDEX idx_sh_session ON slot_holds(session_token)
  WHERE status = 'active';
CREATE INDEX idx_sh_customer ON slot_holds(customer_id)
  WHERE customer_id IS NOT NULL AND status = 'active';

-- Exclusion constraint na bookings (DB-level pojistka)
ALTER TABLE bookings ADD CONSTRAINT no_double_booking_employee
  EXCLUDE USING GIST (
    tenant_id   WITH =,
    employee_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (
    status NOT IN ('cancelled', 'no_show')
    AND employee_id IS NOT NULL
  );

ALTER TABLE bookings ADD CONSTRAINT no_double_booking_workspace
  EXCLUDE USING GIST (
    tenant_id    WITH =,
    workspace_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (
    status NOT IN ('cancelled', 'no_show')
    AND workspace_id IS NOT NULL
  );

-- ============================================================
-- FUNKCE: Vytvoření holdu (atomická operace)
-- ============================================================
CREATE OR REPLACE FUNCTION create_slot_hold(
  p_tenant_id     UUID,
  p_service_id    UUID,
  p_employee_id   UUID,
  p_workspace_id  UUID,
  p_resource_id   UUID,
  p_starts_at     TIMESTAMPTZ,
  p_ends_at       TIMESTAMPTZ,
  p_session_token VARCHAR(64),
  p_customer_id   UUID DEFAULT NULL,
  p_hold_minutes  INTEGER DEFAULT 10
)
RETURNS TABLE(
  success       BOOLEAN,
  hold_id       UUID,
  expires_at    TIMESTAMPTZ,
  error_code    VARCHAR(50),
  alternatives  JSONB
) AS $$
DECLARE
  v_hold_id   UUID;
  v_expires   TIMESTAMPTZ;
BEGIN
  v_expires := NOW() + (p_hold_minutes || ' minutes')::INTERVAL;
  
  BEGIN
    INSERT INTO slot_holds (
      tenant_id, service_id, employee_id, workspace_id, resource_id,
      starts_at, ends_at, session_token, customer_id, expires_at
    ) VALUES (
      p_tenant_id, p_service_id, p_employee_id, p_workspace_id, p_resource_id,
      p_starts_at, p_ends_at, p_session_token, p_customer_id, v_expires
    ) RETURNING id INTO v_hold_id;
    
    RETURN QUERY SELECT TRUE, v_hold_id, v_expires, NULL::VARCHAR, NULL::JSONB;
    
  EXCEPTION WHEN exclusion_violation THEN
    -- Slot je obsazen — vrať alternativy
    RETURN QUERY SELECT 
      FALSE, 
      NULL::UUID, 
      NULL::TIMESTAMPTZ,
      'slot_unavailable'::VARCHAR,
      (
        SELECT jsonb_agg(alt) FROM (
          -- Najdi nejbližší 3 volné sloty
          SELECT jsonb_build_object(
            'starts_at', s.starts_at,
            'ends_at', s.ends_at,
            'employee_id', s.employee_id
          ) AS alt
          FROM availability_cache ac
          CROSS JOIN LATERAL jsonb_array_elements(ac.available_slots) AS s
          WHERE ac.tenant_id = p_tenant_id
            AND ac.service_id = p_service_id
            AND ac.date >= p_starts_at::DATE
            AND ac.valid_until > NOW()
            AND (s->>'starts_at')::TIMESTAMPTZ > NOW()
          ORDER BY (s->>'starts_at')::TIMESTAMPTZ
          LIMIT 3
        ) sub
      )::JSONB;
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- JOB: Uvolnění expirovaných holdů (spouštět každých 60s)
-- ============================================================
CREATE OR REPLACE FUNCTION release_expired_holds()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH released AS (
    UPDATE slot_holds
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at < NOW()
    RETURNING id, tenant_id, service_id, employee_id, workspace_id, starts_at::DATE
  )
  SELECT COUNT(*) INTO v_count FROM released;
  
  -- Invaliduj availability cache pro uvolněné sloty
  DELETE FROM availability_cache ac
  USING (
    SELECT DISTINCT tenant_id, service_id, employee_id, starts_at::DATE AS date
    FROM slot_holds
    WHERE status = 'expired' AND expires_at > NOW() - INTERVAL '2 minutes'
  ) expired
  WHERE ac.tenant_id = expired.tenant_id
    AND ac.date = expired.date;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
```

---

## BLOK 2 — Marketplace Core

```sql
-- ============================================================
-- MARKETPLACE PROVIDERS
-- Každý tenant může být zároveň marketplace provider
-- ============================================================
CREATE TYPE provider_status AS ENUM (
  'applied',        -- podal přihlášku
  'under_review',   -- v procesu schvalování
  'approved',       -- schválen, aktivní
  'suspended',      -- dočasně pozastaven
  'rejected',       -- zamítnut
  'churned'         -- odešel
);

CREATE TABLE marketplace_providers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL UNIQUE REFERENCES tenants(id),
  
  -- Profil na marketplace
  display_name          VARCHAR(255) NOT NULL,
  tagline               VARCHAR(300),         -- krátký popis
  description           TEXT,                 -- dlouhý popis
  logo_url              TEXT,
  cover_image_url       TEXT,
  gallery_urls          TEXT[],
  
  -- Kontakt (veřejný)
  website_url           TEXT,
  instagram_url         TEXT,
  facebook_url          TEXT,
  
  -- Fyzická poloha (pro geo search)
  -- Primární pobočka pro marketplace listing
  primary_branch_id     UUID REFERENCES branches(id),
  geo_lat               DECIMAL(10, 8),
  geo_lng               DECIMAL(11, 8),
  service_radius_km     INTEGER,  -- pro mobile/home-visit providery
  
  -- Kategorie a tagy (pro search a discovery)
  category_ids          UUID[],
  tags                  VARCHAR(50)[],
  
  -- Status a schvalování
  status                provider_status NOT NULL DEFAULT 'applied',
  applied_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at           TIMESTAMPTZ,
  approved_by           UUID,
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  suspended_at          TIMESTAMPTZ,
  suspension_reason     TEXT,
  
  -- Agregované hodnocení (denormalizované, updatuje trigger)
  rating_average        DECIMAL(3, 2) NOT NULL DEFAULT 0,
  rating_count          INTEGER NOT NULL DEFAULT 0,
  
  -- Search ranking skóre (počítáno algoritmem)
  search_rank_score     DECIMAL(10, 4) NOT NULL DEFAULT 0,
  -- Faktory: rating, počet rezervací, rychlost odpovědi, completeness profilu
  
  -- Statistiky
  total_bookings        INTEGER NOT NULL DEFAULT 0,
  response_rate         DECIMAL(5, 2),    -- % potvrzených do 24h
  response_time_hours   DECIMAL(5, 1),    -- průměrná doba odpovědi
  
  -- Viditelnost
  is_featured           BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified           BOOLEAN NOT NULL DEFAULT FALSE,
  is_listed             BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- SEO
  slug                  VARCHAR(100) UNIQUE,
  meta_title            VARCHAR(255),
  meta_description      VARCHAR(500),
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mp_status ON marketplace_providers(status)
  WHERE status = 'approved';
CREATE INDEX idx_mp_geo ON marketplace_providers
  USING GIST(point(geo_lng, geo_lat))
  WHERE status = 'approved' AND is_listed = TRUE;
CREATE INDEX idx_mp_rank ON marketplace_providers(search_rank_score DESC)
  WHERE status = 'approved' AND is_listed = TRUE;
CREATE INDEX idx_mp_categories ON marketplace_providers
  USING GIN(category_ids)
  WHERE status = 'approved';
CREATE INDEX idx_mp_tags ON marketplace_providers
  USING GIN(tags)
  WHERE status = 'approved';

-- ============================================================
-- MARKETPLACE CATEGORIES (hierarchické)
-- ============================================================
CREATE TABLE marketplace_categories (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id             UUID REFERENCES marketplace_categories(id),
  
  name                  VARCHAR(100) NOT NULL,
  slug                  VARCHAR(100) NOT NULL UNIQUE,
  description           TEXT,
  icon_url              TEXT,
  icon_emoji            VARCHAR(10),
  
  -- SEO
  meta_title            VARCHAR(255),
  meta_description      VARCHAR(500),
  
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  provider_count        INTEGER NOT NULL DEFAULT 0,  -- denormalizované
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Příklad hierarchie:
-- Beauty & Wellness
--   ├── Kadeřnictví
--   │     ├── Dámský střih
--   │     ├── Pánský střih
--   │     └── Barvení
--   ├── Masáže
--   └── Nehty
-- Fitness & Sport
--   ├── Osobní trénink
--   ├── Skupinové lekce
--   └── Sport & Kurty

-- ============================================================
-- PROVIDER ONBOARDING APPLICATIONS
-- ============================================================
CREATE TABLE provider_applications (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Může být existující tenant nebo nový žadatel
  tenant_id             UUID REFERENCES tenants(id),
  
  -- Kontaktní informace žadatele
  contact_name          VARCHAR(200) NOT NULL,
  contact_email         VARCHAR(255) NOT NULL,
  contact_phone         VARCHAR(50),
  
  -- Firma
  business_name         VARCHAR(255) NOT NULL,
  business_type         VARCHAR(50),
  -- 'individual', 'ltd', 'sp', 'nonprofit'
  vat_number            VARCHAR(50),
  
  -- Požadované kategorie
  requested_categories  UUID[],
  
  -- Odpovědi na onboarding otázky
  questionnaire         JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
  {
    "years_in_business": 5,
    "number_of_employees": 3,
    "has_physical_location": true,
    "serves_online": false,
    "monthly_bookings_estimate": "50-100",
    "why_join": "...",
    "has_insurance": true,
    "certifications": ["certification_a", "certification_b"]
  }
  */
  
  -- Stav
  status                VARCHAR(20) NOT NULL DEFAULT 'submitted',
  -- 'submitted', 'in_review', 'approved', 'rejected', 'more_info_needed'
  
  reviewed_by           UUID,
  reviewed_at           TIMESTAMPTZ,
  review_notes          TEXT,
  rejection_reason      TEXT,
  
  -- Výsledek
  created_tenant_id     UUID REFERENCES tenants(id),
  created_provider_id   UUID REFERENCES marketplace_providers(id),
  
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- KYC DOCUMENTS (ověření identity a firmy)
-- ============================================================
CREATE TYPE kyc_doc_type AS ENUM (
  'id_card',
  'passport',
  'business_license',
  'vat_certificate',
  'bank_statement',
  'insurance_certificate',
  'professional_certification',
  'address_proof'
);

CREATE TYPE kyc_status AS ENUM (
  'pending',
  'under_review',
  'approved',
  'rejected',
  'expired'
);

CREATE TABLE kyc_documents (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  provider_id           UUID REFERENCES marketplace_providers(id),
  
  doc_type              kyc_doc_type NOT NULL,
  doc_name              VARCHAR(255),
  
  -- Soubor (uložen šifrovaně v S3)
  file_key              TEXT NOT NULL,
  file_name             VARCHAR(255),
  file_size             INTEGER,
  
  -- Platnost dokumentu
  issued_date           DATE,
  expiry_date           DATE,
  
  -- Stav
  status                kyc_status NOT NULL DEFAULT 'pending',
  reviewed_by           UUID,
  reviewed_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_provider ON kyc_documents(provider_id, doc_type);
CREATE INDEX idx_kyc_expiry ON kyc_documents(expiry_date)
  WHERE status = 'approved' AND expiry_date IS NOT NULL;
```

---

## BLOK 3 — Marketplace Payments (Stripe Connect)

```sql
-- ============================================================
-- PROVIDER PAYMENT ACCOUNTS (Stripe Connect)
-- ============================================================
CREATE TYPE payout_schedule_type AS ENUM (
  'daily', 'weekly', 'monthly', 'manual'
);

CREATE TABLE provider_payment_accounts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL UNIQUE REFERENCES tenants(id),
  provider_id           UUID NOT NULL UNIQUE REFERENCES marketplace_providers(id),
  
  -- Stripe Connect
  stripe_account_id     VARCHAR(255) UNIQUE,
  -- Typ účtu: 'express' (doporučeno) nebo 'custom'
  stripe_account_type   VARCHAR(20) NOT NULL DEFAULT 'express',
  
  -- Stav KYC u Stripe
  stripe_kyc_status     VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- 'pending', 'verified', 'restricted', 'rejected'
  stripe_charges_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_payouts_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Bankovní účet (metadata z Stripe, ne číslo)
  bank_account_last4    CHAR(4),
  bank_name             VARCHAR(100),
  bank_country          CHAR(2),
  bank_currency         CHAR(3),
  
  -- Výplatní nastavení
  payout_schedule       payout_schedule_type NOT NULL DEFAULT 'weekly',
  payout_day            INTEGER,     -- pro weekly: 0=Po...6=Ne, pro monthly: 1-28
  minimum_payout        INTEGER,     -- minimální částka pro výplatu (haléře)
  
  -- Aktuální zůstatek (sync ze Stripe)
  available_balance     INTEGER NOT NULL DEFAULT 0,
  pending_balance       INTEGER NOT NULL DEFAULT 0,
  last_balance_sync     TIMESTAMPTZ,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMMISSION RULES (jak se počítá poplatek platformy)
-- ============================================================
CREATE TABLE commission_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  name                  VARCHAR(100) NOT NULL,
  description           TEXT,
  
  -- Na koho se pravidlo vztahuje
  applies_to_provider_id  UUID REFERENCES marketplace_providers(id),
  -- NULL = globální (platí pro všechny pokud není speciální pravidlo)
  applies_to_category_ids UUID[],  -- NULL = všechny kategorie
  
  -- Výpočet provize
  fee_type              VARCHAR(20) NOT NULL DEFAULT 'percent',
  -- 'percent'  = procento z transakce
  -- 'fixed'    = pevná částka per rezervace
  -- 'mixed'    = procento + fixní minimum
  -- 'tiered'   = různé % dle objemu
  
  fee_percent           DECIMAL(5, 2),    -- např. 15.00 = 15 %
  fee_fixed             INTEGER,          -- haléře
  fee_minimum           INTEGER,          -- minimální poplatek
  fee_maximum           INTEGER,          -- maximální poplatek (cap)
  
  -- Tiered pricing (dle měsíčního objemu providera)
  tiers                 JSONB,
  /*
  [
    { "from": 0,       "to": 500000,  "rate": 20.0 },
    { "from": 500001,  "to": 2000000, "rate": 15.0 },
    { "from": 2000001, "to": null,    "rate": 10.0 }
  ]
  Objemy v haléřích.
  */
  
  -- Platnost
  valid_from            TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,
  
  priority              INTEGER NOT NULL DEFAULT 100,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MARKETPLACE TRANSACTIONS (split platby)
-- Rozšíření tabulky payments o marketplace logiku
-- ============================================================
CREATE TABLE marketplace_transactions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id            UUID NOT NULL REFERENCES payments(id),
  booking_id            UUID NOT NULL REFERENCES bookings(id),
  
  provider_id           UUID NOT NULL REFERENCES marketplace_providers(id),
  commission_rule_id    UUID REFERENCES commission_rules(id),
  
  -- Částky (vše v haléřích)
  gross_amount          INTEGER NOT NULL,  -- celková platba zákazníka
  platform_fee          INTEGER NOT NULL,  -- naše provize
  provider_amount       INTEGER NOT NULL,  -- co dostane provider
  -- gross_amount = platform_fee + provider_amount (+ případné daně)
  
  fee_percent_applied   DECIMAL(5, 2),    -- jaké % bylo použito
  
  -- Stripe
  stripe_payment_intent_id  VARCHAR(255),
  stripe_transfer_id        VARCHAR(255),  -- transfer na provider účet
  stripe_transfer_status    VARCHAR(20),
  -- 'pending', 'paid', 'failed', 'reversed'
  
  -- Stav výplaty providerovi
  payout_status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending'   = čeká na výplatu
  -- 'scheduled' = naplánováno
  -- 'paid'      = vyplaceno
  -- 'held'      = zadrženo (spor, suspenze)
  -- 'refunded'  = vráceno zákazníkovi
  
  payout_scheduled_at   TIMESTAMPTZ,
  payout_completed_at   TIMESTAMPTZ,
  
  -- Při refundaci
  refunded_amount       INTEGER NOT NULL DEFAULT 0,
  refund_fee_returned   BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mt_provider ON marketplace_transactions(provider_id, created_at DESC);
CREATE INDEX idx_mt_payout ON marketplace_transactions(payout_status, payout_scheduled_at)
  WHERE payout_status IN ('pending', 'scheduled');

-- ============================================================
-- PROVIDER PAYOUTS (agregované výplaty providerům)
-- ============================================================
CREATE TABLE provider_payouts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id           UUID NOT NULL REFERENCES marketplace_providers(id),
  
  -- Zahrnuté transakce
  transaction_ids       UUID[] NOT NULL,
  
  -- Částky
  gross_amount          INTEGER NOT NULL,
  platform_fees         INTEGER NOT NULL,
  net_amount            INTEGER NOT NULL,  -- co provider dostane
  currency              CHAR(3) NOT NULL DEFAULT 'CZK',
  
  -- Výplatní okno
  period_from           DATE NOT NULL,
  period_until          DATE NOT NULL,
  
  -- Stav
  status                VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  -- 'scheduled', 'processing', 'paid', 'failed'
  
  -- Stripe
  stripe_payout_id      VARCHAR(255),
  stripe_transfer_group VARCHAR(255),
  
  scheduled_at          TIMESTAMPTZ,
  processed_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  failure_reason        TEXT,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pp_provider ON provider_payouts(provider_id, created_at DESC);
CREATE INDEX idx_pp_scheduled ON provider_payouts(scheduled_at)
  WHERE status = 'scheduled';
```

---

## BLOK 4 — Marketplace Discovery & Search

```sql
-- ============================================================
-- MARKETPLACE LISTINGS (veřejné profily služeb na marketplace)
-- Každý provider může mít více listings (per služba nebo balíček)
-- ============================================================
CREATE TABLE marketplace_listings (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id           UUID NOT NULL REFERENCES marketplace_providers(id),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Propojení na interní service
  service_id            UUID REFERENCES services(id),
  package_id            UUID REFERENCES packages(id),
  -- NULL service_id = speciální marketplace-only listing
  
  -- Veřejný profil listingu
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  highlights            TEXT[],        -- bullet points výhod (max 5)
  
  -- Kategorie na marketplace
  marketplace_category_id UUID REFERENCES marketplace_categories(id),
  secondary_category_ids  UUID[],
  
  -- Cena (zobrazená na marketplace)
  display_price         INTEGER NOT NULL,  -- "od X Kč"
  display_price_type    VARCHAR(10) NOT NULL DEFAULT 'from',
  -- 'from', 'fixed', 'range', 'free', 'on_request'
  display_price_max     INTEGER,
  
  -- Dostupnost na marketplace
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured           BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Média
  images                JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    { "url": "...", "alt": "...", "is_primary": true },
    { "url": "...", "alt": "..." }
  ]
  */
  video_url             TEXT,
  
  -- SEO
  slug                  VARCHAR(200) UNIQUE,
  meta_title            VARCHAR(255),
  meta_description      VARCHAR(500),
  
  -- Hodnocení (denormalizované z reviews tohoto listingu)
  rating_average        DECIMAL(3, 2),
  rating_count          INTEGER NOT NULL DEFAULT 0,
  
  -- Statistiky
  view_count            INTEGER NOT NULL DEFAULT 0,
  booking_count         INTEGER NOT NULL DEFAULT 0,
  
  -- Search rank
  search_rank_score     DECIMAL(10, 4) NOT NULL DEFAULT 0,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_provider ON marketplace_listings(provider_id)
  WHERE is_active = TRUE;
CREATE INDEX idx_ml_category ON marketplace_listings(marketplace_category_id)
  WHERE is_active = TRUE;
CREATE INDEX idx_ml_rank ON marketplace_listings(search_rank_score DESC)
  WHERE is_active = TRUE;

-- Full-text search přes listing
CREATE INDEX idx_ml_fts ON marketplace_listings
  USING GIN(to_tsvector('czech',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(array_to_string(highlights, ' '), '')
  ));

-- ============================================================
-- SEARCH QUERIES LOG (pro analytiku a lepší ranking)
-- ============================================================
CREATE TABLE marketplace_search_log (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Co zákazník hledal
  query_text            TEXT,
  category_id           UUID,
  location_lat          DECIMAL(10, 8),
  location_lng          DECIMAL(11, 8),
  location_radius_km    INTEGER,
  date_requested        DATE,
  time_from             TIME,
  time_until            TIME,
  price_max             INTEGER,
  
  -- Výsledky
  results_count         INTEGER,
  result_ids            UUID[],  -- první stránka výsledků
  
  -- Akce zákazníka
  clicked_id            UUID,     -- na který výsledek klikl
  booked_id             UUID,     -- zda následovalo booking
  
  -- Kdo hledal
  customer_id           UUID REFERENCES customers(id),
  session_id            VARCHAR(64),
  
  searched_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msl_date ON marketplace_search_log(searched_at DESC);
CREATE INDEX idx_msl_category ON marketplace_search_log(category_id);
```

---

## BLOK 5 — Marketplace Reviews (veřejné)

```sql
-- ============================================================
-- MARKETPLACE REVIEWS
-- Rozšíření interních reviews o marketplace-specifické atributy
-- ============================================================
ALTER TABLE reviews ADD COLUMN marketplace_listing_id
  UUID REFERENCES marketplace_listings(id);
ALTER TABLE reviews ADD COLUMN is_public
  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE reviews ADD COLUMN helpful_count
  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN reported_count
  INTEGER NOT NULL DEFAULT 0;

-- Zákazníci mohou označit review jako "helpful"
CREATE TABLE review_helpful_votes (
  review_id             UUID NOT NULL REFERENCES reviews(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  voted_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, customer_id)
);

-- ============================================================
-- SEARCH RANK CALCULATION
-- Funkce pro výpočet ranking score providera/listingu
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_provider_rank(p_provider_id UUID)
RETURNS DECIMAL(10, 4) AS $$
DECLARE
  v_rating          DECIMAL(3,2);
  v_rating_count    INTEGER;
  v_booking_count   INTEGER;
  v_response_rate   DECIMAL(5,2);
  v_completeness    DECIMAL(5,2);
  v_is_verified     BOOLEAN;
  v_is_featured     BOOLEAN;
  v_score           DECIMAL(10,4);
BEGIN
  SELECT
    mp.rating_average,
    mp.rating_count,
    mp.total_bookings,
    mp.response_rate,
    mp.is_verified,
    mp.is_featured,
    -- Completeness: % vyplněných polí profilu
    (
      (CASE WHEN mp.description IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN mp.logo_url IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN mp.cover_image_url IS NOT NULL THEN 1 ELSE 0 END +
       CASE WHEN array_length(mp.gallery_urls, 1) > 0 THEN 1 ELSE 0 END +
       CASE WHEN mp.tagline IS NOT NULL THEN 1 ELSE 0 END)::DECIMAL / 5 * 100
    )
  INTO v_rating, v_rating_count, v_booking_count, v_response_rate,
       v_is_verified, v_is_featured, v_completeness
  FROM marketplace_providers mp
  WHERE mp.id = p_provider_id;

  -- Algoritmus:
  -- rating (40%) + booking_volume (25%) + response_rate (15%) + completeness (10%) + bonusy (10%)
  v_score :=
    -- Rating (0-5 → 0-40 bodů)
    (COALESCE(v_rating, 0) / 5.0 * 40)
    
    -- Booking volume (logaritmický, max 25 bodů)
    + LEAST(25, LOG(GREATEST(1, COALESCE(v_booking_count, 0)) + 1) * 5)
    
    -- Response rate (0-100% → 0-15 bodů)
    + (COALESCE(v_response_rate, 0) / 100.0 * 15)
    
    -- Completeness (0-100% → 0-10 bodů)
    + (COALESCE(v_completeness, 0) / 100.0 * 10)
    
    -- Bonusy
    + (CASE WHEN v_is_verified THEN 5 ELSE 0 END)   -- verified badge
    + (CASE WHEN v_is_featured THEN 5 ELSE 0 END);  -- featured boost
    
  -- Rating count bonus (více hodnocení = větší důvěra)
  v_score := v_score * (1 + LEAST(0.2, COALESCE(v_rating_count, 0)::DECIMAL / 100));

  RETURN ROUND(v_score, 4);
END;
$$ LANGUAGE plpgsql;

-- Trigger: přepočítej rank při změně relevantních dat
CREATE OR REPLACE FUNCTION update_provider_rank()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_providers
  SET search_rank_score = calculate_provider_rank(NEW.id),
      updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_provider_rank
  AFTER UPDATE OF rating_average, rating_count, total_bookings, response_rate,
                  is_verified, is_featured, description, logo_url
  ON marketplace_providers
  FOR EACH ROW EXECUTE FUNCTION update_provider_rank();
```

---

## BLOK 6 — Marketplace Disputes

```sql
-- ============================================================
-- DISPUTES (spory zákazník vs. provider)
-- ============================================================
CREATE TYPE dispute_status AS ENUM (
  'opened',
  'provider_responding',
  'platform_review',
  'resolved_customer',    -- rozhodnuto ve prospěch zákazníka
  'resolved_provider',    -- rozhodnuto ve prospěch providera
  'resolved_split',       -- kompromis
  'closed_no_action',
  'escalated_legal'
);

CREATE TYPE dispute_reason AS ENUM (
  'service_not_rendered',     -- zákazník zaplatil, k ničemu nedošlo
  'service_quality',          -- nekvalitní provedení
  'no_show_provider',         -- provider nedorazil
  'wrong_service',            -- jiná služba než objednána
  'unauthorized_charge',      -- zákazníkovi bylo strženo víc
  'refund_not_received',      -- refund byl slíben ale nepřišel
  'provider_behavior',        -- nevhodné chování providera
  'customer_no_show_dispute', -- provider uplatnil no-show fee, zákazník nesouhlasí
  'other'
);

CREATE TABLE marketplace_disputes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Účastníci
  booking_id            UUID NOT NULL REFERENCES bookings(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  provider_id           UUID NOT NULL REFERENCES marketplace_providers(id),
  transaction_id        UUID REFERENCES marketplace_transactions(id),
  
  -- Popis
  reason                dispute_reason NOT NULL,
  customer_description  TEXT NOT NULL,
  requested_resolution  VARCHAR(30),
  -- 'full_refund', 'partial_refund', 'redo_service', 'apology', 'other'
  requested_amount      INTEGER,   -- pokud žádá částečný refund
  
  -- Stav
  status                dispute_status NOT NULL DEFAULT 'opened',
  
  -- Komunikace (timeline zpráv)
  messages              JSONB NOT NULL DEFAULT '[]'::jsonb,
  /*
  [
    {
      "id": "uuid",
      "from": "customer|provider|platform",
      "from_id": "uuid",
      "message": "...",
      "attachments": ["s3://..."],
      "sent_at": "2026-04-10T10:00:00Z"
    }
  ]
  */
  
  -- Evidence
  evidence_urls         TEXT[],
  
  -- Rozhodnutí
  resolved_by           UUID,    -- platforma kdo rozhodl
  resolved_at           TIMESTAMPTZ,
  resolution_notes      TEXT,
  refund_amount         INTEGER, -- výsledná refundace
  
  -- Deadliny
  provider_response_deadline  TIMESTAMPTZ,  -- provider musí odpovědět do X dnů
  platform_decision_deadline  TIMESTAMPTZ,
  
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_md_customer ON marketplace_disputes(customer_id, opened_at DESC);
CREATE INDEX idx_md_provider ON marketplace_disputes(provider_id, opened_at DESC);
CREATE INDEX idx_md_status ON marketplace_disputes(status)
  WHERE status NOT IN ('resolved_customer','resolved_provider','closed_no_action');
```

---

## BLOK 7 — Přehled změn v existujících tabulkách

```sql
-- ============================================================
-- ROZŠÍŘENÍ STÁVAJÍCÍCH TABULEK PRO MARKETPLACE
-- ============================================================

-- Bookings: přidat marketplace kontext
ALTER TABLE bookings ADD COLUMN marketplace_listing_id
  UUID REFERENCES marketplace_listings(id);
ALTER TABLE bookings ADD COLUMN marketplace_transaction_id
  UUID REFERENCES marketplace_transactions(id);
ALTER TABLE bookings ADD COLUMN booked_via
  VARCHAR(20) NOT NULL DEFAULT 'direct';
  -- 'direct' = přes vlastní systém
  -- 'marketplace' = přes marketplace discovery

-- Customers: přidat marketplace profil zákazníka
ALTER TABLE customers ADD COLUMN marketplace_customer_id
  UUID;  -- jeden zákazník může bookovat u více providerů
ALTER TABLE customers ADD COLUMN marketplace_joined_at
  TIMESTAMPTZ;

-- Reviews: přidat marketplace atributy (viz BLOK 5)
-- Bookings: přidat marketplace booking zdroj

-- ============================================================
-- NOVÉ INDEXY PRO MARKETPLACE QUERIES
-- ============================================================

-- Nejčastější query: "najdi poskytovatele v kategorii X, 
--                     v okruhu Y km od bodu Z, 
--                     dostupné v čase T,
--                     seřazené dle ratingu"
-- Tento query spojuje:
-- marketplace_providers (geo + rank)
-- marketplace_listings (category)
-- availability_cache (dostupnost v čase T)

-- GiST index pro geo proximity search
CREATE INDEX idx_mp_geo_rank ON marketplace_providers
  USING GIST (point(geo_lng, geo_lat), search_rank_score)
  WHERE status = 'approved' AND is_listed = TRUE;

-- Composite index pro listing search
CREATE INDEX idx_ml_search ON marketplace_listings (
  marketplace_category_id,
  search_rank_score DESC,
  is_active
) WHERE is_active = TRUE;
```

---

## Shrnutí: Co marketplace přidává nad standard tenant systém

| Komponenta | Standard tenant | Marketplace rozšíření |
|------------|----------------|----------------------|
| Identita providera | tenant | + marketplace_providers profil |
| Onboarding | registrace | + application + KYC workflow |
| Platby | Stripe direct | + Stripe Connect + split transakce |
| Provize | žádná | + commission_rules + marketplace_transactions |
| Výplaty | žádné | + provider_payouts |
| Viditelnost | vlastní web | + marketplace_listings + categories |
| Discovery | N/A | + full-text + geo search |
| Reviews | interní | + veřejné + helpful votes |
| Spory | support email | + disputes workflow |
| Ranking | N/A | + search_rank_score algoritmus |

Architektura je stejná. Marketplace je vrstva navrch — každý tenant se může (nebo nemusí) stát marketplace providerem. Systém zůstává kompatibilní v obou směrech.
