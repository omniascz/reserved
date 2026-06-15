-- ============================================================================
-- Sprint 10.41 — sjednocený košík / objednávka: víc položek různého typu,
-- jedna platba.
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id    uuid,
  customer_name  varchar(200) NOT NULL,
  customer_email varchar(255),
  total_hellers  integer NOT NULL DEFAULT 0,
  currency       varchar(3) NOT NULL DEFAULT 'CZK',
  status         varchar(16) NOT NULL DEFAULT 'open',
  payment_id     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_tenant_idx ON orders (tenant_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind          varchar(16) NOT NULL DEFAULT 'other',
  ref_id        uuid,
  name          varchar(200) NOT NULL,
  price_hellers integer NOT NULL DEFAULT 0,
  quantity      integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
--> statement-breakpoint
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY orders_tenant_isolation ON orders
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO app_user;
--> statement-breakpoint
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY order_items_tenant_isolation ON order_items
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON order_items TO app_user;
