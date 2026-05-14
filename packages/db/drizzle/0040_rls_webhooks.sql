-- ============================================================================
-- RLS na outgoing_webhooks + webhook_deliveries (sprint 3.3 fáze C5).
-- ============================================================================

ALTER TABLE outgoing_webhooks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outgoing_webhooks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outgoing_webhooks_tenant_isolation ON outgoing_webhooks
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

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY webhook_deliveries_tenant_isolation ON webhook_deliveries
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
  outgoing_webhooks,
  webhook_deliveries
TO app_user;
