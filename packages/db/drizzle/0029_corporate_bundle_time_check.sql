-- ============================================================================
-- CHECK constraints pro customer_bundle_packs + customer_time_packs vlastnika
-- (sprint 3.3 fáze B2-extended).
--
-- Stejny pattern jako customer_credit_packs: bud customer NEBO corporate, ne oba.
-- ============================================================================

ALTER TABLE customer_bundle_packs
  ADD CONSTRAINT customer_bundle_packs_owner_check
  CHECK (
    (customer_id IS NOT NULL AND corporate_account_id IS NULL)
    OR (customer_id IS NULL AND corporate_account_id IS NOT NULL)
  );
--> statement-breakpoint

ALTER TABLE customer_time_packs
  ADD CONSTRAINT customer_time_packs_owner_check
  CHECK (
    (customer_id IS NOT NULL AND corporate_account_id IS NULL)
    OR (customer_id IS NULL AND corporate_account_id IS NOT NULL)
  );
