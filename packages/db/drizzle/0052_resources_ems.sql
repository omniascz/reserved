-- ============================================================================
-- Sprint 10.2 — EMS režim: zdroje (přístroje) + vazba lekce na přístroj.
-- ============================================================================
-- 1) resources = fyzický zdroj (EMS přístroj, místnost, vybavení).
-- 2) class_sessions.resource_id = na kterém přístroji EMS lekce běží.
-- 3) EXCLUDE: stejný přístroj nesmí mít dvě překrývající se otevřené lekce.
-- 4) RLS + grants.
-- ============================================================================

CREATE TABLE resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  type        varchar(32) NOT NULL DEFAULT 'ems_machine',
  is_active   boolean NOT NULL DEFAULT true,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
--> statement-breakpoint
CREATE INDEX resources_tenant_idx ON resources (tenant_id);
--> statement-breakpoint
CREATE INDEX resources_branch_idx ON resources (branch_id);
--> statement-breakpoint

-- ─── class_sessions.resource_id ─────────────────────────────────────────

ALTER TABLE class_sessions ADD COLUMN resource_id uuid REFERENCES resources(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX class_sessions_resource_idx ON class_sessions (resource_id, starts_at);
--> statement-breakpoint

-- Stejný přístroj nesmí mít dvě překrývající se otevřené lekce (analogie 1:1 ochrany).
ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_resource_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(buffer_starts_at, buffer_ends_at, '[)') WITH &&
  )
  WHERE (resource_id IS NOT NULL AND status = 'open');
--> statement-breakpoint

-- ─── RLS na resources ───────────────────────────────────────────────────

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE resources FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY resources_tenant_isolation ON resources
  FOR ALL
  USING (
    app.current_role_or_null() = 'service'
    OR tenant_id = app.current_tenant_id_or_null()
  )
  WITH CHECK (
    app.current_role_or_null() = 'service'
    OR tenant_id = app.current_tenant_id_or_null()
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON resources TO app_user;
