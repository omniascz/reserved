-- Sprint 8.0-1: Custom domains per tenant — verifikace
--
-- Pridava sloupce pro overovani vlastnictvi domeny:
--   - custom_domain_verified_at: NOT NULL = doména je ověřená a používá se v middleware
--   - custom_domain_verification_token: 32 znaků hex, tenant nastaví TXT záznam
--     `_reserved-verification.<custom_domain>` s touto hodnotou

ALTER TABLE tenants
  ADD COLUMN custom_domain_verified_at timestamptz,
  ADD COLUMN custom_domain_verification_token varchar(64);

-- Index pro rychlé hledání jen ověřených domén
CREATE INDEX IF NOT EXISTS tenants_custom_domain_verified_idx
  ON tenants(custom_domain)
  WHERE custom_domain IS NOT NULL AND custom_domain_verified_at IS NOT NULL;
