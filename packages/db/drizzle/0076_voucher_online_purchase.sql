-- ============================================================================
-- Sprint 10.37 — online samoobslužný nákup voucheru. Voucher vznikne ve stavu
-- 'pending_payment' s vazbou na platbu; po úspěšné platbě se aktivuje + pošle.
-- ============================================================================

ALTER TABLE gift_vouchers
  ADD COLUMN IF NOT EXISTS payment_id uuid;
--> statement-breakpoint
ALTER TABLE gift_vouchers
  ADD COLUMN IF NOT EXISTS purchaser_email varchar(255);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gift_vouchers_payment_idx ON gift_vouchers (tenant_id, payment_id);
