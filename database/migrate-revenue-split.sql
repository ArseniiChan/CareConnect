-- ============================================================
-- CareConnect — Revenue split migration
-- ============================================================
-- Apply this against the existing Aiven CareConnect database to add the
-- marketplace-economics columns and update the stored procedure to use
-- them. Idempotent where possible; safe to re-run.
--
-- This migration is purely additive on the schema side:
--   - caregiver gains hourly_rate_cents (default 5000 = $50/hr so existing rows stay valid)
--   - payment gains caregiver_payout_cents and platform_fee_cents (default 0)
--   - sp_complete_appointment is dropped and re-created with the new signature
--
-- The check constraint enforcing amount = payout + fee is added LAST so
-- existing payment rows (with payout=0, fee=0, amount>0) don't fail it.
-- For those rows, we backfill the split first.
--
-- HOW TO RUN
-- ----------
--   1. Open Aiven SQL editor as avnadmin
--   2. Paste this entire file, run
--   3. Verify with the queries at the bottom
--   4. Tell Arsenii so he can ship the application code that calls the
--      new procedure signature
-- ============================================================

USE CareConnect;


-- ── 1. Add hourly_rate_cents to caregiver ───────────────────
-- Default 5000 ($50/hr) keeps the previous hardcoded rate working until
-- each caregiver gets a real rate set.
ALTER TABLE caregiver
  ADD COLUMN hourly_rate_cents INT UNSIGNED NOT NULL DEFAULT 5000
  AFTER rating;


-- ── 2. Add split columns to payment ─────────────────────────
ALTER TABLE payment
  ADD COLUMN caregiver_payout_cents INT UNSIGNED NOT NULL DEFAULT 0 AFTER amount_cents,
  ADD COLUMN platform_fee_cents     INT UNSIGNED NOT NULL DEFAULT 0 AFTER caregiver_payout_cents;


-- ── 3. Backfill the split on any pre-existing payments ─────
-- Apply the canonical 20% / 80% split to historical payment rows so the
-- check constraint we add next doesn't reject them.
UPDATE payment
   SET platform_fee_cents     = ROUND(amount_cents * 0.20),
       caregiver_payout_cents = amount_cents - ROUND(amount_cents * 0.20)
 WHERE caregiver_payout_cents = 0 AND platform_fee_cents = 0 AND amount_cents > 0;


-- ── 4. Add the integrity constraint ─────────────────────────
-- Future inserts (from sp_complete_appointment) must satisfy:
--   amount_cents = caregiver_payout_cents + platform_fee_cents
ALTER TABLE payment
  ADD CONSTRAINT chk_payment_split
  CHECK (amount_cents = caregiver_payout_cents + platform_fee_cents);


-- ── 5. Set realistic hourly rates for the seeded caregivers ─
-- These match the canonical aiven-init.sql so re-seeded data lines up.
UPDATE caregiver SET hourly_rate_cents = 4500 WHERE email = 'maria.garcia@example.com';
UPDATE caregiver SET hourly_rate_cents = 5000 WHERE email = 'james.wilson@example.com';


-- ── 6. Replace v_caregiver_stats view to surface the split ──
DROP VIEW IF EXISTS v_caregiver_stats;
CREATE VIEW v_caregiver_stats AS
SELECT
  bin_to_uuid(c.caregiver_id) AS caregiver_id,
  c.first_name, c.last_name, c.is_verified, c.rating, c.hourly_rate_cents,
  COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancelled_count,
  COALESCE(SUM(p.amount_cents), 0)           AS gross_revenue_cents,
  COALESCE(SUM(p.caregiver_payout_cents), 0) AS caregiver_payout_cents,
  COALESCE(SUM(p.platform_fee_cents), 0)     AS platform_fee_cents
FROM caregiver c
LEFT JOIN appointment a ON a.caregiver_id = c.caregiver_id
LEFT JOIN payment     p ON p.appointment_id = a.appointment_id AND p.status = 'paid'
GROUP BY c.caregiver_id, c.first_name, c.last_name, c.is_verified, c.rating, c.hourly_rate_cents;


-- ── 7. Replace sp_complete_appointment ──────────────────────
DROP PROCEDURE IF EXISTS sp_complete_appointment;

DELIMITER $$

CREATE PROCEDURE sp_complete_appointment (
  IN  p_caregiver_id       VARCHAR(36),
  IN  p_appointment_id     VARCHAR(36),
  IN  p_platform_fee_bps   INT,
  OUT p_result             VARCHAR(20)
)
BEGIN
  DECLARE v_status         VARCHAR(20);
  DECLARE v_caregiver      BINARY(16);
  DECLARE v_start          DATETIME;
  DECLARE v_end            DATETIME;
  DECLARE v_rate_cents     INT;
  DECLARE v_hours          DECIMAL(6,2);
  DECLARE v_total          INT;
  DECLARE v_platform_fee   INT;
  DECLARE v_payout         INT;
  DECLARE v_payment_id     BINARY(16) DEFAULT uuid_to_bin(uuid());

  START TRANSACTION;

  SELECT a.status, a.caregiver_id, a.start_time, a.end_time, c.hourly_rate_cents
    INTO v_status, v_caregiver, v_start, v_end, v_rate_cents
    FROM appointment a
    LEFT JOIN caregiver c ON c.caregiver_id = a.caregiver_id
   WHERE a.appointment_id = uuid_to_bin(p_appointment_id)
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
    SET v_hours        = TIMESTAMPDIFF(MINUTE, v_start, v_end) / 60.0;
    SET v_total        = ROUND(v_hours * v_rate_cents);
    SET v_platform_fee = ROUND(v_total * p_platform_fee_bps / 10000);
    SET v_payout       = v_total - v_platform_fee;

    UPDATE appointment SET status = 'completed'
     WHERE appointment_id = uuid_to_bin(p_appointment_id);

    INSERT INTO payment (
      payment_id, appointment_id, amount_cents,
      caregiver_payout_cents, platform_fee_cents,
      currency, status
    )
    VALUES (
      v_payment_id, uuid_to_bin(p_appointment_id), v_total,
      v_payout, v_platform_fee,
      'USD', 'paid'
    );

    COMMIT;
    SET p_result = 'completed';
  END IF;
END$$

DELIMITER ;


-- ── 8. Verification queries ─────────────────────────────────
-- Run these by hand and check the output looks sensible.
--
--   DESCRIBE caregiver;
--     -- Should show hourly_rate_cents column
--
--   DESCRIBE payment;
--     -- Should show caregiver_payout_cents and platform_fee_cents
--
--   SELECT first_name, last_name, hourly_rate_cents/100 AS rate_dollars
--     FROM caregiver
--     ORDER BY hourly_rate_cents DESC;
--
--   SELECT
--     amount_cents/100        AS billed,
--     caregiver_payout_cents/100 AS payout,
--     platform_fee_cents/100  AS fee
--   FROM payment;
--
--   SHOW PROCEDURE STATUS WHERE Db = DATABASE() AND Name = 'sp_complete_appointment';
