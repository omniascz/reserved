-- ============================================================================
-- Sprint 10.23 — Vertikála Restaurace, fáze R1: směny / dayparts (service_periods).
-- Rezervovatelná okna provozu (Oběd / Večeře) s pacingem a pravidly doby sezení.
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_periods (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id            uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name                 varchar(50) NOT NULL,
  days_of_week         integer[] NOT NULL,
  starts_at            time NOT NULL,
  ends_at              time NOT NULL,
  last_seating         time,
  slot_interval_min    integer NOT NULL DEFAULT 15,
  max_covers_per_slot  integer,
  max_parties_per_slot integer,
  turn_time_rules      jsonb NOT NULL DEFAULT '[]'::jsonb,
  deposit_threshold_guests   integer,
  deposit_per_guest_hellers  integer NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT service_periods_window_valid CHECK (ends_at > starts_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_periods_tenant_idx ON service_periods (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_periods_branch_idx ON service_periods (branch_id);
--> statement-breakpoint
ALTER TABLE service_periods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE service_periods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_periods_tenant_isolation ON service_periods
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON service_periods TO app_user;
