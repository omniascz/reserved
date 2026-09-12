-- ============================================================================
-- Sprint 10.14 — série opakovaných 1:1 rezervací (pravidelné termíny).
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id       uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  employee_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  customer_name    varchar(200) NOT NULL,
  customer_email   varchar(255) NOT NULL,
  customer_phone   varchar(32),
  frequency        varchar(16) NOT NULL,
  starts_at        timestamptz NOT NULL,
  occurrence_count integer NOT NULL,
  status           varchar(16) NOT NULL DEFAULT 'active',
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_series_tenant_idx ON booking_series (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_series_employee_idx ON booking_series (employee_id);
--> statement-breakpoint
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES booking_series(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bookings_series_idx ON bookings (series_id);
--> statement-breakpoint
-- RLS: booking_series dědí stejný tenant-scoped model jako ostatní tabulky.
ALTER TABLE booking_series ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE booking_series FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY booking_series_tenant_isolation ON booking_series
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
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_series TO app_user;
