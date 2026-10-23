CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"account_email" varchar(255),
	"calendar_ref" text,
	"calendar_name" varchar(255),
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"inbound_sync_enabled" boolean DEFAULT true NOT NULL,
	"outbound_enabled" boolean DEFAULT true NOT NULL,
	"sync_cursor" text,
	"needs_sync" boolean DEFAULT false NOT NULL,
	"subscription_id" varchar(255),
	"subscription_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_inbound_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "calendar_event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"external_event_id" varchar(1024) NOT NULL,
	"external_url" text,
	"external_etag" varchar(255),
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_event_links_booking_unique" UNIQUE("connection_id","booking_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_event_id" varchar(1024) NOT NULL,
	"block_id" uuid NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_inbound_events_unique" UNIQUE("connection_id","external_event_id")
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "sync_token" text;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "needs_sync" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "push_channel_id" varchar(64);--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "push_resource_id" varchar(255);--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "push_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_inbound_events" ADD CONSTRAINT "calendar_inbound_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_inbound_events" ADD CONSTRAINT "calendar_inbound_events_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_inbound_events" ADD CONSTRAINT "calendar_inbound_events_block_id_availability_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."availability_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_connections_tenant_idx" ON "calendar_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "calendar_connections_employee_idx" ON "calendar_connections" USING btree ("employee_id","provider","revoked_at");--> statement-breakpoint
CREATE INDEX "calendar_connections_subscription_idx" ON "calendar_connections" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "calendar_event_links_tenant_idx" ON "calendar_event_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "calendar_event_links_booking_idx" ON "calendar_event_links" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "calendar_inbound_events_tenant_idx" ON "calendar_inbound_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "calendar_inbound_events_block_idx" ON "calendar_inbound_events" USING btree ("block_id");--> statement-breakpoint

-- ============================================================================
-- RUČNĚ DOPLNĚNO — drizzle tohle NEGENERUJE (viz CLAUDE.md „Schéma a migrace").
-- RLS: izolace tenantů jako u ostatních tabulek + granty pro app_user.
-- ============================================================================

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_connections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_connections_tenant_isolation ON calendar_connections
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

ALTER TABLE calendar_event_links ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_event_links FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_event_links_tenant_isolation ON calendar_event_links
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

ALTER TABLE calendar_inbound_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE calendar_inbound_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY calendar_inbound_events_tenant_isolation ON calendar_inbound_events
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

GRANT SELECT, INSERT, UPDATE, DELETE ON
  calendar_connections,
  calendar_event_links,
  calendar_inbound_events
TO app_user;
