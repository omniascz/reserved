CREATE TABLE "customer_payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"external_customer_id" varchar(255) NOT NULL,
	"external_payment_method_id" varchar(255) NOT NULL,
	"brand" varchar(32),
	"last4" varchar(4),
	"exp_month" integer,
	"exp_year" integer,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "customer_payment_methods_external_uniq" UNIQUE("tenant_id","provider","external_payment_method_id")
);
--> statement-breakpoint
ALTER TABLE "customer_payment_methods" ADD CONSTRAINT "customer_payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_methods" ADD CONSTRAINT "customer_payment_methods_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_payment_methods_customer_idx" ON "customer_payment_methods" USING btree ("tenant_id","customer_id","status");--> statement-breakpoint

-- ============================================================================
-- RUČNĚ DOPLNĚNO — drizzle tohle NEGENERUJE (viz CLAUDE.md „Schéma a migrace").
-- RLS: izolace tenantů jako u ostatních tabulek + granty pro app_user.
-- ============================================================================

ALTER TABLE customer_payment_methods ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE customer_payment_methods FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_payment_methods_tenant_isolation ON customer_payment_methods
  FOR ALL
  USING (
    app.current_role_or_null() = 'service'
    OR tenant_id = app.current_tenant_id_or_null()
  )
  WITH CHECK (
    app.current_role_or_null() = 'service'
    OR tenant_id = app.current_tenant_id_or_null()
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON customer_payment_methods TO app_user;
