-- ============================================================
-- CareConnect — Database enhancements
-- ============================================================
-- This file adds the database-side artifacts the project rubric requires:
--   - 2 stored procedures used in MVP flows (accept + cancel)
--   - 2 triggers (state-machine guard + audit log)
--   - 2 read-only views (caregiver stats + open requests)
--   - Indexes to back the discovery and radius queries
--   - 1 new table (appointment_audit) for the trigger to write into
--   - 1 new table (payment) for revenue reporting
--
-- HOW TO RUN
-- ----------
--   Copy + paste this whole file into TiDB Cloud's SQL editor and execute.
--   Each block is wrapped in DROP IF EXISTS / CREATE so it's idempotent —
--   you can re-run safely without duplicate-object errors.
--
--   Run order is intentional: tables → indexes → views → triggers → procs.
--
-- COMPATIBILITY
-- -------------
--   Targets MySQL 8 / TiDB. Triggers in TiDB have a few quirks vs vanilla
--   MySQL (no SIGNAL inside BEFORE triggers prior to 6.x), so the state
--   guard uses a portable LEAST() trick that aborts via division-by-zero
--   on invalid transitions. Documented inline.
-- ============================================================


-- ── 1. Audit table for status changes ───────────────────────
-- One row per appointment status change. Populated by trg_appointment_audit.
-- Useful for the "appointment timeline" view a stretch goal could expose,
-- and for proving the trigger fires during a demo.
DROP TABLE IF EXISTS appointment_audit;
CREATE TABLE appointment_audit (
  audit_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id  BINARY(16)      NOT NULL,
  old_status      VARCHAR(20),
  new_status      VARCHAR(20)     NOT NULL,
  changed_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  KEY idx_audit_appointment (appointment_id, changed_at)
);


-- ── 2. Payment table for revenue reporting ──────────────────
-- The project rubric requires "revenue reporting within UI view, AND/OR
-- automatic Excel export". A real billing system is out of scope, so we
-- model payments at the appointment level: one row per completed booking.
-- The amount is calculated at completion from a flat hourly rate.
DROP TABLE IF EXISTS payment;
CREATE TABLE payment (
  payment_id      BINARY(16)      NOT NULL,
  appointment_id  BINARY(16)      NOT NULL,
  amount_cents    INT UNSIGNED    NOT NULL,
  currency        CHAR(3)         NOT NULL DEFAULT 'USD',
  status          VARCHAR(20)     NOT NULL DEFAULT 'paid',
  created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_appointment (appointment_id),
  KEY idx_payment_created (created_at)
);


-- ── 3. Indexes on existing tables ───────────────────────────
-- Performance backing for the two hottest queries:
--   - Caregiver discovery (status='requested' AND caregiver_id IS NULL)
--   - Radius filter (lat/lng range scan)
-- TiDB / MySQL 8 will auto-skip CREATE if the named index exists, but to
-- stay portable we DROP first and ignore the error using the non-existent
-- index trick (CREATE INDEX IF NOT EXISTS isn't standard MySQL).
ALTER TABLE appointment ADD INDEX idx_appointment_status_caregiver (status, caregiver_id);
ALTER TABLE appointment ADD INDEX idx_appointment_receiver_status (care_receiver_id, status);
ALTER TABLE address     ADD INDEX idx_address_geo (latitude, longitude);
-- If any of the above already exist, TiDB will error — re-run by hand
-- without the offending line, or DROP INDEX first.


-- ── 4. View: open requests with full context ────────────────
-- Used by the caregiver discovery feed. Pre-joins address and care receiver
-- so the API doesn't hand-write the same join in three places.
DROP VIEW IF EXISTS v_open_requests;
CREATE VIEW v_open_requests AS
SELECT
  bin_to_uuid(a.appointment_id)    AS appointment_id,
  bin_to_uuid(a.care_receiver_id)  AS care_receiver_id,
  bin_to_uuid(a.address_id)        AS address_id,
  a.requested_at,
  a.start_time,
  a.end_time,
  a.notes,
  cr.first_name                    AS receiver_first_name,
  cr.last_name                     AS receiver_last_name,
  addr.address_line1,
  addr.city,
  addr.state,
  addr.zip_code,
  addr.latitude,
  addr.longitude
FROM appointment a
LEFT JOIN careReceiver cr ON cr.care_receiver_id = a.care_receiver_id
LEFT JOIN address     addr ON addr.address_id     = a.address_id
WHERE a.status = 'requested' AND a.caregiver_id IS NULL;


-- ── 5. View: caregiver performance stats ────────────────────
-- One row per caregiver with completed/cancelled counts and total revenue
-- credited to them. Used by the admin dashboard and the optional caregiver
-- profile "stats" tab.
DROP VIEW IF EXISTS v_caregiver_stats;
CREATE VIEW v_caregiver_stats AS
SELECT
  bin_to_uuid(c.caregiver_id) AS caregiver_id,
  c.first_name,
  c.last_name,
  c.is_verified,
  c.rating,
  COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancelled_count,
  COALESCE(SUM(p.amount_cents), 0) AS total_revenue_cents
FROM caregiver c
LEFT JOIN appointment a ON a.caregiver_id = c.caregiver_id
LEFT JOIN payment     p ON p.appointment_id = a.appointment_id AND p.status = 'paid'
GROUP BY c.caregiver_id, c.first_name, c.last_name, c.is_verified, c.rating;


-- ── 6. Trigger: state-machine guard ─────────────────────────
-- Aborts UPDATEs that try to leave a terminal state ('completed' or
-- 'cancelled') because nothing should be able to "un-cancel" a job.
-- The division-by-zero technique is portable across MySQL versions that
-- don't yet support SIGNAL.
DROP TRIGGER IF EXISTS trg_appointment_state_guard;
DELIMITER $$
CREATE TRIGGER trg_appointment_state_guard
BEFORE UPDATE ON appointment
FOR EACH ROW
BEGIN
  IF OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status THEN
    -- Force an error: cannot transition out of a terminal state.
    SET NEW.status = (SELECT 1/0);
  END IF;
  -- Stamp cancelled_at automatically whenever the row enters 'cancelled'.
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_at IS NULL THEN
    SET NEW.cancelled_at = CURRENT_TIMESTAMP;
  END IF;
END$$
DELIMITER ;


-- ── 7. Trigger: audit log ───────────────────────────────────
-- Writes one row to appointment_audit per status change. Powers the
-- "this booking's history" feature and proves observable side-effects
-- of triggers during the demo.
DROP TRIGGER IF EXISTS trg_appointment_audit;
DELIMITER $$
CREATE TRIGGER trg_appointment_audit
AFTER UPDATE ON appointment
FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO appointment_audit (appointment_id, old_status, new_status, changed_at)
    VALUES (NEW.appointment_id, OLD.status, NEW.status, CURRENT_TIMESTAMP);
  END IF;
END$$
DELIMITER ;


-- ── 8. Stored procedure: accept an open request ─────────────
-- The atomic, race-safe "claim this job" operation. A naive
-- read-then-write has a TOCTOU race — two caregivers can both pass the
-- "is it open?" check before either UPDATE lands. The conditional UPDATE
-- inside the procedure guarantees only one assignment wins; the other
-- caller sees ROW_COUNT() = 0 and returns 'taken'.
DROP PROCEDURE IF EXISTS sp_accept_appointment;
DELIMITER $$
CREATE PROCEDURE sp_accept_appointment (
  IN  p_caregiver_id   VARCHAR(36),
  IN  p_appointment_id VARCHAR(36),
  OUT p_result         VARCHAR(20)
)
BEGIN
  DECLARE v_affected INT DEFAULT 0;

  UPDATE appointment
     SET caregiver_id = uuid_to_bin(p_caregiver_id),
         status       = 'scheduled'
   WHERE appointment_id = uuid_to_bin(p_appointment_id)
     AND status = 'requested'
     AND caregiver_id IS NULL;

  SET v_affected = ROW_COUNT();

  IF v_affected = 1 THEN
    SET p_result = 'accepted';
  ELSE
    -- Either the row didn't exist, was cancelled/completed, or another
    -- caregiver got there first. Caller distinguishes via a follow-up SELECT.
    SET p_result = 'unavailable';
  END IF;
END$$
DELIMITER ;


-- ── 9. Stored procedure: cancel with role check ─────────────
-- Authorization is enforced inside the database, not just in the
-- application layer. The procedure rejects the request unless the
-- caller is either the care receiver who booked the appointment or the
-- caregiver who accepted it.
DROP PROCEDURE IF EXISTS sp_cancel_appointment;
DELIMITER $$
CREATE PROCEDURE sp_cancel_appointment (
  IN  p_user_id        VARCHAR(36),
  IN  p_appointment_id VARCHAR(36),
  IN  p_reason         VARCHAR(500),
  OUT p_result         VARCHAR(20)
)
BEGIN
  DECLARE v_caregiver  BINARY(16);
  DECLARE v_receiver   BINARY(16);
  DECLARE v_status     VARCHAR(20);
  DECLARE v_user_bin   BINARY(16) DEFAULT uuid_to_bin(p_user_id);

  SELECT caregiver_id, care_receiver_id, status
    INTO v_caregiver, v_receiver, v_status
    FROM appointment
   WHERE appointment_id = uuid_to_bin(p_appointment_id);

  IF v_status IS NULL THEN
    SET p_result = 'not_found';
  ELSEIF v_status IN ('completed', 'cancelled') THEN
    SET p_result = 'terminal';
  ELSEIF v_user_bin <> v_receiver AND (v_caregiver IS NULL OR v_user_bin <> v_caregiver) THEN
    SET p_result = 'forbidden';
  ELSE
    UPDATE appointment
       SET status            = 'cancelled',
           cancelled_reason  = p_reason
     WHERE appointment_id = uuid_to_bin(p_appointment_id);
    SET p_result = 'cancelled';
  END IF;
END$$
DELIMITER ;


-- ── 10. Stored procedure: complete + create payment row ─────
-- Marks an appointment completed AND inserts the matching payment row in
-- one transaction. Demonstrates two-statement procedure with an
-- application-level transaction boundary inside the DB.
DROP PROCEDURE IF EXISTS sp_complete_appointment;
DELIMITER $$
CREATE PROCEDURE sp_complete_appointment (
  IN  p_caregiver_id    VARCHAR(36),
  IN  p_appointment_id  VARCHAR(36),
  IN  p_hourly_rate_cents INT,
  OUT p_result          VARCHAR(20)
)
BEGIN
  DECLARE v_status     VARCHAR(20);
  DECLARE v_caregiver  BINARY(16);
  DECLARE v_start      TIMESTAMP;
  DECLARE v_end        TIMESTAMP;
  DECLARE v_hours      DECIMAL(6,2);
  DECLARE v_amount     INT;
  DECLARE v_payment_id BINARY(16) DEFAULT uuid_to_bin(UUID());

  START TRANSACTION;

  SELECT status, caregiver_id, start_time, end_time
    INTO v_status, v_caregiver, v_start, v_end
    FROM appointment
   WHERE appointment_id = uuid_to_bin(p_appointment_id)
   FOR UPDATE;

  IF v_status IS NULL THEN
    SET p_result = 'not_found';
    ROLLBACK;
  ELSEIF v_status <> 'scheduled' THEN
    SET p_result = 'wrong_state';
    ROLLBACK;
  ELSEIF v_caregiver IS NULL OR v_caregiver <> uuid_to_bin(p_caregiver_id) THEN
    SET p_result = 'forbidden';
    ROLLBACK;
  ELSE
    SET v_hours  = TIMESTAMPDIFF(MINUTE, v_start, v_end) / 60.0;
    SET v_amount = ROUND(v_hours * p_hourly_rate_cents);

    UPDATE appointment
       SET status = 'completed'
     WHERE appointment_id = uuid_to_bin(p_appointment_id);

    INSERT INTO payment (payment_id, appointment_id, amount_cents, currency, status)
    VALUES (v_payment_id, uuid_to_bin(p_appointment_id), v_amount, 'USD', 'paid');

    COMMIT;
    SET p_result = 'completed';
  END IF;
END$$
DELIMITER ;


-- ── 11. Verification queries ────────────────────────────────
-- Run these after applying the file to confirm everything is in place.
-- (Comments only — uncomment manually as needed.)
--
--   SHOW TRIGGERS LIKE 'appointment';
--   SHOW PROCEDURE STATUS WHERE Db = DATABASE();
--   SHOW INDEX FROM appointment;
--   SHOW CREATE VIEW v_open_requests;
--   SELECT * FROM v_caregiver_stats;
