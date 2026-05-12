CREATE TABLE "rule_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"event_payload" jsonb NOT NULL,
	"matched" boolean NOT NULL,
	"action_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"trigger_event" varchar(64) NOT NULL,
	"conditions" jsonb DEFAULT '{"type":"always"}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"trigger_count" integer DEFAULT 0 NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_executions" ADD CONSTRAINT "rule_executions_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_executions_tenant_idx" ON "rule_executions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "rule_executions_rule_idx" ON "rule_executions" USING btree ("rule_id","created_at");--> statement-breakpoint
CREATE INDEX "rules_tenant_idx" ON "rules" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rules_trigger_idx" ON "rules" USING btree ("tenant_id","trigger_event","is_enabled");