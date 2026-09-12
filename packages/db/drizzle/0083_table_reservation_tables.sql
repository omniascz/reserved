-- ============================================================================
-- Sprint 10.23 — Vertikála Restaurace, R1/R3: obsazenost stolů (join + EXCLUDE).
-- Autoritativní zdroj o tom, který stůl drží která rezervace v jakém čase.
-- JEDEN EXCLUDE pokrývá R1 (1 stůl) i R3 (slučování N stolů) → bez slepých míst.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS table_reservation_tables (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id      uuid NOT NULL REFERENCES table_reservations(id) ON DELETE CASCADE,
  resource_id         uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  is_primary          boolean NOT NULL DEFAULT false,
  occupied_starts_at  timestamptz NOT NULL,
  occupied_ends_at    timestamptz NOT NULL,
  status              varchar(16) NOT NULL DEFAULT 'confirmed',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trt_window_valid CHECK (occupied_ends_at > occupied_starts_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_reservation_tables_tenant_idx ON table_reservation_tables (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_reservation_tables_reservation_idx ON table_reservation_tables (reservation_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS table_reservation_tables_resource_idx ON table_reservation_tables (resource_id);
--> statement-breakpoint
-- Tvrdá ochrana: jeden stůl nesmí být ve dvou obsazených rezervacích naráz.
-- Zrušené a no-show stůl uvolňují (mimo EXCLUDE).
ALTER TABLE table_reservation_tables
  ADD CONSTRAINT table_reservation_tables_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(occupied_starts_at, occupied_ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));
--> statement-breakpoint
ALTER TABLE table_reservation_tables ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE table_reservation_tables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY table_reservation_tables_tenant_isolation ON table_reservation_tables
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON table_reservation_tables TO app_user;
