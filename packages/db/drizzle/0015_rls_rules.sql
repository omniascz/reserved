-- ============================================================================
-- RLS na rules + rule_executions (sprint 2.5).
-- ============================================================================

ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rules FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rules_tenant_isolation ON rules
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

ALTER TABLE rule_executions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rule_executions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rule_executions_tenant_isolation ON rule_executions
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
  rules,
  rule_executions
TO app_user;
