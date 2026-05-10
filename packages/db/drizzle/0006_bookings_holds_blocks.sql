CREATE TABLE "availability_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"employee_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"block_type" varchar(32) DEFAULT 'other' NOT NULL,
	"title" varchar(200),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"employee_id" uuid,
	"customer_user_id" uuid,
	"customer_name" varchar(200) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"customer_phone" varchar(32),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"buffer_starts_at" timestamp with time zone NOT NULL,
	"buffer_ends_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"price_paid_hellers" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'CZK' NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"reference_code" varchar(16) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"date" timestamp NOT NULL,
	"name" varchar(200) NOT NULL,
	"source" varchar(32) DEFAULT 'custom' NOT NULL,
	"custom_start_time" varchar(5),
	"custom_end_time" varchar(5),
	"is_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"buffer_starts_at" timestamp with time zone NOT NULL,
	"buffer_ends_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"session_token" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"converted_to_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_holds" ADD CONSTRAINT "slot_holds_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_blocks_tenant_idx" ON "availability_blocks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "availability_blocks_range_idx" ON "availability_blocks" USING btree ("tenant_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "availability_blocks_employee_idx" ON "availability_blocks" USING btree ("employee_id","starts_at");--> statement-breakpoint
CREATE INDEX "availability_blocks_branch_idx" ON "availability_blocks" USING btree ("branch_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_tenant_idx" ON "bookings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "bookings_employee_range_idx" ON "bookings" USING btree ("employee_id","buffer_starts_at","buffer_ends_at");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("tenant_id","customer_user_id");--> statement-breakpoint
CREATE INDEX "bookings_ref_code_idx" ON "bookings" USING btree ("reference_code");--> statement-breakpoint
CREATE INDEX "bookings_branch_idx" ON "bookings" USING btree ("branch_id","starts_at");--> statement-breakpoint
CREATE INDEX "holidays_tenant_idx" ON "holidays" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "holidays_branch_idx" ON "holidays" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "slot_holds_tenant_idx" ON "slot_holds" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "slot_holds_employee_range_idx" ON "slot_holds" USING btree ("employee_id","buffer_starts_at","buffer_ends_at");--> statement-breakpoint
CREATE INDEX "slot_holds_expiry_idx" ON "slot_holds" USING btree ("expires_at","status");--> statement-breakpoint
CREATE INDEX "slot_holds_token_idx" ON "slot_holds" USING btree ("session_token");