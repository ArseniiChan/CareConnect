-- ============================================================
-- CareConnect — Aiven MySQL initialization
-- ============================================================
-- One-shot file to bootstrap a fresh MySQL 8 database. Paste the
-- whole thing into Aiven's SQL editor (or pipe via mysql client) and
-- execute. Creates all tables, seeds demo data, and installs the
-- procedures/triggers/views/indexes the project rubric requires.
--
-- DESIGN NOTES
-- ------------
-- - Column names are snake_case to match the backend code in src/.
-- - Primary keys are BINARY(16) UUIDs populated by uuid_to_bin(uuid()).
--   This requires MySQL 8.0+ (uuid_to_bin / bin_to_uuid are MySQL 8
--   built-ins). Aiven defaults to MySQL 8 — verify when creating the
--   instance.
-- - Foreign-key order matters. Tables are declared in the order they
--   can be created without violating FK constraints:
--     users → caregiver / careReceiver
--                       → address → appointment → message / payment / audit
--                       → certification → caregiverCertification
--                       → medication / diagnosis / insurance
-- - Drops are top-down (children first) so re-running the file from a
--   dirty DB cleans up properly without FK errors.
--
-- HOW TO RUN
-- ----------
--   1. Create a MySQL 8 service on Aiven (free tier, 1 GB)
--   2. Open Aiven's SQL editor (or connect via mysql client)
--   3. Paste this entire file, execute
--   4. Verify with the queries at the bottom
--   5. Send the connection details to Arsenii to update Railway env vars
--
-- After running:
--   - 4 demo users login with Password123!
--   - The accept/cancel/complete endpoints will work end-to-end
--     (they CALL the stored procedures defined here)
-- ============================================================


-- ── Clean slate (children first) ────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS sp_accept_appointment;
DROP PROCEDURE IF EXISTS sp_cancel_appointment;
DROP PROCEDURE IF EXISTS sp_complete_appointment;
DROP TRIGGER   IF EXISTS trg_appointment_state_guard;
DROP TRIGGER   IF EXISTS trg_appointment_audit;
DROP VIEW      IF EXISTS v_open_requests;
DROP VIEW      IF EXISTS v_caregiver_stats;

DROP TABLE IF EXISTS appointment_audit;
DROP TABLE IF EXISTS payment;
DROP TABLE IF EXISTS message;
DROP TABLE IF EXISTS appointment;
DROP TABLE IF EXISTS address;
DROP TABLE IF EXISTS medication;
DROP TABLE IF EXISTS diagnosis;
DROP TABLE IF EXISTS insurance;
DROP TABLE IF EXISTS caregiverCertification;
DROP TABLE IF EXISTS certification;
DROP TABLE IF EXISTS careReceiver;
DROP TABLE IF EXISTS caregiver;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
-- 1. CORE TABLES
-- ============================================================

-- ── users (auth) ────────────────────────────────────────────
-- Single login source. caregiver_id and care_receiver_id elsewhere
-- equal users.user_id when role matches — no separate profile-id hop.
CREATE TABLE users (
  user_id        BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  email          VARCHAR(255) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin','caregiver','care_receiver') NOT NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── caregiver (profile) ─────────────────────────────────────
-- caregiver_id IS users.user_id when users.role = 'caregiver'.
-- hourly_rate_cents is what the caregiver charges per hour. The platform
-- takes a percentage fee on top (see PLATFORM_FEE_BPS in the application
-- and sp_complete_appointment for how the split is applied). Stored in
-- cents to avoid floating point — same convention as Stripe.
CREATE TABLE caregiver (
  caregiver_id         BINARY(16)   NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  email                VARCHAR(255) NOT NULL,
  phone                VARCHAR(25),
  is_verified          TINYINT(1)   NOT NULL DEFAULT 0,
  rating               DECIMAL(3,2),
  hourly_rate_cents    INT UNSIGNED NOT NULL DEFAULT 5000,
  profile_picture_url  VARCHAR(500),
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (caregiver_id),
  UNIQUE KEY uq_caregiver_email (email),
  CONSTRAINT fk_caregiver_user FOREIGN KEY (caregiver_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── careReceiver (profile) ──────────────────────────────────
-- care_receiver_id IS users.user_id when users.role = 'care_receiver'.
CREATE TABLE careReceiver (
  care_receiver_id     BINARY(16)   NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  birthday             DATE,
  sex                  VARCHAR(50),
  profile_picture_url  VARCHAR(500),
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (care_receiver_id),
  CONSTRAINT fk_care_receiver_user FOREIGN KEY (care_receiver_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── address ─────────────────────────────────────────────────
-- Belongs to a care receiver. latitude / longitude populated by the
-- backend's geocoding service on insert (Nominatim).
CREATE TABLE address (
  address_id        BINARY(16)    NOT NULL DEFAULT (uuid_to_bin(uuid())),
  care_receiver_id  BINARY(16)    NOT NULL,
  nickname          VARCHAR(100),
  address_line1     VARCHAR(255)  NOT NULL,
  address_line2     VARCHAR(255),
  city              VARCHAR(100)  NOT NULL,
  state             VARCHAR(100)  NOT NULL,
  zip_code          VARCHAR(20)   NOT NULL,
  latitude          DECIMAL(10,7),
  longitude         DECIMAL(10,7),
  is_primary        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (address_id),
  KEY idx_address_care_receiver (care_receiver_id),
  CONSTRAINT fk_address_care_receiver FOREIGN KEY (care_receiver_id) REFERENCES careReceiver (care_receiver_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── appointment ─────────────────────────────────────────────
-- Status FSM: requested → scheduled → completed | cancelled.
-- caregiver_id is NULL when the request is open (status='requested').
CREATE TABLE appointment (
  appointment_id     BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  caregiver_id       BINARY(16),
  care_receiver_id   BINARY(16)   NOT NULL,
  address_id         BINARY(16)   NOT NULL,
  requested_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  start_time         DATETIME     NOT NULL,
  end_time           DATETIME     NOT NULL,
  status             ENUM('requested','scheduled','completed','cancelled') NOT NULL DEFAULT 'requested',
  notes              TEXT,
  cancelled_reason   VARCHAR(500),
  cancelled_at       DATETIME,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (appointment_id),
  KEY idx_appt_caregiver (caregiver_id),
  KEY idx_appt_care_receiver (care_receiver_id),
  KEY idx_appt_address (address_id),
  KEY idx_appt_start (start_time),
  CONSTRAINT fk_appt_caregiver     FOREIGN KEY (caregiver_id)     REFERENCES caregiver (caregiver_id),
  CONSTRAINT fk_appt_care_receiver FOREIGN KEY (care_receiver_id) REFERENCES careReceiver (care_receiver_id),
  CONSTRAINT fk_appt_address       FOREIGN KEY (address_id)       REFERENCES address (address_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── message (per-appointment chat) ──────────────────────────
-- sender_role is denormalized from users.role on insert. It saves a JOIN
-- on every message render, which matters because the chat polls every
-- 3 seconds.
CREATE TABLE message (
  message_id      BINARY(16) NOT NULL DEFAULT (uuid_to_bin(uuid())),
  appointment_id  BINARY(16) NOT NULL,
  sender_id       BINARY(16) NOT NULL,
  sender_role     ENUM('caregiver','care_receiver') NOT NULL,
  message_text    TEXT       NOT NULL,
  sent_at         TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME,
  PRIMARY KEY (message_id),
  KEY idx_msg_appointment (appointment_id, sent_at),
  KEY idx_msg_sender (sender_id),
  CONSTRAINT fk_msg_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender      FOREIGN KEY (sender_id)      REFERENCES users (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── certification (catalog) ─────────────────────────────────
CREATE TABLE certification (
  certification_id    BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  certification_name  VARCHAR(255) NOT NULL,
  issuing_authority   VARCHAR(255),
  description         TEXT,
  PRIMARY KEY (certification_id),
  UNIQUE KEY uq_cert_name (certification_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── caregiverCertification (M:N join) ───────────────────────
CREATE TABLE caregiverCertification (
  caregiver_certification_id  BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  caregiver_id                BINARY(16)   NOT NULL,
  certification_id            BINARY(16)   NOT NULL,
  certificate_number          VARCHAR(100),
  issued_date                 DATE,
  expiration_date             DATE,
  verification_status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  document_url                VARCHAR(500),
  created_at                  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (caregiver_certification_id),
  KEY idx_cc_caregiver (caregiver_id),
  KEY idx_cc_certification (certification_id),
  KEY idx_cc_expiration (expiration_date),
  CONSTRAINT fk_cc_caregiver     FOREIGN KEY (caregiver_id)     REFERENCES caregiver (caregiver_id) ON DELETE CASCADE,
  CONSTRAINT fk_cc_certification FOREIGN KEY (certification_id) REFERENCES certification (certification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── insurance / diagnosis / medication (care receiver health) ──
CREATE TABLE insurance (
  insurance_id               BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  care_receiver_id           BINARY(16)   NOT NULL,
  provider_name              VARCHAR(255) NOT NULL,
  policy_number              VARCHAR(100) NOT NULL,
  group_number               VARCHAR(100),
  plan_name                  VARCHAR(255),
  subscriber_name            VARCHAR(255),
  relationship_to_subscriber VARCHAR(100),
  effective_date             DATE,
  expiration_date            DATE,
  phone_number               VARCHAR(50),
  is_primary                 TINYINT(1)   NOT NULL DEFAULT 0,
  created_at                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (insurance_id),
  KEY idx_insurance_care_receiver (care_receiver_id),
  CONSTRAINT fk_insurance_care_receiver FOREIGN KEY (care_receiver_id) REFERENCES careReceiver (care_receiver_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE diagnosis (
  care_receiver_id  BINARY(16)   NOT NULL,
  diagnosis         VARCHAR(255) NOT NULL,
  prescriber        VARCHAR(255),
  diagnosis_date    DATE,
  PRIMARY KEY (care_receiver_id, diagnosis),
  CONSTRAINT fk_diagnosis_care_receiver FOREIGN KEY (care_receiver_id) REFERENCES careReceiver (care_receiver_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE medication (
  medication_id     BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  care_receiver_id  BINARY(16)   NOT NULL,
  drug_name         VARCHAR(255),
  prescriber        VARCHAR(255),
  dose              VARCHAR(255),
  PRIMARY KEY (medication_id),
  KEY idx_medication_care_receiver (care_receiver_id),
  CONSTRAINT fk_medication_care_receiver FOREIGN KEY (care_receiver_id) REFERENCES careReceiver (care_receiver_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 2. ENHANCEMENT TABLES (rubric: payment for revenue, audit for triggers)
-- ============================================================

CREATE TABLE appointment_audit (
  audit_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id  BINARY(16)      NOT NULL,
  old_status      VARCHAR(20),
  new_status      VARCHAR(20)     NOT NULL,
  changed_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  KEY idx_audit_appointment (appointment_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- payment models the marketplace economics:
--   amount_cents          = what the customer paid (caregiver_payout + platform_fee)
--   caregiver_payout_cents = what the caregiver receives
--   platform_fee_cents    = what CareConnect keeps (the service fee)
-- These three columns satisfy: amount_cents = caregiver_payout_cents + platform_fee_cents.
-- We store all three (instead of computing on the fly) so reports stay
-- correct even if the platform fee percentage changes in the future.
CREATE TABLE payment (
  payment_id            BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  appointment_id        BINARY(16)   NOT NULL,
  amount_cents          INT UNSIGNED NOT NULL,
  caregiver_payout_cents INT UNSIGNED NOT NULL DEFAULT 0,
  platform_fee_cents    INT UNSIGNED NOT NULL DEFAULT 0,
  currency              CHAR(3)      NOT NULL DEFAULT 'USD',
  status                VARCHAR(20)  NOT NULL DEFAULT 'paid',
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_appointment (appointment_id),
  KEY idx_payment_created (created_at),
  CONSTRAINT fk_payment_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id),
  -- Sanity check: the total must equal the sum of the parts.
  CONSTRAINT chk_payment_split CHECK (amount_cents = caregiver_payout_cents + platform_fee_cents)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- 3. EXTRA INDEXES (on top of the FK indexes above)
-- ============================================================

ALTER TABLE appointment ADD INDEX idx_appointment_status_caregiver (status, caregiver_id);
ALTER TABLE appointment ADD INDEX idx_appointment_receiver_status (care_receiver_id, status);
ALTER TABLE address     ADD INDEX idx_address_geo (latitude, longitude);


-- ============================================================
-- 4. VIEWS (read-only convenience joins)
-- ============================================================

CREATE VIEW v_open_requests AS
SELECT
  bin_to_uuid(a.appointment_id)    AS appointment_id,
  bin_to_uuid(a.care_receiver_id)  AS care_receiver_id,
  bin_to_uuid(a.address_id)        AS address_id,
  a.requested_at, a.start_time, a.end_time, a.notes,
  cr.first_name AS receiver_first_name,
  cr.last_name  AS receiver_last_name,
  addr.address_line1, addr.city, addr.state, addr.zip_code,
  addr.latitude, addr.longitude
FROM appointment a
LEFT JOIN careReceiver cr ON cr.care_receiver_id = a.care_receiver_id
LEFT JOIN address     addr ON addr.address_id     = a.address_id
WHERE a.status = 'requested' AND a.caregiver_id IS NULL;

CREATE VIEW v_caregiver_stats AS
SELECT
  bin_to_uuid(c.caregiver_id) AS caregiver_id,
  c.first_name, c.last_name, c.is_verified, c.rating, c.hourly_rate_cents,
  COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancelled_count,
  -- gross_revenue is what flowed through the platform on behalf of the caregiver
  -- (caregiver_payout = what they earned, platform_fee = what we kept)
  COALESCE(SUM(p.amount_cents), 0)           AS gross_revenue_cents,
  COALESCE(SUM(p.caregiver_payout_cents), 0) AS caregiver_payout_cents,
  COALESCE(SUM(p.platform_fee_cents), 0)     AS platform_fee_cents
FROM caregiver c
LEFT JOIN appointment a ON a.caregiver_id = c.caregiver_id
LEFT JOIN payment     p ON p.appointment_id = a.appointment_id AND p.status = 'paid'
GROUP BY c.caregiver_id, c.first_name, c.last_name, c.is_verified, c.rating, c.hourly_rate_cents;


-- ============================================================
-- 5. TRIGGERS
-- ============================================================

DELIMITER $$

CREATE TRIGGER trg_appointment_state_guard
BEFORE UPDATE ON appointment
FOR EACH ROW
BEGIN
  IF OLD.status IN ('completed','cancelled') AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cannot transition out of a terminal appointment state';
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' AND NEW.cancelled_at IS NULL THEN
    SET NEW.cancelled_at = CURRENT_TIMESTAMP;
  END IF;
END$$

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


-- ============================================================
-- 6. STORED PROCEDURES
-- ============================================================

DELIMITER $$

-- Race-safe accept. Two callers can press at the same instant; the
-- conditional UPDATE ensures only one wins, the loser sees ROW_COUNT()=0
-- and gets 'unavailable'.
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
    SET p_result = 'unavailable';
  END IF;
END$$

-- Cancel with role check inside the database. The application layer
-- already checks roles too; this is defense in depth.
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
  ELSEIF v_status IN ('completed','cancelled') THEN
    SET p_result = 'terminal';
  ELSEIF v_user_bin <> v_receiver AND (v_caregiver IS NULL OR v_user_bin <> v_caregiver) THEN
    SET p_result = 'forbidden';
  ELSE
    UPDATE appointment
       SET status = 'cancelled',
           cancelled_reason = p_reason
     WHERE appointment_id = uuid_to_bin(p_appointment_id);
    SET p_result = 'cancelled';
  END IF;
END$$

-- Complete: validate caregiver, calculate marketplace economics, update
-- appointment and create payment in one transaction. The proc reads the
-- caregiver's hourly_rate_cents directly from the caregiver row — no need
-- for the application to pass it in (and no risk of mismatched values).
--
-- Marketplace split:
--   total = hours * hourly_rate_cents
--   platform_fee = total * (PLATFORM_FEE_BPS / 10000)
--   caregiver_payout = total - platform_fee
-- Using basis points (1 bp = 0.01%) lets us tune the take-rate without
-- touching the procedure body — change p_platform_fee_bps and re-run.
CREATE PROCEDURE sp_complete_appointment (
  IN  p_caregiver_id       VARCHAR(36),
  IN  p_appointment_id     VARCHAR(36),
  IN  p_platform_fee_bps   INT,                  -- 2000 = 20% take-rate
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


-- ============================================================
-- 7. SEED DATA
-- ============================================================
-- Demo users all login with: Password123!  (bcrypt hash, cost 12)
-- Layout:
--   1 admin
--   8 caregivers (mix of rates $30-$50/hr, ratings 3.9-4.95, all verified)
--   10 care receivers in NYC
--   12 addresses (some receivers have one, two have multiple)
--   20 appointments mixed across all four statuses, with payment rows
--     on every completed appointment so the revenue dashboard has real data
--
-- Appointment timestamps are anchored to "today" via DATE_ADD/SUB and
-- NOW() so the seed stays demo-ready regardless of when it's loaded.

-- Shared bcrypt hash for all users (Password123!)
-- $2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y

INSERT INTO users (user_id, email, password_hash, role) VALUES
  -- Admin
  (uuid_to_bin('c849af49-3045-4636-862c-126f3d8d0e5b'), 'admin@careconnect.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'admin'),
  -- Caregivers
  (uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), 'maria.garcia@example.com',     '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), 'james.wilson@example.com',     '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('b1234567-89ab-4cde-9012-3456789abcde'), 'aisha.patel@example.com',      '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('b2234567-89ab-4cde-9012-3456789abcde'), 'david.kim@example.com',        '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('b3234567-89ab-4cde-9012-3456789abcde'), 'sofia.rodriguez@example.com',  '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('b4234567-89ab-4cde-9012-3456789abcde'), 'michael.brown@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('b5234567-89ab-4cde-9012-3456789abcde'), 'fatima.hassan@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('b6234567-89ab-4cde-9012-3456789abcde'), 'thomas.nguyen@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  -- Care receivers
  (uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'dorothy.chen@example.com',     '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c1234567-89ab-4cde-9012-3456789abcde'), 'harold.johnson@example.com',   '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c2234567-89ab-4cde-9012-3456789abcde'), 'margaret.williams@example.com','$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c3234567-89ab-4cde-9012-3456789abcde'), 'frank.davis@example.com',      '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c4234567-89ab-4cde-9012-3456789abcde'), 'eleanor.moore@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c5234567-89ab-4cde-9012-3456789abcde'), 'walter.taylor@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c6234567-89ab-4cde-9012-3456789abcde'), 'rose.anderson@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c7234567-89ab-4cde-9012-3456789abcde'), 'arthur.thomas@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c8234567-89ab-4cde-9012-3456789abcde'), 'beatrice.jackson@example.com', '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver'),
  (uuid_to_bin('c9234567-89ab-4cde-9012-3456789abcde'), 'lillian.white@example.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver');

-- Caregivers — varied rates ($30-$50/hr) and ratings (3.9-4.95) so the
-- revenue dashboard, top-caregivers ranking, and rating display all have
-- something to compare against.
INSERT INTO caregiver (caregiver_id, first_name, last_name, email, phone, is_verified, rating, hourly_rate_cents) VALUES
  (uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), 'Maria',   'Garcia',    'maria.garcia@example.com',    '212-555-0101', 1, 4.85, 4500),
  (uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), 'James',   'Wilson',    'james.wilson@example.com',    '212-555-0102', 1, 4.92, 5000),
  (uuid_to_bin('b1234567-89ab-4cde-9012-3456789abcde'), 'Aisha',   'Patel',     'aisha.patel@example.com',     '212-555-0103', 1, 4.78, 4000),
  (uuid_to_bin('b2234567-89ab-4cde-9012-3456789abcde'), 'David',   'Kim',       'david.kim@example.com',       '212-555-0104', 1, 4.65, 3500),
  (uuid_to_bin('b3234567-89ab-4cde-9012-3456789abcde'), 'Sofia',   'Rodriguez', 'sofia.rodriguez@example.com', '212-555-0105', 1, 4.95, 5500),
  (uuid_to_bin('b4234567-89ab-4cde-9012-3456789abcde'), 'Michael', 'Brown',     'michael.brown@example.com',   '212-555-0106', 1, 4.20, 3000),
  (uuid_to_bin('b5234567-89ab-4cde-9012-3456789abcde'), 'Fatima',  'Hassan',    'fatima.hassan@example.com',   '212-555-0107', 1, 4.55, 4000),
  (uuid_to_bin('b6234567-89ab-4cde-9012-3456789abcde'), 'Thomas',  'Nguyen',    'thomas.nguyen@example.com',   '212-555-0108', 0, 3.90, 3200);

-- Care receivers
INSERT INTO careReceiver (care_receiver_id, first_name, last_name, birthday, sex) VALUES
  (uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'Dorothy',  'Chen',     '1948-03-15', 'female'),
  (uuid_to_bin('c1234567-89ab-4cde-9012-3456789abcde'), 'Harold',   'Johnson',  '1942-07-22', 'male'),
  (uuid_to_bin('c2234567-89ab-4cde-9012-3456789abcde'), 'Margaret', 'Williams', '1945-11-04', 'female'),
  (uuid_to_bin('c3234567-89ab-4cde-9012-3456789abcde'), 'Frank',    'Davis',    '1939-01-30', 'male'),
  (uuid_to_bin('c4234567-89ab-4cde-9012-3456789abcde'), 'Eleanor',  'Moore',    '1951-09-18', 'female'),
  (uuid_to_bin('c5234567-89ab-4cde-9012-3456789abcde'), 'Walter',   'Taylor',   '1944-05-11', 'male'),
  (uuid_to_bin('c6234567-89ab-4cde-9012-3456789abcde'), 'Rose',     'Anderson', '1949-12-03', 'female'),
  (uuid_to_bin('c7234567-89ab-4cde-9012-3456789abcde'), 'Arthur',   'Thomas',   '1937-04-25', 'male'),
  (uuid_to_bin('c8234567-89ab-4cde-9012-3456789abcde'), 'Beatrice', 'Jackson',  '1946-08-14', 'female'),
  (uuid_to_bin('c9234567-89ab-4cde-9012-3456789abcde'), 'Lillian',  'White',    '1953-02-09', 'female');

-- Addresses — real NYC ZIP codes with approximate lat/lng for the radius
-- filter to work meaningfully. Two receivers (Dorothy, Margaret) have
-- two saved addresses each so the address-picker UI shows multiple.
INSERT INTO address (address_id, care_receiver_id, nickname, address_line1, city, state, zip_code, latitude, longitude, is_primary) VALUES
  (uuid_to_bin('4a952fb8-2695-4266-92f1-acdfc773d03c'), uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'Home',          '123 Main St',     'New York', 'NY', '10001', 40.7484, -73.9967, 1),
  (uuid_to_bin('4a952fb8-2695-4266-92f1-acdfc773d03d'), uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'Daughter''s',   '420 W 50th St',   'New York', 'NY', '10019', 40.7639, -73.9893, 0),
  (uuid_to_bin('d1234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c1234567-89ab-4cde-9012-3456789abcde'), 'Home',          '88 Bleecker St',  'New York', 'NY', '10012', 40.7264, -73.9947, 1),
  (uuid_to_bin('d2234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c2234567-89ab-4cde-9012-3456789abcde'), 'Apartment',     '350 W 85th St',   'New York', 'NY', '10024', 40.7869, -73.9763, 1),
  (uuid_to_bin('d2234567-89ab-4cde-9012-3456789abcdf'), uuid_to_bin('c2234567-89ab-4cde-9012-3456789abcde'), 'Sister''s',     '180 E 73rd St',   'New York', 'NY', '10021', 40.7716, -73.9602, 0),
  (uuid_to_bin('d3234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c3234567-89ab-4cde-9012-3456789abcde'), 'Home',          '500 E 14th St',   'New York', 'NY', '10009', 40.7305, -73.9787, 1),
  (uuid_to_bin('d4234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c4234567-89ab-4cde-9012-3456789abcde'), 'Home',          '210 W 23rd St',   'New York', 'NY', '10011', 40.7449, -73.9968, 1),
  (uuid_to_bin('d5234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c5234567-89ab-4cde-9012-3456789abcde'), 'Home',          '40 Park Ave',     'New York', 'NY', '10016', 40.7479, -73.9799, 1),
  (uuid_to_bin('d6234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c6234567-89ab-4cde-9012-3456789abcde'), 'Home',          '99 Greenwich St', 'New York', 'NY', '10006', 40.7095, -74.0139, 1),
  (uuid_to_bin('d7234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c7234567-89ab-4cde-9012-3456789abcde'), 'Home',          '15 Vandam St',    'New York', 'NY', '10013', 40.7270, -74.0042, 1),
  (uuid_to_bin('d8234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c8234567-89ab-4cde-9012-3456789abcde'), 'Home',          '305 W 122nd St',  'New York', 'NY', '10027', 40.8095, -73.9527, 1),
  (uuid_to_bin('d9234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c9234567-89ab-4cde-9012-3456789abcde'), 'Home',          '720 Park Ave',    'New York', 'NY', '10021', 40.7714, -73.9636, 1);

-- Appointments — 20 rows, mixed statuses, anchored to NOW():
--   8 completed (with payment rows)
--   5 scheduled (caregiver assigned, in the future)
--   4 requested (open, no caregiver)
--   3 cancelled (with reasons)
--
-- For demo purposes, completed visits are 1-3 hours each so the revenue
-- dashboard shows non-trivial dollar amounts.
INSERT INTO appointment (appointment_id, caregiver_id, care_receiver_id, address_id, requested_at, start_time, end_time, status, notes, cancelled_reason, cancelled_at) VALUES
  -- COMPLETED (caregiver assigned, visit done, payment created)
  (uuid_to_bin('e0000001-0000-4000-8000-000000000001'), uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), uuid_to_bin('c1234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d1234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 28 DAY), DATE_SUB(NOW(), INTERVAL 28 DAY) + INTERVAL 2 HOUR, 'completed', 'Mobility help and grocery prep.',                       NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000002'), uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), uuid_to_bin('c2234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d2234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 25 DAY), DATE_SUB(NOW(), INTERVAL 22 DAY), DATE_SUB(NOW(), INTERVAL 22 DAY) + INTERVAL 3 HOUR, 'completed', 'Medication reminders + light housekeeping.',             NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000003'), uuid_to_bin('b1234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c3234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d3234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 18 DAY), DATE_SUB(NOW(), INTERVAL 18 DAY) + INTERVAL 1 HOUR, 'completed', 'Wellness check-in.',                                     NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000004'), uuid_to_bin('b3234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), uuid_to_bin('4a952fb8-2695-4266-92f1-acdfc773d03c'), DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY) + INTERVAL 2 HOUR, 'completed', 'Companionship visit.',                                   NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000005'), uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), uuid_to_bin('c4234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d4234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 3 HOUR, 'completed', 'Bath assist + meal prep.',                               NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000006'), uuid_to_bin('b5234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c5234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d5234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 9 DAY),  DATE_SUB(NOW(), INTERVAL 7 DAY),  DATE_SUB(NOW(), INTERVAL 7 DAY)  + INTERVAL 2 HOUR, 'completed', 'Doctor appointment escort.',                              NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000007'), uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), uuid_to_bin('c6234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d6234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 6 DAY),  DATE_SUB(NOW(), INTERVAL 4 DAY),  DATE_SUB(NOW(), INTERVAL 4 DAY)  + INTERVAL 1 HOUR, 'completed', 'Quick check-in.',                                        NULL, NULL),
  (uuid_to_bin('e0000001-0000-4000-8000-000000000008'), uuid_to_bin('b1234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c7234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d7234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 4 DAY),  DATE_SUB(NOW(), INTERVAL 2 DAY),  DATE_SUB(NOW(), INTERVAL 2 DAY)  + INTERVAL 2 HOUR, 'completed', 'Mobility + companionship.',                              NULL, NULL),

  -- SCHEDULED (caregiver assigned, future)
  (uuid_to_bin('e0000002-0000-4000-8000-000000000001'), uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), uuid_to_bin('4a952fb8-2695-4266-92f1-acdfc773d03c'), DATE_SUB(NOW(), INTERVAL 1 DAY),  DATE_ADD(NOW(), INTERVAL 2 DAY),  DATE_ADD(NOW(), INTERVAL 2 DAY)  + INTERVAL 2 HOUR, 'scheduled', 'Help with grocery shopping.',                            NULL, NULL),
  (uuid_to_bin('e0000002-0000-4000-8000-000000000002'), uuid_to_bin('b3234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c2234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d2234567-89ab-4cde-9012-3456789abcdf'), NOW(),                            DATE_ADD(NOW(), INTERVAL 3 DAY),  DATE_ADD(NOW(), INTERVAL 3 DAY)  + INTERVAL 3 HOUR, 'scheduled', 'Doctor visit + meal prep.',                              NULL, NULL),
  (uuid_to_bin('e0000002-0000-4000-8000-000000000003'), uuid_to_bin('b5234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c8234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d8234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 2 DAY),  DATE_ADD(NOW(), INTERVAL 5 DAY),  DATE_ADD(NOW(), INTERVAL 5 DAY)  + INTERVAL 2 HOUR, 'scheduled', 'Light housekeeping.',                                    NULL, NULL),
  (uuid_to_bin('e0000002-0000-4000-8000-000000000004'), uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), uuid_to_bin('c4234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d4234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY),  DATE_ADD(NOW(), INTERVAL 1 DAY)  + INTERVAL 1 HOUR, 'scheduled', 'Wellness check.',                                        NULL, NULL),
  (uuid_to_bin('e0000002-0000-4000-8000-000000000005'), uuid_to_bin('b1234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c9234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d9234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 4 DAY),  DATE_ADD(NOW(), INTERVAL 4 DAY)  + INTERVAL 2 HOUR, 'scheduled', 'Companionship.',                                         NULL, NULL),

  -- REQUESTED (open, awaiting caregiver assignment)
  (uuid_to_bin('e0000003-0000-4000-8000-000000000001'), NULL, uuid_to_bin('c3234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d3234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_ADD(NOW(), INTERVAL 6 DAY),  DATE_ADD(NOW(), INTERVAL 6 DAY)  + INTERVAL 2 HOUR, 'requested', 'Need help with bathing and changing.',                  NULL, NULL),
  (uuid_to_bin('e0000003-0000-4000-8000-000000000002'), NULL, uuid_to_bin('c6234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d6234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL 7 DAY),  DATE_ADD(NOW(), INTERVAL 7 DAY)  + INTERVAL 3 HOUR, 'requested', 'Light house cleaning + laundry.',                       NULL, NULL),
  (uuid_to_bin('e0000003-0000-4000-8000-000000000003'), NULL, uuid_to_bin('c1234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d1234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 8 DAY),  DATE_ADD(NOW(), INTERVAL 8 DAY)  + INTERVAL 1 HOUR, 'requested', 'Companionship visit, no medical.',                      NULL, NULL),
  (uuid_to_bin('e0000003-0000-4000-8000-000000000004'), NULL, uuid_to_bin('c5234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d5234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 30 MINUTE), DATE_ADD(NOW(), INTERVAL 9 DAY), DATE_ADD(NOW(), INTERVAL 9 DAY) + INTERVAL 2 HOUR, 'requested', 'Doctor appointment escort needed.',                     NULL, NULL),

  -- CANCELLED
  (uuid_to_bin('e0000004-0000-4000-8000-000000000001'), uuid_to_bin('b6234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c7234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d7234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 11 DAY), DATE_SUB(NOW(), INTERVAL 11 DAY) + INTERVAL 2 HOUR, 'cancelled', NULL, 'Family emergency, had to reschedule.', DATE_SUB(NOW(), INTERVAL 12 DAY)),
  (uuid_to_bin('e0000004-0000-4000-8000-000000000002'), NULL,                                                  uuid_to_bin('c8234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d8234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 8 DAY),  DATE_SUB(NOW(), INTERVAL 5 DAY),  DATE_SUB(NOW(), INTERVAL 5 DAY)  + INTERVAL 1 HOUR, 'cancelled', NULL, 'Felt better, no longer needed care.',  DATE_SUB(NOW(), INTERVAL 7 DAY)),
  (uuid_to_bin('e0000004-0000-4000-8000-000000000003'), uuid_to_bin('b4234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('c9234567-89ab-4cde-9012-3456789abcde'), uuid_to_bin('d9234567-89ab-4cde-9012-3456789abcde'), DATE_SUB(NOW(), INTERVAL 5 DAY),  DATE_SUB(NOW(), INTERVAL 3 DAY),  DATE_SUB(NOW(), INTERVAL 3 DAY)  + INTERVAL 2 HOUR, 'cancelled', NULL, 'Caregiver was not available.',         DATE_SUB(NOW(), INTERVAL 4 DAY));

-- Payment rows — one per completed appointment. The amounts reflect the
-- caregiver's hourly_rate_cents × hours, with the platform taking 20%
-- (2000 basis points). These match what sp_complete_appointment would
-- have written if the demo path had been taken for each booking.
--
-- Calculation reference (rate × hrs = total | payout 80% | fee 20%):
--   Maria   $45 × 2 = $90      | $72.00 | $18.00 (9000 / 7200 / 1800 cents)
--   James   $50 × 3 = $150     | $120.00 | $30.00 (15000 / 12000 / 3000 cents)
--   Aisha   $40 × 1 = $40      | $32.00 | $8.00  (4000 / 3200 / 800 cents)
--   Sofia   $55 × 2 = $110     | $88.00 | $22.00 (11000 / 8800 / 2200 cents)
--   Maria   $45 × 3 = $135     | $108.00 | $27.00 (13500 / 10800 / 2700 cents)
--   Fatima  $40 × 2 = $80      | $64.00 | $16.00 (8000 / 6400 / 1600 cents)
--   James   $50 × 1 = $50      | $40.00 | $10.00 (5000 / 4000 / 1000 cents)
--   Aisha   $40 × 2 = $80      | $64.00 | $16.00 (8000 / 6400 / 1600 cents)
INSERT INTO payment (payment_id, appointment_id, amount_cents, caregiver_payout_cents, platform_fee_cents, currency, status, created_at) VALUES
  (uuid_to_bin('f0000001-0000-4000-8000-000000000001'), uuid_to_bin('e0000001-0000-4000-8000-000000000001'),  9000,  7200, 1800, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 28 DAY) + INTERVAL 2 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000002'), uuid_to_bin('e0000001-0000-4000-8000-000000000002'), 15000, 12000, 3000, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 22 DAY) + INTERVAL 3 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000003'), uuid_to_bin('e0000001-0000-4000-8000-000000000003'),  4000,  3200,  800, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 18 DAY) + INTERVAL 1 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000004'), uuid_to_bin('e0000001-0000-4000-8000-000000000004'), 11000,  8800, 2200, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 14 DAY) + INTERVAL 2 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000005'), uuid_to_bin('e0000001-0000-4000-8000-000000000005'), 13500, 10800, 2700, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 3 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000006'), uuid_to_bin('e0000001-0000-4000-8000-000000000006'),  8000,  6400, 1600, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 7 DAY)  + INTERVAL 2 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000007'), uuid_to_bin('e0000001-0000-4000-8000-000000000007'),  5000,  4000, 1000, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 4 DAY)  + INTERVAL 1 HOUR),
  (uuid_to_bin('f0000001-0000-4000-8000-000000000008'), uuid_to_bin('e0000001-0000-4000-8000-000000000008'),  8000,  6400, 1600, 'USD', 'paid', DATE_SUB(NOW(), INTERVAL 2 DAY)  + INTERVAL 2 HOUR);

-- Sample chat messages on the most recent completed appointment so the
-- chat panel has history during demo, plus on the upcoming Maria/Dorothy
-- scheduled visit so the demo flow has visible conversation.
INSERT INTO message (message_id, appointment_id, sender_id, sender_role, message_text, sent_at) VALUES
  (uuid_to_bin('a0000001-0000-4000-8000-000000000001'), uuid_to_bin('e0000001-0000-4000-8000-000000000008'), uuid_to_bin('c7234567-89ab-4cde-9012-3456789abcde'), 'care_receiver', 'Looking forward to your visit tomorrow.',                              DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (uuid_to_bin('a0000001-0000-4000-8000-000000000002'), uuid_to_bin('e0000001-0000-4000-8000-000000000008'), uuid_to_bin('b1234567-89ab-4cde-9012-3456789abcde'), 'caregiver',     'See you then. I will bring my things.',                                DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL 5 MINUTE),
  (uuid_to_bin('a0000002-0000-4000-8000-000000000001'), uuid_to_bin('e0000002-0000-4000-8000-000000000001'), uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'care_receiver', 'Hello Maria, my daughter will be there too.',                          DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 2 HOUR),
  (uuid_to_bin('a0000002-0000-4000-8000-000000000002'), uuid_to_bin('e0000002-0000-4000-8000-000000000001'), uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), 'caregiver',     'Sounds good. I will arrive a few minutes early to set up.',            DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 3 HOUR);


-- ============================================================
-- 8. VERIFICATION (run by hand after the file completes)
-- ============================================================
-- SHOW TABLES;
-- SHOW PROCEDURE STATUS WHERE Db = DATABASE();
-- SHOW TRIGGERS;
-- SELECT email, role FROM users;
-- SELECT * FROM v_open_requests;
-- SELECT * FROM v_caregiver_stats;
