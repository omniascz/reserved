-- ============================================================================
-- Sprint 10.26 — kurzy (hloubka B): zápis jednou do série lekcí.
-- ============================================================================

CREATE TABLE IF NOT EXISTS courses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES branches(id) ON DELETE SET NULL,
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  name          varchar(200) NOT NULL,
  description   text,
  capacity      integer NOT NULL,
  price_hellers integer NOT NULL DEFAULT 0,
  status        varchar(16) NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS courses_tenant_idx ON courses (tenant_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS course_enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id      uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  customer_id    uuid,
  customer_name  varchar(200) NOT NULL,
  customer_email varchar(255) NOT NULL,
  status         varchar(16) NOT NULL DEFAULT 'enrolled',
  created_at     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS course_enrollments_course_idx ON course_enrollments (course_id);
--> statement-breakpoint
-- Jeden aktivní zápis na (kurz, e-mail).
CREATE UNIQUE INDEX IF NOT EXISTS course_enrollments_unique_active
  ON course_enrollments (course_id, lower(customer_email))
  WHERE status <> 'cancelled';
--> statement-breakpoint
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES courses(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS class_sessions_course_idx ON class_sessions (course_id);
--> statement-breakpoint
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY courses_tenant_isolation ON courses
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON courses TO app_user;
--> statement-breakpoint
ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE course_enrollments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY course_enrollments_tenant_isolation ON course_enrollments
  FOR ALL
  USING (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null())
  WITH CHECK (app.current_role_or_null() = 'service' OR tenant_id = app.current_tenant_id_or_null());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON course_enrollments TO app_user;
