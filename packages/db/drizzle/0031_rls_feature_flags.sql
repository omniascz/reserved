-- ============================================================================
-- RLS na feature_flags (sprint 3.3 fáze D).
-- ============================================================================

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE feature_flags FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY feature_flags_tenant_isolation ON feature_flags
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

GRANT SELECT, INSERT, UPDATE, DELETE ON feature_flags TO app_user;
