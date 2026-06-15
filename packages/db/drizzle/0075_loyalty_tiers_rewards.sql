-- ============================================================================
-- Sprint 10.36 — věrnostní úrovně (tiery) + katalog odměn. Dřív loyalty uměl
-- jen body + ruční redeem; chyběly tiery a odměny za body.
-- ============================================================================

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       varchar(100) NOT NULL,
  min_points integer NOT NULL DEFAULT 0,
  perk       text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS loyalty_tiers_tenant_idx ON loyalty_tiers (tenant_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  description text,
  points_cost integer NOT NULL,
  kind        varchar(24) NOT NULL DEFAULT 'custom',
  value       integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS loyalty_rewards_tenant_idx ON loyalty_rewards (tenant_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS loyalty_reward_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  reward_id   uuid NOT NULL,
  reward_name varchar(200) NOT NULL,
  points_cost integer NOT NULL,
  code        varchar(32) NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'issued',
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS loyalty_reward_redemptions_tenant_idx ON loyalty_reward_redemptions (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS loyalty_reward_redemptions_customer_idx ON loyalty_reward_redemptions (tenant_id, customer_id);
--> statement-breakpoint
ALTER TABLE loyalty_tiers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty_tiers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY loyalty_tiers_tenant_isolation ON loyalty_tiers
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty_tiers TO app_user;
--> statement-breakpoint
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty_rewards FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY loyalty_rewards_tenant_isolation ON loyalty_rewards
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty_rewards TO app_user;
--> statement-breakpoint
ALTER TABLE loyalty_reward_redemptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty_reward_redemptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY loyalty_reward_redemptions_tenant_isolation ON loyalty_reward_redemptions
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty_reward_redemptions TO app_user;
