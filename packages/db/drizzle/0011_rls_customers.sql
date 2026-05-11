-- ============================================================================
-- RLS + FK pro customers, customer_tags, customer_notes.
-- ============================================================================

-- FK constraint na bookings.customer_id (nullable — backward compat)
ALTER TABLE bookings
  ADD CONSTRAINT bookings_customer_id_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bookings_customer_idx_v2 ON bookings(customer_id);
--> statement-breakpoint

-- ─── RLS na customers ───────────────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customers_tenant_isolation ON customers
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

-- ─── RLS na customer_tags ──────────────────────────────────────────────

ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_tags FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_tags_tenant_isolation ON customer_tags
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

-- ─── RLS na customer_notes ─────────────────────────────────────────────

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_notes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_notes_tenant_isolation ON customer_notes
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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  customers,
  customer_tags,
  customer_notes
TO app_user;
