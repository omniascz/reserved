-- ============================================================================
-- RLS na time_packs + customer_time_packs + time_pack_uses
-- (sprint 3.3 fáze A2).
-- ============================================================================

ALTER TABLE time_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE time_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY time_packs_tenant_isolation ON time_packs
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

ALTER TABLE customer_time_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_time_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_time_packs_tenant_isolation ON customer_time_packs
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

ALTER TABLE time_pack_uses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE time_pack_uses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY time_pack_uses_tenant_isolation ON time_pack_uses
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
  time_packs,
  customer_time_packs,
  time_pack_uses
TO app_user;
