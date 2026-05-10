# 13e — Databázové schema: Reviews, Notifications, Audit Log, RLS, Triggers & Indexes

---

## BLOK 13 — Reviews & Ratings

```sql
-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  booking_id            UUID NOT NULL REFERENCES bookings(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  employee_id           UUID REFERENCES employees(id),
  service_id            UUID REFERENCES services(id),
  branch_id             UUID REFERENCES branches(id),
  
  -- Hodnocení
  rating_overall        SMALLINT NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_service        SMALLINT CHECK (rating_service BETWEEN 1 AND 5),
  rating_employee       SMALLINT CHECK (rating_employee BETWEEN 1 AND 5),
  rating_location       SMALLINT CHECK (rating_location BETWEEN 1 AND 5),
  rating_value          SMALLINT CHECK (rating_value BETWEEN 1 AND 5),
  
  -- Text
  title                 VARCHAR(255),
  body                  TEXT,
  
  -- Stav
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' = čeká na moderaci, 'published', 'hidden', 'flagged', 'deleted'
  
  -- Odpověď provozovny
  response_body         TEXT,
  response_at           TIMESTAMPTZ,
  response_by           UUID,
  
  -- Zdroj
  source                VARCHAR(20) NOT NULL DEFAULT 'internal',
  -- 'internal', 'google', 'facebook'
  external_review_id    VARCHAR(255),   -- ID na Google/Facebook
  
  -- Moderace
  moderated_by          UUID,
  moderated_at          TIMESTAMPTZ,
  moderation_notes      TEXT,
  
  -- Datum publikace
  published_at          TIMESTAMPTZ,
  
  -- Edit window
  can_edit_until        TIMESTAMPTZ,   -- zákazník může editovat 30 dní
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_tenant ON reviews(tenant_id, status) WHERE status = 'published';
CREATE INDEX idx_reviews_employee ON reviews(employee_id) WHERE status = 'published';
CREATE INDEX idx_reviews_service ON reviews(service_id) WHERE status = 'published';
CREATE INDEX idx_reviews_customer ON reviews(customer_id);
```

---

## BLOK 14 — Notifications & Communication

```sql
-- ============================================================
-- NOTIFICATION TEMPLATES
-- ============================================================
CREATE TABLE notification_templates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  
  -- Identifikace
  system_key            VARCHAR(100),  -- 'booking_confirmed', 'reminder_24h', atd.
  -- NULL = custom šablona
  name                  VARCHAR(255) NOT NULL,
  
  -- Kanál
  channel               VARCHAR(20) NOT NULL,
  -- 'email', 'sms', 'push', 'whatsapp', 'in_app'
  
  -- Obsah
  subject               TEXT,          -- pro email
  body_html             TEXT,          -- pro email
  body_text             TEXT,          -- pro sms / plain text
  
  -- Proměnné použité v šabloně (dokumentace)
  available_variables   VARCHAR(50)[],
  -- ['customer_name', 'booking_date', 'service_name', 'employee_name', ...]
  
  -- Jazyk
  locale                locale_code NOT NULL DEFAULT 'cs_CZ',
  
  is_system             BOOLEAN NOT NULL DEFAULT FALSE,  -- systémové nelze smazat
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(tenant_id, system_key, channel, locale)
);

-- Systémové klíče šablon:
-- booking_confirmed, booking_pending, booking_cancelled_by_customer,
-- booking_cancelled_by_business, booking_rescheduled, booking_reminder_24h,
-- booking_reminder_2h, booking_no_show, booking_completed,
-- review_request, series_created, series_paused, series_resumed,
-- series_expiring_soon, series_terminated, series_gifted,
-- package_purchased, package_expiring, package_exhausted,
-- payment_confirmed, payment_failed, payment_refunded,
-- approval_request_received, approval_request_approved, approval_request_rejected,
-- welcome, password_reset, login_otp

-- ============================================================
-- NOTIFICATION QUEUE (fronta odeslaných / čekajících notifikací)
-- ============================================================
CREATE TABLE notification_queue (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  
  -- Příjemce
  recipient_type        VARCHAR(20) NOT NULL,  -- 'customer', 'employee', 'admin'
  recipient_id          UUID,
  recipient_email       VARCHAR(255),
  recipient_phone       VARCHAR(50),
  
  -- Obsah
  channel               VARCHAR(20) NOT NULL,
  template_id           UUID REFERENCES notification_templates(id),
  template_key          VARCHAR(100),
  subject               TEXT,
  body                  TEXT,
  
  -- Kontext
  entity_type           VARCHAR(30),   -- 'booking', 'series', 'package'
  entity_id             UUID,
  variables             JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Stav odeslání
  status                VARCHAR(20) NOT NULL DEFAULT 'queued',
  -- 'queued', 'processing', 'sent', 'delivered', 'failed', 'cancelled'
  
  send_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- kdy odeslat
  sent_at               TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  failure_reason        TEXT,
  
  -- Retry
  attempts              SMALLINT NOT NULL DEFAULT 0,
  max_attempts          SMALLINT NOT NULL DEFAULT 3,
  next_retry_at         TIMESTAMPTZ,
  
  -- Provider response
  provider_message_id   VARCHAR(255),
  provider              VARCHAR(30),   -- 'postmark', 'twilio', 'sendgrid'
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nq_pending ON notification_queue(send_at, tenant_id)
  WHERE status = 'queued' AND send_at <= NOW();
CREATE INDEX idx_nq_retry ON notification_queue(next_retry_at)
  WHERE status = 'failed' AND attempts < max_attempts;
CREATE INDEX idx_nq_entity ON notification_queue(entity_id, entity_type);

-- ============================================================
-- NOTIFICATION LOG (archiv odeslaných notifikací)
-- ============================================================
CREATE TABLE notification_log (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id              UUID REFERENCES notification_queue(id),
  tenant_id             UUID NOT NULL,
  
  channel               VARCHAR(20) NOT NULL,
  recipient_type        VARCHAR(20) NOT NULL,
  recipient_id          UUID,
  entity_type           VARCHAR(30),
  entity_id             UUID,
  template_key          VARCHAR(100),
  
  status                VARCHAR(20) NOT NULL,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_message_id   VARCHAR(255),
  
  -- Tracking
  opened_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,
  unsubscribed_at       TIMESTAMPTZ
);

CREATE INDEX idx_nl_entity ON notification_log(entity_id, entity_type, sent_at DESC);
CREATE INDEX idx_nl_recipient ON notification_log(recipient_id, sent_at DESC);
```

---

## BLOK 15 — Audit Log (neměnný)

```sql
-- ============================================================
-- AUDIT LOG
-- Append-only tabulka — nikdy se nesmaže, nikdy se neaktualizuje
-- ============================================================
CREATE TABLE audit_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  
  -- Kdo
  actor_type            VARCHAR(20) NOT NULL,
  -- 'user', 'customer', 'system', 'api_key', 'webhook'
  actor_id              UUID,
  actor_email           VARCHAR(255),
  actor_ip              INET,
  actor_user_agent      TEXT,
  
  -- Co
  action                VARCHAR(100) NOT NULL,
  -- Formát: 'entity.operation'
  -- Příklady: 'booking.created', 'booking.cancelled', 'series.paused',
  --           'rule.updated', 'customer.blocked', 'employee.schedule_changed'
  
  -- Na čem
  entity_type           VARCHAR(50) NOT NULL,
  entity_id             UUID NOT NULL,
  
  -- Stav před a po
  before_state          JSONB,    -- NULL pokud create
  after_state           JSONB,    -- NULL pokud delete
  
  -- Diff (vypočítaný)
  changed_fields        TEXT[],   -- seznam změněných polí
  
  -- Kontext
  request_id            UUID,     -- pro korelaci více logů jednoho requestu
  session_id            UUID,
  
  -- Výsledek
  result                VARCHAR(20) NOT NULL DEFAULT 'success',
  -- 'success', 'denied', 'error'
  error_message         TEXT,
  
  -- Čas (s nanosecond přesností)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log je append-only → žádné UPDATE/DELETE
-- Revoke UPDATE, DELETE on audit_logs FROM app_user;

CREATE INDEX idx_al_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_al_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_al_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_al_action ON audit_logs(action, tenant_id);

-- Partitioning pro výkon (dle měsíce)
-- V produkci: audit_logs PARTITION BY RANGE (created_at)
```

---

## BLOK 16 — Row Level Security (RLS)

```sql
-- ============================================================
-- RLS POLICIES
-- Zajišťují, že každý tenant vidí jen svá data
-- ============================================================

-- Povolení RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- ... a všechny ostatní tabulky s tenant_id

-- Funkce pro získání tenant_id z JWT
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Funkce pro získání user_id z JWT
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Funkce pro získání role z JWT
CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.user_role', TRUE), '');
$$ LANGUAGE SQL STABLE;

-- RLS policy pro tabulky s tenant_id (generický pattern)
-- Aplikuje se na bookings, customers, services, atd.

CREATE POLICY tenant_isolation_bookings ON bookings
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation_services ON services
  USING (tenant_id = current_tenant_id());

-- Zaměstnanci vidí jen své rezervace (pro role='employee')
CREATE POLICY employee_own_bookings ON bookings
  AS RESTRICTIVE
  USING (
    current_user_role() != 'employee'
    OR employee_id = (
      SELECT id FROM employees WHERE user_id = current_user_id() LIMIT 1
    )
  );

-- Zákazníci vidí jen své data v portálu
CREATE POLICY customer_own_data ON bookings
  AS RESTRICTIVE
  USING (
    current_setting('app.actor_type', TRUE) != 'customer'
    OR customer_id = current_setting('app.customer_id', TRUE)::UUID
  );

-- Audit log: jen pro čtení pro non-owners
CREATE POLICY audit_log_read ON audit_logs
  FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('owner', 'manager')
  );

-- Audit log: INSERT povolen, UPDATE/DELETE nikdy
CREATE POLICY audit_log_insert ON audit_logs
  FOR INSERT
  WITH CHECK (tenant_id = current_tenant_id());
```

---

## BLOK 17 — Triggery a automatizace

```sql
-- ============================================================
-- TRIGGER: updated_at automaticky
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplikovat na všechny tabulky s updated_at:
CREATE TRIGGER trg_updated_at_bookings
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_series
  BEFORE UPDATE ON recurring_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- ... (aplikovat na každou tabulku s updated_at)

-- ============================================================
-- TRIGGER: Audit log — automatické logování změn
-- ============================================================
CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_before JSONB;
  v_after  JSONB;
  v_action VARCHAR(100);
  v_changed_fields TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_before := NULL;
    v_after  := to_jsonb(NEW);
    v_action := TG_TABLE_NAME || '.created';
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
    v_action := TG_TABLE_NAME || '.updated';
    -- Vypočítat změněná pole
    SELECT array_agg(key) INTO v_changed_fields
    FROM jsonb_each(v_before) b
    JOIN jsonb_each(v_after) a USING (key)
    WHERE b.value IS DISTINCT FROM a.value;
    
    -- Speciální akce pro klíčové změny
    IF TG_TABLE_NAME = 'bookings' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'booking.' || NEW.status::TEXT;
    ELSIF TG_TABLE_NAME = 'recurring_series' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'series.' || NEW.status::TEXT;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD);
    v_after  := NULL;
    v_action := TG_TABLE_NAME || '.deleted';
  END IF;
  
  INSERT INTO audit_logs (
    tenant_id, actor_type, actor_id, action,
    entity_type, entity_id, before_state, after_state, changed_fields
  ) VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    COALESCE(current_setting('app.actor_type', TRUE), 'system'),
    current_user_id(),
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_before,
    v_after,
    v_changed_fields
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplikovat na klíčové tabulky:
CREATE TRIGGER trg_audit_bookings
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER trg_audit_series
  AFTER INSERT OR UPDATE OR DELETE ON recurring_series
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER trg_audit_rules
  AFTER INSERT OR UPDATE OR DELETE ON rules
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER trg_audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- ============================================================
-- TRIGGER: Denormalizované počítadla zákazníka
-- ============================================================
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE customers SET
      total_bookings = (
        SELECT COUNT(*) FROM bookings
        WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
          AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      ),
      completed_bookings = (
        SELECT COUNT(*) FROM bookings
        WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
          AND status = 'completed'
          AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      ),
      no_show_count = (
        SELECT COUNT(*) FROM bookings
        WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
          AND status = 'no_show'
          AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      ),
      total_revenue = (
        SELECT COALESCE(SUM(final_price), 0) FROM bookings
        WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
          AND status = 'completed'
          AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      ),
      last_booking_at = (
        SELECT MAX(starts_at) FROM bookings
        WHERE customer_id = COALESCE(NEW.customer_id, OLD.customer_id)
          AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
      ),
      updated_at = NOW()
    WHERE id = COALESCE(NEW.customer_id, OLD.customer_id)
      AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_stats
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_customer_stats();

-- ============================================================
-- TRIGGER: Risk score zákazníka (přepočet)
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_risk_score()
RETURNS TRIGGER AS $$
DECLARE
  v_no_show_rate DECIMAL;
  v_cancel_rate  DECIMAL;
  v_total        INTEGER;
  v_score        INTEGER;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(COUNT(*) FILTER (WHERE status = 'no_show')::DECIMAL / NULLIF(COUNT(*), 0), 0),
    COALESCE(COUNT(*) FILTER (WHERE status IN ('cancelled'))::DECIMAL / NULLIF(COUNT(*), 0), 0)
  INTO v_total, v_no_show_rate, v_cancel_rate
  FROM bookings
  WHERE customer_id = NEW.customer_id
    AND tenant_id = NEW.tenant_id
    AND created_at > NOW() - INTERVAL '12 months';
  
  -- Skóre: 0-100
  v_score := LEAST(100, ROUND(
    (v_no_show_rate * 60)    -- no-show váha 60%
    + (v_cancel_rate * 30)   -- cancel váha 30%
    + (CASE WHEN v_total < 3 THEN 10 ELSE 0 END)  -- nový zákazník: +10
  )::INTEGER);
  
  UPDATE customers SET risk_score = v_score
  WHERE id = NEW.customer_id AND tenant_id = NEW.tenant_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_risk_score
  AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION recalculate_risk_score();

-- ============================================================
-- TRIGGER: Počítadlo série sessions
-- ============================================================
CREATE OR REPLACE FUNCTION update_series_counters()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE recurring_series SET
    sessions_completed = (
      SELECT COUNT(*) FROM recurring_series_sessions
      WHERE series_id = COALESCE(NEW.series_id, OLD.series_id)
        AND status = 'completed'
    ),
    sessions_cancelled_free = (
      SELECT COUNT(*) FROM recurring_series_sessions
      WHERE series_id = COALESCE(NEW.series_id, OLD.series_id)
        AND status = 'cancelled_free'
    ),
    sessions_cancelled_business = (
      SELECT COUNT(*) FROM recurring_series_sessions
      WHERE series_id = COALESCE(NEW.series_id, OLD.series_id)
        AND status = 'cancelled_business'
    ),
    sessions_no_show = (
      SELECT COUNT(*) FROM recurring_series_sessions
      WHERE series_id = COALESCE(NEW.series_id, OLD.series_id)
        AND status = 'no_show'
    ),
    sessions_rescheduled = (
      SELECT COUNT(*) FROM recurring_series_sessions
      WHERE series_id = COALESCE(NEW.series_id, OLD.series_id)
        AND status = 'rescheduled_out'
    ),
    prepaid_sessions_used = (
      SELECT COUNT(*) FROM recurring_series_sessions
      WHERE series_id = COALESCE(NEW.series_id, OLD.series_id)
        AND status IN ('completed', 'no_show', 'cancelled_free', 'cancelled_paid', 'gifted')
    ),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.series_id, OLD.series_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_series_counters
  AFTER INSERT OR UPDATE OF status ON recurring_series_sessions
  FOR EACH ROW EXECUTE FUNCTION update_series_counters();

-- ============================================================
-- TRIGGER: Tenant settings versioning
-- ============================================================
CREATE OR REPLACE FUNCTION version_tenant_settings()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.settings IS DISTINCT FROM NEW.settings THEN
    INSERT INTO tenant_settings_versions (tenant_id, settings, changed_by)
    VALUES (NEW.id, OLD.settings, current_user_id());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenant_settings_version
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION version_tenant_settings();

-- ============================================================
-- TRIGGER: Availability cache invalidace
-- ============================================================
CREATE OR REPLACE FUNCTION invalidate_availability_cache()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM availability_cache
  WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
    AND date >= COALESCE(NEW.starts_at, OLD.starts_at)::DATE
    AND date <= COALESCE(NEW.ends_at, OLD.ends_at)::DATE + INTERVAL '1 day';
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invalidate_cache_bookings
  AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION invalidate_availability_cache();

CREATE TRIGGER trg_invalidate_cache_blocks
  AFTER INSERT OR UPDATE OR DELETE ON availability_blocks
  FOR EACH ROW EXECUTE FUNCTION invalidate_availability_cache();
```

---

## BLOK 18 — Views a pomocné dotazy

```sql
-- ============================================================
-- VIEW: Aktuální dostupnost zaměstnanců (dnes a zítra)
-- ============================================================
CREATE VIEW v_employee_today_schedule AS
SELECT
  e.id AS employee_id,
  e.tenant_id,
  e.first_name || ' ' || e.last_name AS employee_name,
  b.id AS branch_id,
  b.name AS branch_name,
  COUNT(bk.id) FILTER (WHERE bk.status IN ('confirmed','pending')) AS bookings_count,
  SUM(bk.duration_minutes) FILTER (WHERE bk.status IN ('confirmed','pending')) AS booked_minutes
FROM employees e
JOIN employee_branches eb ON eb.employee_id = e.id AND eb.is_active = TRUE
JOIN branches b ON b.id = eb.branch_id
LEFT JOIN bookings bk ON bk.employee_id = e.id
  AND bk.starts_at::DATE = CURRENT_DATE
  AND bk.status NOT IN ('cancelled', 'no_show')
WHERE e.deleted_at IS NULL
GROUP BY e.id, e.tenant_id, e.first_name, e.last_name, b.id, b.name;

-- ============================================================
-- VIEW: Série blízko expirace
-- ============================================================
CREATE VIEW v_series_expiring AS
SELECT
  rs.id,
  rs.tenant_id,
  rs.customer_id,
  c.first_name || ' ' || c.last_name AS customer_name,
  c.email AS customer_email,
  rs.prepaid_sessions_remaining,
  rs.prepaid_expires_at,
  rs.auto_renew,
  rs.renewal_block_size
FROM recurring_series rs
JOIN customers c ON c.id = rs.customer_id
WHERE rs.status = 'active'
  AND rs.billing_model = 'prepaid_block'
  AND (
    rs.prepaid_sessions_remaining <= 3
    OR rs.prepaid_expires_at <= NOW() + INTERVAL '30 days'
  );

-- ============================================================
-- VIEW: Waiting list s pořadím
-- ============================================================
CREATE VIEW v_waiting_list_ordered AS
SELECT
  wl.*,
  ROW_NUMBER() OVER (
    PARTITION BY wl.service_id, wl.employee_id, wl.branch_id,
                 wl.specific_slot_date, wl.specific_slot_time
    ORDER BY wl.created_at ASC
  ) AS queue_position
FROM waiting_list wl
WHERE wl.status = 'waiting';

-- ============================================================
-- VIEW: Zákazníci bez aktivity (churning)
-- ============================================================
CREATE VIEW v_customers_at_risk AS
SELECT
  c.id,
  c.tenant_id,
  c.first_name,
  c.last_name,
  c.email,
  c.last_booking_at,
  c.total_bookings,
  c.risk_score,
  NOW() - c.last_booking_at AS days_since_last_booking,
  EXISTS (
    SELECT 1 FROM recurring_series rs
    WHERE rs.customer_id = c.id AND rs.status = 'active'
  ) AS has_active_series
FROM customers c
WHERE c.deleted_at IS NULL
  AND c.status = 'active'
  AND (c.last_booking_at < NOW() - INTERVAL '60 days'
       OR c.last_booking_at IS NULL);
```

---

## BLOK 19 — Kompletní seznam tabulek (přehled)

| Tabulka | Popis | Přibližný počet řádků (mid-scale) |
|---------|-------|-----------------------------------|
| tenants | Firmy / účty | stovky |
| tenant_settings_versions | Historie konfigurací | tisíce |
| tenant_integrations | Napojené služby | tisíce |
| branches | Pobočky | tisíce |
| areas | Zóny poboček | desítky tisíc |
| workspaces | Pracoviště | desítky tisíc |
| resources | Sdílené zdroje | desítky tisíc |
| holiday_calendars | Svátky | stovky |
| holidays | Konkrétní svátky | tisíce |
| branch_holiday_calendars | M:N | tisíce |
| custom_roles | Vlastní role | tisíce |
| rules | Pravidla (Rules Engine) | desítky tisíc |
| rule_evaluations | Log vyhodnocení | miliony |
| users | Admin uživatelé | desítky tisíc |
| user_sessions | Aktivní sessions | stovky tisíc |
| employees | Zaměstnanci | stovky tisíc |
| employee_branches | Přiřazení poboček | miliony |
| employee_working_hours | Rozvrhy | miliony |
| employee_schedule_exceptions | Výjimky | miliony |
| commission_schemas | Schémata provizí | tisíce |
| employee_commissions | Záznamy provizí | miliony |
| customers | Zákazníci | miliony |
| customer_tags | Tagy zákazníků | desítky milionů |
| customer_groups | Skupiny | tisíce |
| customer_group_members | M:N | miliony |
| customer_notes | Poznámky | miliony |
| customer_relationships | Vztahy zákazníků | miliony |
| corporate_accounts | Firemní účty | tisíce |
| corporate_account_members | M:N | stovky tisíc |
| service_categories | Kategorie | tisíce |
| services | Služby | stovky tisíc |
| service_employees | M:N | miliony |
| intake_forms | Dotazníky | tisíce |
| intake_form_responses | Odpovědi | desítky milionů |
| price_lists | Ceníky | tisíce |
| service_prices | Ceny | miliony |
| price_calculations | Log výpočtů cen | desítky milionů |
| availability_blocks | Blokované časy | miliony |
| availability_cache | Cache dostupnosti | desítky milionů |
| waiting_list | Pořadník | miliony |
| bookings | Rezervace | desítky milionů |
| booking_resources | Zdroje rezervací | desítky milionů |
| group_slots | Skupinové lekce | miliony |
| booking_status_history | Historie stavů | stovky milionů |
| approval_requests | Žádosti ke schválení | miliony |
| recurring_series | Permanentky | miliony |
| recurring_series_sessions | Lekce permanentek | stovky milionů |
| reviews | Hodnocení | desítky milionů |
| notification_templates | Šablony | tisíce |
| notification_queue | Fronta notifikací | desítky milionů |
| notification_log | Archiv notifikací | stovky milionů |
| audit_logs | Audit trail | miliardy |
| packages | Balíčky | tisíce |
| customer_packages | Zakoupené balíčky | miliony |
| package_credit_transactions | Pohyby kreditů | desítky milionů |
| payments | Platby | desítky milionů |
| invoices | Faktury | desítky milionů |
| discount_codes | Slevové kódy | tisíce |
| discount_code_uses | Použití kódů | miliony |
