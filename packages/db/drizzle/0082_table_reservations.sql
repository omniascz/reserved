-- ============================================================================
-- Sprint 10.23 — Vertikála Restaurace, fáze R1: rezervace stolu (table_reservations).
-- Booking-level záznam (host, čas, počet osob). Autoritativní obsazenost stolů
-- je v table_reservation_tables (migrace 0083) — tam je i EXCLUDE. resource_id
-- je zde jen denormalizovaný ukazatel na vedoucí stůl pro výpis.
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_reservations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id          uuid REFERENCES branches(id) ON DELETE SET NULL,
  resource_id        uuid REFERENCES resources(id) ON DELETE RESTRICT,
  service_period_id  uuid REFERENCES service_periods(id) ON DELETE SET NULL,
  customer_id        uuid,
  customer_name      varchar(200) NOT NULL,
  customer_email     varchar(255),
  customer_phone     varchar(32),
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz NOT NULL,
  party_size         integer NOT NULL DEFAULT 2,
  seating_pref       varchar(30),
  occasion           varchar(50),
  deposit_hellers    integer NOT NULL DEFAULT 0,
  currency           varchar(3) NOT NULL DEFAULT 'CZK',
  status             varchar(16) NOT NULL DEFAULT 'confirmed',
  note               text,
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_reservations_window_valid CHECK (ends_at > starts_at),
  CONSTRAINT table_reservations_party_positive CHECK (party_size > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_reservations_tenant_idx ON table_reservations (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_reservations_resource_idx ON table_reservations (resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_reservations_starts_at_idx ON table_reservations (tenant_id, starts_at);
--> statement-breakpoint
ALTER TABLE table_reservations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE table_reservations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY table_reservations_tenant_isolation ON table_reservations
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON table_reservations TO app_user;
