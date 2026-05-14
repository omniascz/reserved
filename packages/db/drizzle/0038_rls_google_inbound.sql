-- ============================================================================
-- RLS na google_calendar_inbound_events (sprint 3.3 fáze C2).
-- ============================================================================

ALTER TABLE google_calendar_inbound_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE google_calendar_inbound_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY google_calendar_inbound_events_tenant_isolation ON google_calendar_inbound_events
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
  google_calendar_inbound_events
TO app_user;
