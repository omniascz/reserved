-- ============================================================================
-- RLS na payment_methods + payments + payment_events (sprint 3.2 Fáze A).
-- ============================================================================

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_methods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_methods_tenant_isolation ON payment_methods
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

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payments_tenant_isolation ON payments
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

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payment_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_events_tenant_isolation ON payment_events
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
  payment_methods,
  payments,
  payment_events
TO app_user;
