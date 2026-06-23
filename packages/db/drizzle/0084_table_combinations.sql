-- ============================================================================
-- Sprint 10.23 — Vertikála Restaurace, fáze R3: slučitelné sestavy stolů.
-- Restaurace definuje, které stoly lze spojit a jaká je výsledná kapacita.
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_combinations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id          uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name               varchar(100) NOT NULL,
  resource_ids       uuid[] NOT NULL,
  combined_capacity  integer NOT NULL,
  min_party_size     integer NOT NULL DEFAULT 1,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT table_combinations_capacity_positive CHECK (combined_capacity > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_combinations_tenant_idx ON table_combinations (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_combinations_branch_idx ON table_combinations (branch_id);
--> statement-breakpoint
ALTER TABLE table_combinations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE table_combinations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY table_combinations_tenant_isolation ON table_combinations
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON table_combinations TO app_user;
