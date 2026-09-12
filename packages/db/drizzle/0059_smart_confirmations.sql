-- ============================================================================
-- Sprint 10.13 — Smart vrstva: proaktivní potvrzení účasti.
-- Přidává na bookings sloupce pro výzvu k potvrzení (magic-link confirm/decline).
-- ============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_status varchar(16) NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_token uuid;
--> statement-breakpoint
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_requested_at timestamptz;
--> statement-breakpoint
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS confirmation_responded_at timestamptz;
--> statement-breakpoint
-- Token je unikátní, ale jen když je vyplněný (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS bookings_confirmation_token_uidx
  ON bookings (confirmation_token)
  WHERE confirmation_token IS NOT NULL;
