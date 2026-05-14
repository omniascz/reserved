-- ============================================================================
-- CHECK constraint pro customer_credit_packs vlastnika
-- (sprint 3.3 fáze B2).
--
-- Balicek musi mit prave jednoho vlastnika — bud customer NEBO corporate.
-- ============================================================================

ALTER TABLE customer_credit_packs
  ADD CONSTRAINT customer_credit_packs_owner_check
  CHECK (
    (customer_id IS NOT NULL AND corporate_account_id IS NULL)
    OR (customer_id IS NULL AND corporate_account_id IS NOT NULL)
  );
