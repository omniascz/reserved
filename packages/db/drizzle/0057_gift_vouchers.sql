-- ============================================================================
-- Sprint 10.9 — Dárkové poukazy (kód + hodnota, částečné uplatnění).
-- ============================================================================

CREATE TABLE gift_vouchers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                     varchar(32) NOT NULL,
  initial_value_hellers    integer NOT NULL,
  remaining_value_hellers  integer NOT NULL,
  currency                 varchar(3) NOT NULL DEFAULT 'CZK',
  status                   varchar(32) NOT NULL DEFAULT 'active',
  recipient_name           varchar(200),
  recipient_email          varchar(255),
  valid_until              timestamptz,
  note                     text,
  created_by               varchar(64),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_vouchers_remaining_nonneg CHECK (remaining_value_hellers >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX gift_vouchers_code_uniq ON gift_vouchers (tenant_id, code);
--> statement-breakpoint
CREATE INDEX gift_vouchers_tenant_idx ON gift_vouchers (tenant_id, status);
--> statement-breakpoint

CREATE TABLE voucher_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  voucher_id     uuid NOT NULL REFERENCES gift_vouchers(id) ON DELETE CASCADE,
  amount_hellers integer NOT NULL,
  booking_id     uuid,
  note           text,
  created_by     varchar(64),
  created_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX voucher_redemptions_voucher_idx ON voucher_redemptions (voucher_id);
--> statement-breakpoint
CREATE INDEX voucher_redemptions_tenant_idx ON voucher_redemptions (tenant_id);
--> statement-breakpoint

ALTER TABLE gift_vouchers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE gift_vouchers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY gift_vouchers_tenant_isolation ON gift_vouchers
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint

ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE voucher_redemptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY voucher_redemptions_tenant_isolation ON voucher_redemptions
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON gift_vouchers TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON voucher_redemptions TO app_user;
