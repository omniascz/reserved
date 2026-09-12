-- ============================================================================
-- Doplněk 10.15 — provize zaměstnanců (payroll). Pravidla provizí + report.
-- ============================================================================

CREATE TABLE IF NOT EXISTS commission_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  service_id         uuid REFERENCES services(id) ON DELETE CASCADE,
  commission_percent integer NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commission_rules_tenant_idx ON commission_rules (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commission_rules_employee_idx ON commission_rules (employee_id);
--> statement-breakpoint
-- Jedna výchozí provize na zaměstnance (service_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_default_uidx
  ON commission_rules (tenant_id, employee_id)
  WHERE service_id IS NULL;
--> statement-breakpoint
-- Jeden override na (zaměstnanec, služba).
CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_service_uidx
  ON commission_rules (tenant_id, employee_id, service_id)
  WHERE service_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE commission_rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY commission_rules_tenant_isolation ON commission_rules
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
GRANT SELECT, INSERT, UPDATE, DELETE ON commission_rules TO app_user;
