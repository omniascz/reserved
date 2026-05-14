CREATE TABLE "bundle_item_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_bundle_pack_id" uuid NOT NULL,
	"booking_id" uuid,
	"service_id" uuid NOT NULL,
	"quantity_deducted" integer NOT NULL,
	"action" varchar(32) NOT NULL,
	"performed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validity_days" integer,
	"price_hellers" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"allowed_branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"same_visit_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_bundle_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"bundle_pack_id" uuid NOT NULL,
	"items_remaining" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot_allowed_branch_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"snapshot_same_visit_required" boolean DEFAULT false NOT NULL,
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
ALTER TABLE "bundle_item_uses" ADD CONSTRAINT "bundle_item_uses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_item_uses" ADD CONSTRAINT "bundle_item_uses_customer_bundle_pack_id_customer_bundle_packs_id_fk" FOREIGN KEY ("customer_bundle_pack_id") REFERENCES "public"."customer_bundle_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_item_uses" ADD CONSTRAINT "bundle_item_uses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_item_uses" ADD CONSTRAINT "bundle_item_uses_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_item_uses" ADD CONSTRAINT "bundle_item_uses_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_packs" ADD CONSTRAINT "bundle_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_bundle_packs" ADD CONSTRAINT "customer_bundle_packs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_bundle_packs" ADD CONSTRAINT "customer_bundle_packs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_bundle_packs" ADD CONSTRAINT "customer_bundle_packs_bundle_pack_id_bundle_packs_id_fk" FOREIGN KEY ("bundle_pack_id") REFERENCES "public"."bundle_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_bundle_packs" ADD CONSTRAINT "customer_bundle_packs_sold_by_users_id_fk" FOREIGN KEY ("sold_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bundle_item_uses_tenant_idx" ON "bundle_item_uses" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "bundle_item_uses_pack_idx" ON "bundle_item_uses" USING btree ("customer_bundle_pack_id","created_at");--> statement-breakpoint
CREATE INDEX "bundle_item_uses_booking_idx" ON "bundle_item_uses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "bundle_packs_tenant_idx" ON "bundle_packs" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "customer_bundle_packs_tenant_idx" ON "customer_bundle_packs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customer_bundle_packs_customer_idx" ON "customer_bundle_packs" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "customer_bundle_packs_validity_idx" ON "customer_bundle_packs" USING btree ("valid_until","status");