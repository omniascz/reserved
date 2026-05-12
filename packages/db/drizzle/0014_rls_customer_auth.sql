-- ============================================================================
-- RLS na customer_sessions + customer_magic_links (sprint 2.3).
-- ============================================================================

-- ─── customer_sessions ────────────────────────────────────────────────

ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_sessions_tenant_isolation ON customer_sessions
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

-- ─── customer_magic_links ────────────────────────────────────────────

ALTER TABLE customer_magic_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_magic_links FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_magic_links_tenant_isolation ON customer_magic_links
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
  customer_sessions,
  customer_magic_links
TO app_user;
