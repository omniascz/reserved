-- ============================================================================
-- Doplněk 10.16 — on-demand video / knihovna obsahu (nahrané lekce).
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title            varchar(200) NOT NULL,
  description      text,
  video_url        text NOT NULL,
  thumbnail_url    text,
  category         varchar(100),
  access_level     varchar(16) NOT NULL DEFAULT 'members',
  duration_seconds integer,
  is_published     boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_items_tenant_idx ON content_items (tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_items_published_idx ON content_items (tenant_id, is_published);
--> statement-breakpoint
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE content_items FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY content_items_tenant_isolation ON content_items
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
GRANT SELECT, INSERT, UPDATE, DELETE ON content_items TO app_user;
