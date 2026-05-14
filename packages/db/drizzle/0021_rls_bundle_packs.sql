-- ============================================================================
-- RLS na bundle_packs + customer_bundle_packs + bundle_item_uses
-- (sprint 3.3 fáze A1).
-- ============================================================================

ALTER TABLE bundle_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bundle_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bundle_packs_tenant_isolation ON bundle_packs
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

ALTER TABLE customer_bundle_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_bundle_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_bundle_packs_tenant_isolation ON customer_bundle_packs
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

ALTER TABLE bundle_item_uses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bundle_item_uses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bundle_item_uses_tenant_isolation ON bundle_item_uses
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
  bundle_packs,
  customer_bundle_packs,
  bundle_item_uses
TO app_user;
