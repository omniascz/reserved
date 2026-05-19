CREATE TABLE "platform_admin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"refresh_token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_address" varchar(64),
	"user_agent" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "business_type" varchar(64);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "owner_email" varchar(255);--> statement-breakpoint
ALTER TABLE "platform_admin_actions" ADD CONSTRAINT "platform_admin_actions_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admin_sessions" ADD CONSTRAINT "platform_admin_sessions_admin_id_platform_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."platform_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_admin_actions_admin_idx" ON "platform_admin_actions" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_admin_actions_target_idx" ON "platform_admin_actions" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_admin_actions_action_idx" ON "platform_admin_actions" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admin_sessions_token_idx" ON "platform_admin_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "platform_admin_sessions_admin_idx" ON "platform_admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_email_idx" ON "platform_admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "tenants_suspended_idx" ON "tenants" USING btree ("suspended_at");--> statement-breakpoint
CREATE INDEX "tenants_business_type_idx" ON "tenants" USING btree ("business_type");