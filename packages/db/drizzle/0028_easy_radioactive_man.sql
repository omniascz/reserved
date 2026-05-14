ALTER TABLE "customer_bundle_packs" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_time_packs" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_bundle_packs" ADD COLUMN "corporate_account_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_time_packs" ADD COLUMN "corporate_account_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_bundle_packs" ADD CONSTRAINT "customer_bundle_packs_corporate_account_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_account_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_time_packs" ADD CONSTRAINT "customer_time_packs_corporate_account_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_account_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_bundle_packs_corporate_idx" ON "customer_bundle_packs" USING btree ("corporate_account_id","status");--> statement-breakpoint
CREATE INDEX "customer_time_packs_corporate_idx" ON "customer_time_packs" USING btree ("corporate_account_id","status");