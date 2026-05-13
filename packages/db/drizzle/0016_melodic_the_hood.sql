CREATE TABLE "credit_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"mode" varchar(20) DEFAULT 'per_visit' NOT NULL,
	"total_credits" integer NOT NULL,
	"validity_days" integer,
	"price_hellers" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"allowed_service_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"credit_costs_by_service" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_credit_pack_id" uuid NOT NULL,
	"booking_id" uuid,
	"credits_deducted" integer NOT NULL,
	"action" varchar(32) NOT NULL,
	"performed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_credit_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"credit_pack_id" uuid NOT NULL,
	"credits_remaining" integer NOT NULL,
	"credits_at_purchase" integer NOT NULL,
	"snapshot_mode" varchar(20) NOT NULL,
	"snapshot_allowed_service_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot_allowed_branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot_credit_costs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"price_paid_hellers" integer DEFAULT 0 NOT NULL,
	"sold_by" uuid,
	"note" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_packs" ADD CONSTRAINT "credit_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_customer_credit_pack_id_customer_credit_packs_id_fk" FOREIGN KEY ("customer_credit_pack_id") REFERENCES "public"."customer_credit_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_uses" ADD CONSTRAINT "credit_uses_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_packs" ADD CONSTRAINT "customer_credit_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_packs" ADD CONSTRAINT "customer_credit_packs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_packs" ADD CONSTRAINT "customer_credit_packs_credit_pack_id_credit_packs_id_fk" FOREIGN KEY ("credit_pack_id") REFERENCES "public"."credit_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_packs" ADD CONSTRAINT "customer_credit_packs_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_packs_tenant_idx" ON "credit_packs" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "credit_uses_tenant_idx" ON "credit_uses" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_uses_pack_idx" ON "credit_uses" USING btree ("customer_credit_pack_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_uses_booking_idx" ON "credit_uses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "customer_credit_packs_tenant_idx" ON "customer_credit_packs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customer_credit_packs_customer_idx" ON "customer_credit_packs" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_credit_packs_validity_idx" ON "customer_credit_packs" USING btree ("valid_until","status");