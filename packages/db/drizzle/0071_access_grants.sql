-- ============================================================================
-- Sprint 10.32 — access control: vstup kódem/QR bez personálu (open gym,
-- privátní posilovna na sloty). Kód = access_grant; pokus o vstup = access_event.
-- ============================================================================

CREATE TABLE IF NOT EXISTS access_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  booking_id    uuid,
  customer_id   uuid,
  customer_name varchar(200),
  code          varchar(32) NOT NULL,
  kind          varchar(16) NOT NULL DEFAULT 'booking',
  valid_from    timestamptz NOT NULL,
  valid_until   timestamptz NOT NULL,
  max_uses      integer NOT NULL DEFAULT 1,
  uses_count    integer NOT NULL DEFAULT 0,
  status        varchar(16) NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS access_grants_tenant_idx ON access_grants (tenant_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS access_grants_tenant_code_unique
  ON access_grants (tenant_id, code);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS access_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grant_id   uuid,
  code       varchar(32) NOT NULL,
  branch_id  uuid,
  result     varchar(16) NOT NULL,
  reason     varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS access_events_tenant_idx ON access_events (tenant_id);
--> statement-breakpoint
ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE access_grants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY access_grants_tenant_isolation ON access_grants
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON access_grants TO app_user;
--> statement-breakpoint
ALTER TABLE access_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE access_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY access_events_tenant_isolation ON access_events
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON access_events TO app_user;
