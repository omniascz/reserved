CREATE TABLE "customer_magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"email" varchar(255) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"purpose" varchar(32) DEFAULT 'login' NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_ip" varchar(45),
	"requested_ua" text
);
--> statement-breakpoint
CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"family" uuid NOT NULL,
	"refresh_token_jti" uuid NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(50),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "password_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "customer_magic_links" ADD CONSTRAINT "customer_magic_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_magic_links" ADD CONSTRAINT "customer_magic_links_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_magic_links_tenant_idx" ON "customer_magic_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customer_magic_links_email_idx" ON "customer_magic_links" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "customer_magic_links_token_hash_idx" ON "customer_magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_magic_links_expiry_idx" ON "customer_magic_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_sessions_tenant_idx" ON "customer_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customer_sessions_customer_idx" ON "customer_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_sessions_family_idx" ON "customer_sessions" USING btree ("family");--> statement-breakpoint
CREATE INDEX "customer_sessions_expiry_idx" ON "customer_sessions" USING btree ("expires_at");