-- ============================================================================
-- Sprint 10.33 — tvrdé podmínky lekce (věk, prerekvizita) + spot booking
-- (výběr konkrétního místa/podložky/kola v sále).
-- ============================================================================

ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS spot_count integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS min_age integer;
--> statement-breakpoint
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS max_age integer;
--> statement-breakpoint
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS prerequisite_service_id uuid REFERENCES services(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS spot_label varchar(16);
--> statement-breakpoint
-- Jedno místo (spot) v lekci může mít jen jeden aktivní účastník.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_session_spot_uniq
  ON bookings (session_id, spot_label)
  WHERE session_id IS NOT NULL
    AND spot_label IS NOT NULL
    AND status NOT IN ('cancelled', 'no_show');
