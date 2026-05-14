ALTER TABLE "services" ADD COLUMN "is_online" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "default_online_meeting_url" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "online_meeting_url" text;