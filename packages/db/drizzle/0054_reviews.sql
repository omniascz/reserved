-- ============================================================================
-- Sprint 10.6 — Recenze / hodnocení (1–5 + text), 1 recenze na rezervaci.
-- ============================================================================

CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id   uuid NOT NULL,
  customer_id  uuid,
  service_id   uuid REFERENCES services(id) ON DELETE SET NULL,
  employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  rating       integer NOT NULL,
  comment      text,
  status       varchar(32) NOT NULL DEFAULT 'published',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_range CHECK (rating >= 1 AND rating <= 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX reviews_booking_uniq ON reviews (booking_id);
--> statement-breakpoint
CREATE INDEX reviews_tenant_idx ON reviews (tenant_id);
--> statement-breakpoint
CREATE INDEX reviews_service_idx ON reviews (tenant_id, service_id, status);
--> statement-breakpoint
CREATE INDEX reviews_employee_idx ON reviews (tenant_id, employee_id, status);
--> statement-breakpoint

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reviews_tenant_isolation ON reviews
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

GRANT SELECT, INSERT, UPDATE, DELETE ON reviews TO app_user;
