-- ============================================================================
-- Sprint 10.8 — Věrnostní body (ledger). Zůstatek = SUM(points) na klienta.
-- ============================================================================

CREATE TABLE loyalty_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  points      integer NOT NULL,
  type        varchar(32) NOT NULL,
  booking_id  uuid,
  note        text,
  created_by  varchar(64),
  created_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX loyalty_transactions_tenant_idx ON loyalty_transactions (tenant_id);
--> statement-breakpoint
CREATE INDEX loyalty_transactions_customer_idx ON loyalty_transactions (tenant_id, customer_id);
--> statement-breakpoint
-- Za jednu rezervaci se body připíšou jen jednou (idempotence).
CREATE UNIQUE INDEX loyalty_transactions_earn_booking_uniq
  ON loyalty_transactions (booking_id)
  WHERE (type = 'earn_booking' AND booking_id IS NOT NULL);
--> statement-breakpoint

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE loyalty_transactions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY loyalty_transactions_tenant_isolation ON loyalty_transactions
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

GRANT SELECT, INSERT, UPDATE, DELETE ON loyalty_transactions TO app_user;
