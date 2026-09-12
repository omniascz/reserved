-- ============================================================================
-- Sprint 10.1 — Archetypy služeb.
-- services.archetype = produktový typ služby (osobni_1_1 | skupinova_lekce |
-- volny_trener | ems_pristrojovy | hybridni_blok). NULL = bez archetypu.
-- ============================================================================

ALTER TABLE services ADD COLUMN archetype varchar(32);
