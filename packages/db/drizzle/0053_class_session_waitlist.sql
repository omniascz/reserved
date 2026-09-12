-- ============================================================================
-- Sprint 10.5 — Pořadník (waitlist) na plné skupinové lekce.
-- ============================================================================
-- Při plné lekci se klient zařadí; při uvolnění místa se první čekající
-- automaticky povýší na rezervaci. RLS + grants + index dle pořadí.
-- ============================================================================

CREATE TABLE class_session_waitlist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  customer_id     uuid,
  customer_name   varchar(200) NOT NULL,
  customer_email  varchar(255) NOT NULL,
  customer_phone  varchar(32),
  position        integer NOT NULL,
  status          varchar(32) NOT NULL DEFAULT 'waiting',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX class_session_waitlist_tenant_idx ON class_session_waitlist (tenant_id);
--> statement-breakpoint
CREATE INDEX class_session_waitlist_session_idx ON class_session_waitlist (session_id, position);
--> statement-breakpoint
-- Klient nesmí být v pořadníku jedné lekce dvakrát (jen aktivní 'waiting' záznamy).
CREATE UNIQUE INDEX class_session_waitlist_uniq
  ON class_session_waitlist (session_id, lower(customer_email))
  WHERE (status = 'waiting');
--> statement-breakpoint

ALTER TABLE class_session_waitlist ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE class_session_waitlist FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY class_session_waitlist_tenant_isolation ON class_session_waitlist
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

GRANT SELECT, INSERT, UPDATE, DELETE ON class_session_waitlist TO app_user;
