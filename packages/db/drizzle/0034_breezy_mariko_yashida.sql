CREATE TABLE "google_calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"google_email" varchar(255),
	"calendar_id" varchar(255) DEFAULT 'primary' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"consecutive_errors" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "google_calendar_connections_employee_unique" UNIQUE("employee_id","revoked_at")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"google_event_id" varchar(1024) NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_event_links_booking_unique" UNIQUE("connection_id","booking_id")
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_event_links" ADD CONSTRAINT "google_calendar_event_links_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_calendar_connections_tenant_idx" ON "google_calendar_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "google_calendar_connections_employee_idx" ON "google_calendar_connections" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "google_calendar_event_links_tenant_idx" ON "google_calendar_event_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "google_calendar_event_links_booking_idx" ON "google_calendar_event_links" USING btree ("booking_id");