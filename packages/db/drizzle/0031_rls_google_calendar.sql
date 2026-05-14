-- ============================================================================
-- RLS na google_calendar_connections + google_calendar_event_links
-- (sprint 3.3 fáze C1).
-- ============================================================================

ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE google_calendar_connections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY google_calendar_connections_tenant_isolation ON google_calendar_connections
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

ALTER TABLE google_calendar_event_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE google_calendar_event_links FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY google_calendar_event_links_tenant_isolation ON google_calendar_event_links
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
  google_calendar_connections,
  google_calendar_event_links
TO app_user;
