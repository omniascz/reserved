CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"custom_domain" varchar(255),
	"plan" varchar(32) DEFAULT 'starter' NOT NULL,
	"status" varchar(32) DEFAULT 'trial' NOT NULL,
	"locale" varchar(8) DEFAULT 'cs-CZ' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Europe/Prague' NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"address" text,
	"city" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(2) DEFAULT 'CZ' NOT NULL,
	"phone" varchar(32),
	"email" varchar(255),
	"timezone" varchar(64),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(32),
	"role" varchar(32) DEFAULT 'employee' NOT NULL,
	"custom_role_id" uuid,
	"email_verified_at" timestamp with time zone,
	"two_factor_secret" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_idx" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_custom_domain_idx" ON "tenants" USING btree ("custom_domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_tenant_idx" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_tenant_slug_idx" ON "branches" USING btree ("tenant_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_email_idx" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_tenant_role_idx" ON "users" USING btree ("tenant_id","role");