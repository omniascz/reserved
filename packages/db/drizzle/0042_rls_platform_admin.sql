-- ============================================================================
-- RLS na platform_admins + platform_admin_actions + platform_admin_sessions.
-- ============================================================================
-- Tyto tabulky NEJSOU tenant-scoped — patri provozovateli platformy (Reserved).
-- Policy: pristupna pouze role 'service' (pres serviceContext() v rls-multitenancy).
-- API server zajistuje, ze /platform/* endpointy bezi v service kontextu.
-- ============================================================================

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_admins_service_only ON platform_admins
  FOR ALL
  USING (app.current_role_or_null() = 'service')
  WITH CHECK (app.current_role_or_null() = 'service');
--> statement-breakpoint

ALTER TABLE platform_admin_actions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_admin_actions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_admin_actions_service_only ON platform_admin_actions
  FOR ALL
  USING (app.current_role_or_null() = 'service')
  WITH CHECK (app.current_role_or_null() = 'service');
--> statement-breakpoint

ALTER TABLE platform_admin_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE platform_admin_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY platform_admin_sessions_service_only ON platform_admin_sessions
  FOR ALL
  USING (app.current_role_or_null() = 'service')
  WITH CHECK (app.current_role_or_null() = 'service');
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON
  platform_admins,
  platform_admin_actions,
  platform_admin_sessions
TO app_user;
