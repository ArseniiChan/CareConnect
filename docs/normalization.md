# Normalization Analysis — CareConnect

The project rubric requires a relational design **at minimum 2NF**. Every
table in the CareConnect schema actually meets **3NF**. This document walks
through each table and shows why.

Definitions used:

- **1NF** — atomic columns, no repeating groups, every row uniquely identified
- **2NF** — 1NF + no partial dependencies (every non-key column depends on the *whole* PK)
- **3NF** — 2NF + no transitive dependencies (non-key columns depend only on the PK, not on each other)

Most of our PKs are single-column UUIDs, so partial dependencies (a 2NF
violation) are structurally impossible — if your PK is one column, every
non-key dep is automatically a dep on the *whole* PK. The interesting
analysis is at the 3NF level.

---

## `users`
**PK:** `user_id` (binary(16))

| Column | Depends on |
|---|---|
| `email` | `user_id` |
| `password_hash` | `user_id` |
| `role` | `user_id` |
| `created_at` | `user_id` |

No partial deps (single-column PK). No transitive deps (each non-key
attribute is a fact about the user, not about another non-key attribute).

**Verdict: 3NF.**

---

## `caregiver`
**PK:** `caregiver_id` (also FK to `users.user_id`)

All columns (`first_name`, `last_name`, `email`, `phone`, `is_verified`,
`rating`, `profile_picture_url`, `created_at`) are facts about the
caregiver. `email` is intentionally duplicated from `users.email` for
read-side convenience; this is a controlled denormalization, documented
here, not a 3NF violation in the strict sense (the value is functionally
dependent on the PK either way).

**Verdict: 3NF, with one documented denormalization (email).**

---

## `careReceiver`
**PK:** `care_receiver_id` (also FK to `users.user_id`)

`first_name`, `last_name`, `birthday`, `sex`, `profile_picture_url` —
all facts about the receiver, no transitive deps.

**Verdict: 3NF.**

---

## `address`
**PK:** `address_id`

`care_receiver_id` is a FK. All other columns (`nickname`, the address
parts, `latitude`/`longitude`, `is_primary`, `created_at`) describe the
address itself.

The one place a 3NF challenge could be raised is `city`/`state`/`zip_code`
— in the strictest interpretation, `city` and `state` can be derived from
`zip_code`, so storing all three could be a transitive dep on `zip_code`.
We keep them separately because:
- ZIP-to-city lookups are not 1:1 (multiple cities per ZIP, sometimes)
- Address validation services return city/state independently
- Any normalization to a `zip_codes` lookup table would add a join on
  every address read with no real correctness benefit

**Verdict: 3NF (with documented redundancy on city/state).**

---

## `appointment`
**PK:** `appointment_id`

FKs: `caregiver_id` (nullable), `care_receiver_id`, `address_id`.

Other columns (`requested_at`, `start_time`, `end_time`, `status`,
`notes`, `cancelled_reason`, `cancelled_at`, `created_at`) are all facts
about the appointment itself. `cancelled_at` is dependent on `status`
transitioning to `'cancelled'` but that is a temporal stamp, not a
transitive dep — it carries information `status` alone does not.

**Verdict: 3NF.**

---

## `message`
**PK:** `message_id`

FKs: `appointment_id`, `sender_id` (refs `users.user_id`). Body and
timestamp are facts about the message.

**Verdict: 3NF.**

---

## `payment`
**PK:** `payment_id`. Unique key on `appointment_id` (one-to-one).

`amount_cents` depends on the appointment's duration and the rate at
completion — captured at write time so the historical value is preserved
even if rates change. `currency` is fixed at `'USD'` for the demo but
could vary, so storing it per-row is correct.

**Verdict: 3NF.**

---

## `appointment_audit`
**PK:** `audit_id` (auto-increment).

`appointment_id`, `old_status`, `new_status`, `changed_at` — all facts
about a single status change event. Trigger-populated, never edited by
the application.

**Verdict: 3NF.**

---

## `certification` and `caregiverCertification`
Standard many-to-many between `caregiver` and `certification`, resolved
through the `caregiverCertification` join table.

`caregiverCertification` has its own PK so it can hold join-specific
attributes (`certificate_number`, `issued_date`, `expiration_date`,
`verification_status`, `document_url`). All those attributes describe
the assignment of a certification to a caregiver, not the certification
itself — they belong here, not on `certification`.

**Verdict: both 3NF.**

---

## Summary

| Table | 1NF | 2NF | 3NF |
|---|:-:|:-:|:-:|
| users | ✅ | ✅ | ✅ |
| caregiver | ✅ | ✅ | ✅ |
| careReceiver | ✅ | ✅ | ✅ |
| address | ✅ | ✅ | ✅ |
| appointment | ✅ | ✅ | ✅ |
| message | ✅ | ✅ | ✅ |
| payment | ✅ | ✅ | ✅ |
| appointment_audit | ✅ | ✅ | ✅ |
| certification | ✅ | ✅ | ✅ |
| caregiverCertification | ✅ | ✅ | ✅ |

Every table meets the rubric's 2NF minimum and goes one step further to
3NF. The one place we deliberately stop short of BCNF/4NF is the
`address` table's `city`/`state`/`zip_code` triple, where the join cost
of normalizing into a ZIP lookup table outweighs the redundancy benefit.
