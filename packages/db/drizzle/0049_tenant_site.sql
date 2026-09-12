-- Sprint 9.0-A: Tenant mini-website (šablony)
--
-- Přidává:
--   site_template — vybraná šablona ('elegant', 'bold', 'fresh', NULL = bez stránky)
--   site_enabled — bool, je tenant mini-web aktivní (musí být template + obsah)
--   site_content — jsonb s obsahem sekcí (hero, about, team, gallery, faq, contact)
--
-- Pro produkci tenant na své vlastní doméně dostane mini-web. Bez šablony
-- (NULL) doména routuje na widget jako dosud.

ALTER TABLE tenants
  ADD COLUMN site_template varchar(32),
  ADD COLUMN site_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN site_content jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index pro rychly lookup published sites
CREATE INDEX IF NOT EXISTS tenants_site_enabled_idx
  ON tenants(site_enabled)
  WHERE site_enabled = true;
