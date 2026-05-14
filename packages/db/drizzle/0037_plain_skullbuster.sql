CREATE TABLE "google_calendar_inbound_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"google_event_id" varchar(1024) NOT NULL,
	"block_id" uuid NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_inbound_events_unique" UNIQUE("connection_id","google_event_id")
);
--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "inbound_sync_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "google_calendar_connections" ADD COLUMN "last_inbound_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "google_calendar_inbound_events" ADD CONSTRAINT "google_calendar_inbound_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_inbound_events" ADD CONSTRAINT "google_calendar_inbound_events_connection_id_google_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_calendar_inbound_events_tenant_idx" ON "google_calendar_inbound_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "google_calendar_inbound_events_connection_idx" ON "google_calendar_inbound_events" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "google_calendar_inbound_events_block_idx" ON "google_calendar_inbound_events" USING btree ("block_id");