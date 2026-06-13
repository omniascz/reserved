-- ============================================================================
-- Sprint 10.29 — platby koncových klientů P1: propojení účtu tenanta (Connect).
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider        varchar(16) NOT NULL,
  account_id      varchar(255),
  status          varchar(16) NOT NULL DEFAULT 'pending',
  charges_enabled boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payment_connections_tenant_provider_idx
  ON payment_connections (tenant_id, provider);
--> statement-breakpoint
ALTER TABLE payment_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_connections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_connections_tenant_isolation ON payment_connections
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_connections TO app_user;
