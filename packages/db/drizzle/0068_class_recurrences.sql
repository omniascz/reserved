-- ============================================================================
-- Sprint 10.25 — opakovaný rozvrh skupinových lekcí (hloubka A).
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_recurrences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id   uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  resource_id  uuid REFERENCES resources(id) ON DELETE SET NULL,
  branch_id    uuid REFERENCES branches(id) ON DELETE SET NULL,
  capacity     integer,
  days_of_week jsonb NOT NULL DEFAULT '[]',
  time         varchar(5) NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  status       varchar(16) NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_recurrences_tenant_idx ON class_recurrences (tenant_id);
--> statement-breakpoint
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS recurrence_id uuid REFERENCES class_recurrences(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_sessions_recurrence_idx ON class_sessions (recurrence_id);
--> statement-breakpoint
ALTER TABLE class_recurrences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_recurrences FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY class_recurrences_tenant_isolation ON class_recurrences
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON class_recurrences TO app_user;
