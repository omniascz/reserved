-- Sprint 8.0-4: Marketplace v1 — public katalog na reserved.cz
--
-- Pridava sloupce pro tenant public profile:
--   - listed_in_catalog: bool — opt-in (default false), tenant musi vedome zapnout
--   - public_description: dlouhy popis pro katalog (markdown OK)
--   - public_city: vyhledavaci klic
--   - public_address: lokalizace s ulici a PSC
--   - public_photos: jsonb pole URL fotografii (cover + dalsi)
--   - public_business_hours: jsonb { mon: '9-18', tue: '9-18', ... }
--
-- Reviews & ratings prijdou ve Sprintu 8.0-4.2 (samostatna tabulka).

ALTER TABLE tenants
  ADD COLUMN listed_in_catalog boolean NOT NULL DEFAULT false,
  ADD COLUMN public_description text,
  ADD COLUMN public_city varchar(100),
  ADD COLUMN public_address text,
  ADD COLUMN public_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN public_business_hours jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Indexy pro katalog search
CREATE INDEX IF NOT EXISTS tenants_listed_catalog_idx
  ON tenants(listed_in_catalog)
  WHERE listed_in_catalog = true AND deleted_at IS NULL AND suspended_at IS NULL;

CREATE INDEX IF NOT EXISTS tenants_public_city_idx
  ON tenants(public_city)
  WHERE listed_in_catalog = true AND public_city IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenants_business_type_listed_idx
  ON tenants(business_type)
  WHERE listed_in_catalog = true AND business_type IS NOT NULL;
