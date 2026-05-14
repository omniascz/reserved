-- ============================================================================
-- RLS na subscription_plans + customer_subscriptions + subscription_events
-- (sprint 3.3 fáze A3).
-- ============================================================================

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscription_plans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY subscription_plans_tenant_isolation ON subscription_plans
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

ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_subscriptions_tenant_isolation ON customer_subscriptions
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

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE subscription_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY subscription_events_tenant_isolation ON subscription_events
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
  subscription_plans,
  customer_subscriptions,
  subscription_events
TO app_user;
