-- ============================================================================
-- RLS policies pro tabulky služeb a zaměstnanců.
-- ============================================================================
-- Vzor stejný jako u tenants/branches/users:
--   - service: bypass (vidí všechno)
--   - non-service: vidí jen rows s tenant_id = app.current_tenant_id
-- ============================================================================

-- ─── service_categories ─────────────────────────────────────────────────

ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_categories_tenant_isolation ON service_categories
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

-- ─── services ───────────────────────────────────────────────────────────

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE services FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY services_tenant_isolation ON services
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

-- ─── service_addons ─────────────────────────────────────────────────────

ALTER TABLE service_addons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_addons FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_addons_tenant_isolation ON service_addons
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

-- ─── employees ──────────────────────────────────────────────────────────

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY employees_tenant_isolation ON employees
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

-- ─── employee_branches ──────────────────────────────────────────────────

ALTER TABLE employee_branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY employee_branches_tenant_isolation ON employee_branches
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

-- ─── employee_services ──────────────────────────────────────────────────

ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_services FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY employee_services_tenant_isolation ON employee_services
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

-- ─── employee_working_hours ─────────────────────────────────────────────

ALTER TABLE employee_working_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_working_hours FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY employee_working_hours_tenant_isolation ON employee_working_hours
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

-- ─── employee_schedule_exceptions ───────────────────────────────────────

ALTER TABLE employee_schedule_exceptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE employee_schedule_exceptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY employee_schedule_exceptions_tenant_isolation ON employee_schedule_exceptions
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

-- ─── Grants for app_user (per 0003_app_role pattern) ────────────────────
-- Default privileges už pokryjí budoucí tabulky, ale tabulky vytvořené
-- v migraci 0004 vznikly bez tohoto defaulta a potřebují explicitní GRANT.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  service_categories,
  services,
  service_addons,
  employees,
  employee_branches,
  employee_services,
  employee_working_hours,
  employee_schedule_exceptions
TO app_user;
