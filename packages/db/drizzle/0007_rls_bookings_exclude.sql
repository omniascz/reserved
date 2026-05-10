-- ============================================================================
-- RLS policies + EXCLUDE constraint pro double-booking prevenci.
-- ============================================================================
-- 1) RLS na bookings, slot_holds, availability_blocks, holidays
-- 2) GiST EXCLUDE constraint na bookings: stejný zaměstnanec nemůže mít
--    dvě překrývající se aktivní rezervace.
-- 3) GiST EXCLUDE constraint na slot_holds: stejný zaměstnanec nemůže mít
--    dva souběžné aktivní holds (pro stejné časové okno).
-- ============================================================================

-- Enable extension btree_gist (potřeba pro EXCLUDE s rovností + range)
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- ─── Bookings RLS ───────────────────────────────────────────────────────

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bookings_tenant_isolation ON bookings
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

-- ─── EXCLUDE constraint na bookings ─────────────────────────────────────
-- Prevenci dvojité rezervace: stejný (employee, čas) nesmí existovat
-- pro dvě aktivní rezervace (status NOT IN cancelled/no_show). Buffer
-- intervaly se počítají do "obsazenosti".

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(buffer_starts_at, buffer_ends_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));
--> statement-breakpoint

-- ─── Slot holds RLS + EXCLUDE ───────────────────────────────────────────

ALTER TABLE slot_holds ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE slot_holds FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY slot_holds_tenant_isolation ON slot_holds
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

-- Hold nesmí překrývat existující aktivní hold pro stejného zaměstnance.
-- NOW() nelze použít v index predicate (musí být IMMUTABLE), takže expiraci
-- vyhodnocuje aplikační vrstva: cleanup job mění expirované holds na
-- status='expired', tím se uvolní z constraint.
ALTER TABLE slot_holds
  ADD CONSTRAINT slot_holds_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(buffer_starts_at, buffer_ends_at, '[)') WITH &&
  )
  WHERE (status = 'active');
--> statement-breakpoint

-- ─── Availability blocks RLS ────────────────────────────────────────────

ALTER TABLE availability_blocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE availability_blocks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY availability_blocks_tenant_isolation ON availability_blocks
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

-- ─── Holidays RLS ───────────────────────────────────────────────────────

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE holidays FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY holidays_tenant_isolation ON holidays
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

-- ─── Grants pro app_user ────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON
  bookings,
  slot_holds,
  availability_blocks,
  holidays
TO app_user;
