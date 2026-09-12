-- ============================================================================
-- Sprint 10.34 — výplaty (payouts): persistovaný payslip za období z provizí,
-- označitelný jako proplacený. Dřív payroll uměl jen efemérní report.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payouts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name      varchar(200) NOT NULL,
  period_from        timestamptz NOT NULL,
  period_to          timestamptz NOT NULL,
  bookings_count     integer NOT NULL DEFAULT 0,
  gross_hellers      integer NOT NULL DEFAULT 0,
  commission_hellers integer NOT NULL DEFAULT 0,
  status             varchar(16) NOT NULL DEFAULT 'pending',
  paid_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payouts_tenant_idx ON payouts (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payouts_employee_idx ON payouts (employee_id);
--> statement-breakpoint
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payouts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payouts_tenant_isolation ON payouts
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON payouts TO app_user;
