-- ============================================================================
-- Sprint 10.7 — Marketingové kampaně + win-back.
-- ============================================================================

CREATE TABLE marketing_campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  channel     varchar(16) NOT NULL,
  subject     varchar(500),
  body        text NOT NULL,
  audience    jsonb NOT NULL DEFAULT '{}',
  status      varchar(32) NOT NULL DEFAULT 'draft',
  sent_count  integer NOT NULL DEFAULT 0,
  created_by  uuid,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX marketing_campaigns_tenant_idx ON marketing_campaigns (tenant_id, status);
--> statement-breakpoint

ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE marketing_campaigns FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY marketing_campaigns_tenant_isolation ON marketing_campaigns
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

GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_campaigns TO app_user;
