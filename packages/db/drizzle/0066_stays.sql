-- ============================================================================
-- Sprint 10.22 — Motor 2: pobyt na dny (hotely, půjčovny).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stays (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id               uuid REFERENCES branches(id) ON DELETE SET NULL,
  resource_id             uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  customer_id             uuid,
  customer_name           varchar(200) NOT NULL,
  customer_email          varchar(255),
  customer_phone          varchar(32),
  check_in                date NOT NULL,
  check_out               date NOT NULL,
  nights                  integer NOT NULL,
  guests                  integer NOT NULL DEFAULT 1,
  price_per_night_hellers integer NOT NULL DEFAULT 0,
  total_hellers           integer NOT NULL DEFAULT 0,
  currency                varchar(3) NOT NULL DEFAULT 'CZK',
  status                  varchar(16) NOT NULL DEFAULT 'confirmed',
  note                    text,
  created_by              uuid REFERENCES users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stays_dates_valid CHECK (check_out > check_in)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stays_tenant_idx ON stays (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stays_resource_idx ON stays (resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS stays_checkin_idx ON stays (tenant_id, check_in);
--> statement-breakpoint
-- Tvrdá ochrana: jednotka nesmí mít dvě nezrušené rezervace na překrývající se dny.
ALTER TABLE stays
  ADD CONSTRAINT stays_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  )
  WHERE (status <> 'cancelled');
--> statement-breakpoint
ALTER TABLE stays ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stays FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stays_tenant_isolation ON stays
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON stays TO app_user;
