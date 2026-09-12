-- ============================================================================
-- Sprint 10.40 — náhrady (make-up credits): systémové řešení zameškaných lekcí.
-- ============================================================================

CREATE TABLE IF NOT EXISTS makeup_credits (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id      uuid,
  customer_name    varchar(200) NOT NULL,
  customer_email   varchar(255) NOT NULL,
  reason           varchar(24) NOT NULL DEFAULT 'admin_granted',
  origin_booking_id uuid,
  status           varchar(16) NOT NULL DEFAULT 'available',
  valid_until      timestamptz,
  used_booking_id  uuid,
  used_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS makeup_credits_tenant_idx ON makeup_credits (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS makeup_credits_customer_idx ON makeup_credits (tenant_id, customer_email, status);
--> statement-breakpoint
ALTER TABLE makeup_credits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE makeup_credits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY makeup_credits_tenant_isolation ON makeup_credits
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON makeup_credits TO app_user;
