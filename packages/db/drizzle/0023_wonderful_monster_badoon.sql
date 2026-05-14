CREATE TABLE "customer_time_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"time_pack_id" uuid NOT NULL,
	"snapshot_max_bookings_per_period" integer,
	"snapshot_max_bookings_per_day" integer,
	"snapshot_allowed_service_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot_allowed_branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bookings_used" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"price_paid_hellers" integer DEFAULT 0 NOT NULL,
	"sold_by" uuid,
	"note" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_pack_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_time_pack_id" uuid NOT NULL,
	"booking_id" uuid,
	"service_id" uuid,
	"usage_date" timestamp with time zone DEFAULT now() NOT NULL,
	"action" varchar(32) NOT NULL,
	"performed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"duration_days" integer NOT NULL,
	"max_bookings_per_period" integer,
	"max_bookings_per_day" integer,
	"allowed_service_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price_hellers" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "customer_time_packs" ADD CONSTRAINT "customer_time_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_time_packs" ADD CONSTRAINT "customer_time_packs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_time_packs" ADD CONSTRAINT "customer_time_packs_time_pack_id_time_packs_id_fk" FOREIGN KEY ("time_pack_id") REFERENCES "public"."time_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_time_packs" ADD CONSTRAINT "customer_time_packs_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_pack_uses" ADD CONSTRAINT "time_pack_uses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_pack_uses" ADD CONSTRAINT "time_pack_uses_customer_time_pack_id_customer_time_packs_id_fk" FOREIGN KEY ("customer_time_pack_id") REFERENCES "public"."customer_time_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_pack_uses" ADD CONSTRAINT "time_pack_uses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_pack_uses" ADD CONSTRAINT "time_pack_uses_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_pack_uses" ADD CONSTRAINT "time_pack_uses_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_packs" ADD CONSTRAINT "time_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_time_packs_tenant_idx" ON "customer_time_packs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customer_time_packs_customer_idx" ON "customer_time_packs" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_time_packs_validity_idx" ON "customer_time_packs" USING btree ("valid_until","status");--> statement-breakpoint
CREATE INDEX "time_pack_uses_tenant_idx" ON "time_pack_uses" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "time_pack_uses_pack_idx" ON "time_pack_uses" USING btree ("customer_time_pack_id","created_at");--> statement-breakpoint
CREATE INDEX "time_pack_uses_booking_idx" ON "time_pack_uses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "time_pack_uses_daily_idx" ON "time_pack_uses" USING btree ("customer_time_pack_id","usage_date");--> statement-breakpoint
CREATE INDEX "time_packs_tenant_idx" ON "time_packs" USING btree ("tenant_id","is_active");