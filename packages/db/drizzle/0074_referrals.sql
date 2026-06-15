-- ============================================================================
-- Sprint 10.35 — referral / doporučovací program. Kód per zákazník, uplatnění
-- novým zákazníkem připíše body oběma. Dřív feature úplně chyběla.
-- ============================================================================

CREATE TABLE IF NOT EXISTS referral_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  code        varchar(32) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS referral_codes_tenant_idx ON referral_codes (tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_customer_uniq ON referral_codes (tenant_id, customer_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_uniq ON referral_codes (tenant_id, code);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_redemptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code_id              uuid NOT NULL,
  referrer_customer_id uuid NOT NULL,
  referee_email        varchar(255) NOT NULL,
  referee_customer_id  uuid,
  referrer_points      integer NOT NULL DEFAULT 0,
  referee_points       integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS referral_redemptions_tenant_idx ON referral_redemptions (tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS referral_redemptions_referee_uniq ON referral_redemptions (tenant_id, referee_email);
--> statement-breakpoint
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE referral_codes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY referral_codes_tenant_isolation ON referral_codes
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON referral_codes TO app_user;
--> statement-breakpoint
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE referral_redemptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY referral_redemptions_tenant_isolation ON referral_redemptions
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON referral_redemptions TO app_user;
