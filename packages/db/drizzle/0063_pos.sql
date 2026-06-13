-- ============================================================================
-- Doplněk 10.19 — lehký POS (pultový prodej na recepci).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          varchar(200) NOT NULL,
  sku           varchar(64),
  price_hellers integer NOT NULL,
  vat_rate      integer NOT NULL DEFAULT 21,
  tracks_stock  boolean NOT NULL DEFAULT true,
  stock         integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pos_products_tenant_idx ON pos_products (tenant_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS pos_sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id      uuid REFERENCES branches(id) ON DELETE SET NULL,
  customer_id    uuid,
  receipt_number varchar(32) NOT NULL,
  total_hellers  integer NOT NULL,
  currency       varchar(3) NOT NULL DEFAULT 'CZK',
  payment_method varchar(16) NOT NULL,
  note           text,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pos_sales_tenant_idx ON pos_sales (tenant_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pos_sales_receipt_idx ON pos_sales (tenant_id, receipt_number);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS pos_sale_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sale_id            uuid NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  item_type          varchar(16) NOT NULL,
  ref_id             uuid,
  name               varchar(200) NOT NULL,
  quantity           integer NOT NULL DEFAULT 1,
  unit_price_hellers integer NOT NULL,
  vat_rate           integer NOT NULL DEFAULT 21,
  line_total_hellers integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pos_sale_items_sale_idx ON pos_sale_items (sale_id);
--> statement-breakpoint

-- RLS pro všechny tři tabulky.
ALTER TABLE pos_products ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pos_products FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pos_products_tenant_isolation ON pos_products
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_products TO app_user;
--> statement-breakpoint

ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pos_sales FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pos_sales_tenant_isolation ON pos_sales
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_sales TO app_user;
--> statement-breakpoint

ALTER TABLE pos_sale_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pos_sale_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pos_sale_items_tenant_isolation ON pos_sale_items
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON pos_sale_items TO app_user;
