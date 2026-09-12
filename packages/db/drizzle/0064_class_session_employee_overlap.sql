-- ============================================================================
-- Sprint 10.20 — ochrana proti překryvu skupinových lekcí na TRENÉROVI.
-- Trenér nemůže vést dvě časově se překrývající lekce. Platí jen pro lekce
-- BEZ přístroje (resource_id IS NULL) — per-přístrojový EMS/kurty model
-- (více strojů paralelně v pobočce) zůstává beze změny (chrání ho
-- class_sessions_resource_no_overlap). Pobočková úroveň = aplikační přepínač.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_employee_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(buffer_starts_at, buffer_ends_at, '[)') WITH &&
  )
  WHERE (employee_id IS NOT NULL AND resource_id IS NULL AND status = 'open');
