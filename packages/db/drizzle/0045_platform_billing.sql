CREATE TABLE "platform_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(32) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"monthly_price_hellers" integer NOT NULL,
	"yearly_price_hellers" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"stripe_monthly_price_id" varchar(64),
	"stripe_yearly_price_id" varchar(64),
	"trial_days" integer DEFAULT 0 NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_customer_id" varchar(64);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_id" varchar(64);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "stripe_subscription_status" varchar(32);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "cancel_at_period_end" varchar(8) DEFAULT 'false';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_email" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "platform_plans_key_idx" ON "platform_plans" USING btree ("key");