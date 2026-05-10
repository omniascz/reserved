-- ============================================================================
-- RLS pro booking_status_history + notifications.
-- ============================================================================

ALTER TABLE booking_status_history ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE booking_status_history FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY booking_status_history_tenant_isolation ON booking_status_history
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

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_tenant_isolation ON notifications
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
  booking_status_history,
  notifications
TO app_user;
