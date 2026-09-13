CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" uuid,
	"ip_address" varchar(45),
	"user_agent" text,
	"reason" varchar(32) DEFAULT 'bad_password' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_lookup_idx" ON "login_attempts" USING btree ("tenant_id","email","resolved_at","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_created_idx" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint

-- ============================================================================
-- RUČNĚ DOPLNĚNO — drizzle tohle NEGENERUJE.
--
-- Bez následujících příkazů by tabulka s e-maily a IP adresami stála MIMO
-- izolaci tenantů a aplikační role `app_user` by na ni neměla žádná práva.
-- Viz CLAUDE.md: RLS politiky a granty žijí jen v ručních migracích.
--
-- Výjimka pro roli `service` je tu nutná: přihlašování běží ještě PŘED tím,
-- než je znám přihlášený uživatel (tenant kontext je, ale uživatel ne), a
-- úklidový poller jede napříč všemi tenanty.
-- ============================================================================
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY login_attempts_tenant_isolation ON login_attempts
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON login_attempts TO app_user;