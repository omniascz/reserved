-- ============================================================================
-- Sprint 10.0 — Skupinové lekce / kapacita >1.
-- ============================================================================
-- 1) class_sessions = vypsaná instance skupinové lekce (jeden trenér, kapacita N).
-- 2) bookings.session_id = nullable FK; NULL = klasická 1:1 rezervace.
-- 3) Partial EXCLUDE: 1:1 ochrana (bookings_no_overlap) platí jen pro session_id IS NULL.
-- 4) UNIQUE(session_id, customer_id) = klient se do lekce nepřihlásí dvakrát.
-- 5) RLS + grants pro app_user.
-- ============================================================================

CREATE TABLE class_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id         uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  service_id        uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  employee_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  buffer_starts_at  timestamptz NOT NULL,
  buffer_ends_at    timestamptz NOT NULL,
  capacity          integer NOT NULL,
  booked_count      integer NOT NULL DEFAULT 0,
  status            varchar(32) NOT NULL DEFAULT 'open',
  cancelled_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_sessions_capacity_positive CHECK (capacity >= 1),
  CONSTRAINT class_sessions_booked_count_range CHECK (booked_count >= 0 AND booked_count <= capacity)
);
--> statement-breakpoint
CREATE INDEX class_sessions_tenant_idx ON class_sessions (tenant_id);
--> statement-breakpoint
CREATE INDEX class_sessions_lookup_idx ON class_sessions (tenant_id, service_id, branch_id, starts_at) WHERE status = 'open';
--> statement-breakpoint
CREATE INDEX class_sessions_employee_idx ON class_sessions (employee_id, starts_at);
--> statement-breakpoint

-- ─── bookings.session_id ────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN session_id uuid REFERENCES class_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX bookings_session_idx ON bookings (session_id);
--> statement-breakpoint

-- Klient se nepřihlásí do stejné lekce dvakrát (počítají se jen aktivní rezervace).
CREATE UNIQUE INDEX bookings_session_customer_uniq
  ON bookings (session_id, customer_id)
  WHERE (session_id IS NOT NULL AND customer_id IS NOT NULL AND status NOT IN ('cancelled', 'no_show'));
--> statement-breakpoint

-- ─── Partial EXCLUDE: 1:1 ochrana jen pro NEskupinové rezervace ──────────
-- Před 10.0 platilo pro všechny rezervace „1 zaměstnanec = 1 slot". Skupinové
-- lekce to ale potřebují obejít (víc účastníků u jednoho trenéra v jednom čase).
-- Omezíme constraint na session_id IS NULL; kapacitu skupin hlídá class_sessions.

ALTER TABLE bookings DROP CONSTRAINT bookings_no_overlap;
--> statement-breakpoint
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(buffer_starts_at, buffer_ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show') AND session_id IS NULL);
--> statement-breakpoint

-- ─── RLS na class_sessions ──────────────────────────────────────────────

ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY class_sessions_tenant_isolation ON class_sessions
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

GRANT SELECT, INSERT, UPDATE, DELETE ON class_sessions TO app_user;
