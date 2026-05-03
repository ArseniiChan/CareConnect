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
CREATE TABLE caregiver (
  caregiver_id         BINARY(16)   NOT NULL,
  first_name           VARCHAR(100) NOT NULL,
  last_name            VARCHAR(100) NOT NULL,
  email                VARCHAR(255) NOT NULL,
  phone                VARCHAR(25),
  is_verified          TINYINT(1)   NOT NULL DEFAULT 0,
  rating               DECIMAL(3,2),
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

CREATE TABLE payment (
  payment_id      BINARY(16)   NOT NULL DEFAULT (uuid_to_bin(uuid())),
  appointment_id  BINARY(16)   NOT NULL,
  amount_cents    INT UNSIGNED NOT NULL,
  currency        CHAR(3)      NOT NULL DEFAULT 'USD',
  status          VARCHAR(20)  NOT NULL DEFAULT 'paid',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_payment_appointment (appointment_id),
  KEY idx_payment_created (created_at),
  CONSTRAINT fk_payment_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id)
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
  c.first_name, c.last_name, c.is_verified, c.rating,
  COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) AS cancelled_count,
  COALESCE(SUM(p.amount_cents), 0) AS total_revenue_cents
FROM caregiver c
LEFT JOIN appointment a ON a.caregiver_id = c.caregiver_id
LEFT JOIN payment     p ON p.appointment_id = a.appointment_id AND p.status = 'paid'
GROUP BY c.caregiver_id, c.first_name, c.last_name, c.is_verified, c.rating;


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

-- Complete: validate caregiver, calculate amount from time worked,
-- update appointment and create payment in one transaction.
CREATE PROCEDURE sp_complete_appointment (
  IN  p_caregiver_id      VARCHAR(36),
  IN  p_appointment_id    VARCHAR(36),
  IN  p_hourly_rate_cents INT,
  OUT p_result            VARCHAR(20)
)
BEGIN
  DECLARE v_status     VARCHAR(20);
  DECLARE v_caregiver  BINARY(16);
  DECLARE v_start      DATETIME;
  DECLARE v_end        DATETIME;
  DECLARE v_hours      DECIMAL(6,2);
  DECLARE v_amount     INT;
  DECLARE v_payment_id BINARY(16) DEFAULT uuid_to_bin(uuid());

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

    UPDATE appointment SET status = 'completed'
     WHERE appointment_id = uuid_to_bin(p_appointment_id);

    INSERT INTO payment (payment_id, appointment_id, amount_cents, currency, status)
    VALUES (v_payment_id, uuid_to_bin(p_appointment_id), v_amount, 'USD', 'paid');

    COMMIT;
    SET p_result = 'completed';
  END IF;
END$$

DELIMITER ;


-- ============================================================
-- 7. SEED DATA
-- ============================================================
-- All four demo users login with: Password123!
-- Hash is bcrypt cost 12.

INSERT INTO users (user_id, email, password_hash, role) VALUES
  (uuid_to_bin('c849af49-3045-4636-862c-126f3d8d0e5b'), 'admin@careconnect.com',    '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'admin'),
  (uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), 'maria.garcia@example.com', '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), 'james.wilson@example.com', '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'caregiver'),
  (uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'dorothy.chen@example.com', '$2b$12$guy2LlxMduNdzhZv.e159.LrdMwJqXbU5QpiDTdJGI3jmoKPdxU5y', 'care_receiver');

INSERT INTO caregiver (caregiver_id, first_name, last_name, email, phone, is_verified, rating) VALUES
  (uuid_to_bin('5cc9b2b1-ae8a-4669-94a4-8db0a7ae4817'), 'Maria', 'Garcia', 'maria.garcia@example.com', '212-555-0101', 1, 4.85),
  (uuid_to_bin('a39b36ac-7654-4dee-b925-8cc7aab427fc'), 'James', 'Wilson', 'james.wilson@example.com', '212-555-0102', 1, 4.92);

INSERT INTO careReceiver (care_receiver_id, first_name, last_name, birthday, sex) VALUES
  (uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'), 'Dorothy', 'Chen', '1948-03-15', 'female');

INSERT INTO address (address_id, care_receiver_id, nickname, address_line1, city, state, zip_code, latitude, longitude, is_primary) VALUES
  (uuid_to_bin('4a952fb8-2695-4266-92f1-acdfc773d03c'),
   uuid_to_bin('f5b35e19-4d24-46d8-bcbe-732c42f78f19'),
   'home', '123 Main St', 'New York', 'NY', '10001', 40.7484, -73.9967, 1);


-- ============================================================
-- 8. VERIFICATION (run by hand after the file completes)
-- ============================================================
-- SHOW TABLES;
-- SHOW PROCEDURE STATUS WHERE Db = DATABASE();
-- SHOW TRIGGERS;
-- SELECT email, role FROM users;
-- SELECT * FROM v_open_requests;
-- SELECT * FROM v_caregiver_stats;
