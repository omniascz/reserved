-- ============================================================================
-- Sprint 10.24 — Motor 4: dispečink zakázek (malá logistika).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS logistics_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  vehicle_id      uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  driver_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  customer_name   varchar(200),
  customer_phone  varchar(32),
  pickup_address  text NOT NULL,
  dropoff_address text NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  weight_grams    integer,
  price_hellers   integer NOT NULL DEFAULT 0,
  status          varchar(16) NOT NULL DEFAULT 'scheduled',
  note            text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logistics_jobs_time_valid CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS logistics_jobs_tenant_idx ON logistics_jobs (tenant_id, starts_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS logistics_jobs_vehicle_idx ON logistics_jobs (vehicle_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS logistics_jobs_driver_idx ON logistics_jobs (driver_id);
--> statement-breakpoint
-- Vůz nesmí mít dvě překrývající se nezrušené zakázky.
ALTER TABLE logistics_jobs
  ADD CONSTRAINT logistics_jobs_vehicle_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status <> 'cancelled');
--> statement-breakpoint
-- Řidič nesmí mít dvě překrývající se nezrušené zakázky.
ALTER TABLE logistics_jobs
  ADD CONSTRAINT logistics_jobs_driver_no_overlap
  EXCLUDE USING gist (driver_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status <> 'cancelled');
--> statement-breakpoint
ALTER TABLE logistics_jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE logistics_jobs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY logistics_jobs_tenant_isolation ON logistics_jobs
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON logistics_jobs TO app_user;
