ALTER TABLE "customer_credit_packs" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_credit_packs" ADD COLUMN "corporate_account_id" uuid;--> statement-breakpoint
ALTER TABLE "customer_credit_packs" ADD CONSTRAINT "customer_credit_packs_corporate_account_id_corporate_accounts_id_fk" FOREIGN KEY ("corporate_account_id") REFERENCES "public"."corporate_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_credit_packs_corporate_idx" ON "customer_credit_packs" USING btree ("corporate_account_id","status");