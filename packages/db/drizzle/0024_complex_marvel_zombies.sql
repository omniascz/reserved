CREATE TABLE "corporate_account_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"corporate_account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"added_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "corporate_account_members_unique_active" UNIQUE("corporate_account_id","customer_id","removed_at")
);
--> statement-breakpoint
CREATE TABLE "corporate_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"vat_id" varchar(32),
	"company_reg_id" varchar(32),
	"billing_address_line1" varchar(200),
	"billing_address_line2" varchar(200),
	"billing_city" varchar(100),
	"billing_zip" varchar(20),
	"billing_country" varchar(2) DEFAULT 'CZ',
	"contact_email" varchar(255),
	"contact_phone" varchar(40),
	"contact_person_name" varchar(200),
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "corporate_account_members" ADD CONSTRAINT "corporate_account_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_members" ADD CONSTRAINT "corporate_account_members_corporate_account_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_account_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_members" ADD CONSTRAINT "corporate_account_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_account_members" ADD CONSTRAINT "corporate_account_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_accounts" ADD CONSTRAINT "corporate_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "corporate_account_members_tenant_idx" ON "corporate_account_members" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "corporate_account_members_corporate_idx" ON "corporate_account_members" USING btree ("corporate_account_id","removed_at");--> statement-breakpoint
CREATE INDEX "corporate_account_members_customer_idx" ON "corporate_account_members" USING btree ("customer_id","removed_at");--> statement-breakpoint
CREATE INDEX "corporate_accounts_tenant_idx" ON "corporate_accounts" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "corporate_accounts_name_idx" ON "corporate_accounts" USING btree ("tenant_id","company_name");