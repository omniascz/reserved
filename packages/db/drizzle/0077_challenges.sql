-- ============================================================================
-- Sprint 10.38 — výzvy + leaderboard (retenční engine pro fitness).
-- ============================================================================

CREATE TABLE IF NOT EXISTS challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  description text,
  metric      varchar(16) NOT NULL DEFAULT 'attendance',
  goal        integer NOT NULL DEFAULT 0,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  status      varchar(16) NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS challenges_tenant_idx ON challenges (tenant_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS challenge_participants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  challenge_id   uuid NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  customer_id    uuid,
  customer_name  varchar(200) NOT NULL,
  customer_email varchar(255) NOT NULL,
  joined_at      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS challenge_participants_challenge_idx ON challenge_participants (challenge_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS challenge_participants_uniq ON challenge_participants (challenge_id, customer_email);
--> statement-breakpoint
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE challenges FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY challenges_tenant_isolation ON challenges
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON challenges TO app_user;
--> statement-breakpoint
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE challenge_participants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY challenge_participants_tenant_isolation ON challenge_participants
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON challenge_participants TO app_user;
