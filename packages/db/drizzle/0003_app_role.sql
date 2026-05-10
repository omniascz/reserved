-- ============================================================================
-- Reserved app_user role — non-superuser identita pro běh aplikace.
-- ============================================================================
-- Migrace samé probíhají jako `dev` (superuser, vlastní tabulky), ale aplikace
-- (apps/api) se musí connectovat jako `app_user`, který:
--   - není superuser  → RLS se na něj vztahuje
--   - není owner      → FORCE ROW LEVEL SECURITY se na něj vztahuje
--   - má jen DML práva → nemůže nic ALTER/DROP
--
-- V produkci budou DATABASE_URL (migrace) a DATABASE_APP_URL (runtime) dvě
-- různá URL. V local dev compose může být oba ve stejné DB jen s rozdílnými
-- credentials.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public, app TO app_user;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
--> statement-breakpoint

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_user;
--> statement-breakpoint

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
--> statement-breakpoint

-- Default privileges pro budoucí migrace — když dev vytvoří novou tabulku,
-- app_user automaticky dostane DML práva.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
--> statement-breakpoint

ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO app_user;
