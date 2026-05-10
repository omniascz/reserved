-- ============================================================================
-- Reserved RLS policies — multi-tenant izolace na DB úrovni.
-- ============================================================================
-- Tato migrace zapíná Row Level Security na všech tenant-scoped tabulkách
-- a vytváří policies, které čtou session proměnné nastavené pomocí
-- `withTenantContext()` z @reserved/rls-multitenancy.
--
-- Session proměnné (SET LOCAL):
--   app.current_tenant_id  — UUID aktuálního tenanta
--   app.current_user_id    — UUID admin usera nebo customera
--   app.current_branch_id  — UUID pobočky
--   app.current_role       — 'service' | 'owner' | 'manager' | 'employee' |
--                            'receptionist' | 'customer'
--
-- FORCE ROW LEVEL SECURITY: vlastník tabulky (dev role v Dockeru) by jinak
-- bypassoval RLS. V produkci aplikace musí používat ne-superuser role; pro
-- local dev FORCE zaručuje stejné chování jako v prod.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_role_or_null()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_role', true), '')
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_tenant_id_or_null()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN current_setting('app.current_tenant_id', true) IS NULL
      OR current_setting('app.current_tenant_id', true) = ''
    THEN NULL
    ELSE current_setting('app.current_tenant_id', true)::uuid
  END
$$;
--> statement-breakpoint

-- Tenants — speciální: každý vidí jen svůj záznam, service vidí všechno.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenants_isolation ON tenants
  FOR ALL
  USING (
    app.current_role_or_null() = 'service'
    OR id = app.current_tenant_id_or_null()
  )
  WITH CHECK (
    app.current_role_or_null() = 'service'
    OR id = app.current_tenant_id_or_null()
  );
--> statement-breakpoint

-- Branches — všichni v rámci tenanta vidí všechny pobočky.
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY branches_tenant_isolation ON branches
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

-- Users (administrativní)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_tenant_isolation ON users
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

-- User sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_sessions_tenant_isolation ON user_sessions
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

-- Email verifications
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE email_verifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY email_verifications_tenant_isolation ON email_verifications
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

-- Onboarding checklist — jen owner/manager/service může vidět.
ALTER TABLE onboarding_checklist ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE onboarding_checklist FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY onboarding_checklist_tenant_isolation ON onboarding_checklist
  FOR ALL
  USING (
    app.current_role_or_null() = 'service'
    OR (
      tenant_id = app.current_tenant_id_or_null()
      AND app.current_role_or_null() IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    app.current_role_or_null() = 'service'
    OR (
      tenant_id = app.current_tenant_id_or_null()
      AND app.current_role_or_null() IN ('owner', 'manager')
    )
  );
