-- ============================================================================
-- Sprint 10.10 — Intake / consent formuláře (dotazníky před návštěvou).
-- ============================================================================

CREATE TABLE intake_forms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  description text,
  service_id  uuid REFERENCES services(id) ON DELETE SET NULL,
  fields      jsonb NOT NULL DEFAULT '[]',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
--> statement-breakpoint
CREATE INDEX intake_forms_tenant_idx ON intake_forms (tenant_id);
--> statement-breakpoint
CREATE INDEX intake_forms_service_idx ON intake_forms (tenant_id, service_id);
--> statement-breakpoint

CREATE TABLE intake_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  form_id        uuid NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,
  booking_id     uuid,
  customer_id    uuid,
  customer_email varchar(255) NOT NULL,
  answers        jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX intake_submissions_tenant_idx ON intake_submissions (tenant_id);
--> statement-breakpoint
CREATE INDEX intake_submissions_form_idx ON intake_submissions (form_id, created_at);
--> statement-breakpoint

ALTER TABLE intake_forms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE intake_forms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY intake_forms_tenant_isolation ON intake_forms
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint

ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE intake_submissions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY intake_submissions_tenant_isolation ON intake_submissions
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON intake_forms TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON intake_submissions TO app_user;
