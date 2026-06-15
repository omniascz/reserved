-- ============================================================================
-- Sprint 10.42 — záznamy o návštěvě/ošetření (spa/fyzio appointment služby).
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointment_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id     uuid NOT NULL,
  customer_id    uuid,
  customer_name  varchar(200) NOT NULL,
  customer_email varchar(255) NOT NULL,
  employee_id    uuid,
  summary        text NOT NULL,
  private_note   text,
  follow_up_at   timestamptz,
  created_by     varchar(64),
  created_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS appointment_records_tenant_idx ON appointment_records (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS appointment_records_booking_idx ON appointment_records (booking_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS appointment_records_customer_idx ON appointment_records (tenant_id, customer_email);
--> statement-breakpoint
ALTER TABLE appointment_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE appointment_records FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY appointment_records_tenant_isolation ON appointment_records
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_records TO app_user;
