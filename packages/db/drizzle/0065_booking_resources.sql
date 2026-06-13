-- ============================================================================
-- Sprint 10.21 — Motor 1 fáze 1a: více zdrojů na jednu rezervaci.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS booking_resources (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id       uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  resource_id      uuid NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
  role             varchar(32),
  buffer_starts_at timestamptz NOT NULL,
  buffer_ends_at   timestamptz NOT NULL,
  status           varchar(16) NOT NULL DEFAULT 'active',
  created_at       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_resources_tenant_idx ON booking_resources (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_resources_booking_idx ON booking_resources (booking_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS booking_resources_resource_idx ON booking_resources (resource_id);
--> statement-breakpoint
-- Tvrdá ochrana: jeden zdroj nesmí být ve dvou aktivních navázáních naráz.
ALTER TABLE booking_resources
  ADD CONSTRAINT booking_resources_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(buffer_starts_at, buffer_ends_at, '[)') WITH &&
  )
  WHERE (status = 'active');
--> statement-breakpoint
ALTER TABLE booking_resources ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE booking_resources FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY booking_resources_tenant_isolation ON booking_resources
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_resources TO app_user;
