-- ============================================================================
-- RLS na credit_packs + customer_credit_packs + credit_uses (sprint 3.1).
-- ============================================================================

ALTER TABLE credit_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credit_packs_tenant_isolation ON credit_packs
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

ALTER TABLE customer_credit_packs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_credit_packs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_credit_packs_tenant_isolation ON customer_credit_packs
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

ALTER TABLE credit_uses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE credit_uses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY credit_uses_tenant_isolation ON credit_uses
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
  credit_packs,
  customer_credit_packs,
  credit_uses
TO app_user;
