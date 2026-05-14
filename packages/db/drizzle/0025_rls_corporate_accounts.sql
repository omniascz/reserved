-- ============================================================================
-- RLS na corporate_accounts + corporate_account_members
-- (sprint 3.3 fáze B1).
-- ============================================================================

ALTER TABLE corporate_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE corporate_accounts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY corporate_accounts_tenant_isolation ON corporate_accounts
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

ALTER TABLE corporate_account_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE corporate_account_members FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY corporate_account_members_tenant_isolation ON corporate_account_members
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
  corporate_accounts,
  corporate_account_members
TO app_user;
