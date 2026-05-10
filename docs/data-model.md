# CareConnect — Data Model (2NF)

This is the relational schema CareConnect runs on. It satisfies **second
normal form (2NF)**: every non-key column depends on the whole primary key
of its table, no partial dependencies. The full normalization analysis is
in [normalization.md](./normalization.md).

The diagram is in Mermaid syntax and renders inline on GitHub.

## Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o| caregiver : "is_a (role=caregiver)"
    users ||--o| careReceiver : "is_a (role=care_receiver)"
    careReceiver ||--o{ address : "owns"
    careReceiver ||--o{ appointment : "books"
    caregiver ||--o{ appointment : "accepts"
    address ||--o{ appointment : "located_at"
    appointment ||--o{ message : "contains"
    appointment ||--o| payment : "results_in"
    appointment ||--o{ appointment_audit : "logged_to"
    caregiver ||--o{ caregiverCertification : "earns"
    certification ||--o{ caregiverCertification : "issued_to"

    users {
        BINARY16 user_id PK
        VARCHAR email UK
        VARCHAR password_hash
        ENUM role "admin|caregiver|care_receiver"
        TIMESTAMP created_at
    }

    caregiver {
        BINARY16 caregiver_id PK, FK "= users.user_id"
        VARCHAR first_name
        VARCHAR last_name
        VARCHAR email
        VARCHAR phone
        BOOLEAN is_verified
        DECIMAL rating "0.00 to 5.00"
        VARCHAR profile_picture_url
        TIMESTAMP created_at
    }

    careReceiver {
        BINARY16 care_receiver_id PK, FK "= users.user_id"
        VARCHAR first_name
        VARCHAR last_name
        DATE birthday
        VARCHAR sex
        VARCHAR profile_picture_url
        TIMESTAMP created_at
    }

    address {
        BINARY16 address_id PK
        BINARY16 care_receiver_id FK
        VARCHAR nickname
        VARCHAR address_line1
        VARCHAR address_line2
        VARCHAR city
        VARCHAR state
        VARCHAR zip_code
        DECIMAL latitude "10,7"
        DECIMAL longitude "10,7"
        BOOLEAN is_primary
        TIMESTAMP created_at
    }

    appointment {
        BINARY16 appointment_id PK
        BINARY16 caregiver_id FK "nullable"
        BINARY16 care_receiver_id FK
        BINARY16 address_id FK
        TIMESTAMP requested_at
        TIMESTAMP start_time
        TIMESTAMP end_time
        ENUM status "requested|scheduled|completed|cancelled"
        TEXT notes
        VARCHAR cancelled_reason
        TIMESTAMP cancelled_at
        TIMESTAMP created_at
    }

    message {
        BINARY16 message_id PK
        BINARY16 appointment_id FK
        BINARY16 sender_id FK "= users.user_id"
        TEXT message_text
        TIMESTAMP sent_at
    }

    payment {
        BINARY16 payment_id PK
        BINARY16 appointment_id FK, UK
        INT amount_cents
        CHAR3 currency "USD"
        VARCHAR status "paid|refunded"
        TIMESTAMP created_at
    }

    appointment_audit {
        BIGINT audit_id PK
        BINARY16 appointment_id FK
        VARCHAR old_status
        VARCHAR new_status
        TIMESTAMP changed_at
    }

    certification {
        BINARY16 certification_id PK
        VARCHAR certification_name
        VARCHAR issuing_authority
        TEXT description
    }

    caregiverCertification {
        BINARY16 caregiver_certification_id PK
        BINARY16 caregiver_id FK
        BINARY16 certification_id FK
        VARCHAR certificate_number
        DATE issued_date
        DATE expiration_date
        VARCHAR verification_status
        VARCHAR document_url
        TIMESTAMP created_at
    }
```

## Cardinality summary

| Relationship | Type | Notes |
|---|---|---|
| `users` → `caregiver` | 1 ↔ 0..1 | `caregiver_id` IS `users.user_id` when `users.role = 'caregiver'` |
| `users` → `careReceiver` | 1 ↔ 0..1 | `care_receiver_id` IS `users.user_id` when `users.role = 'care_receiver'` |
| `careReceiver` → `address` | 1 ↔ N | A receiver can save multiple addresses (home, daughter's house, etc.) |
| `careReceiver` → `appointment` | 1 ↔ N | A receiver books many appointments |
| `caregiver` → `appointment` | 1 ↔ N (nullable) | Null caregiver_id means the request is open |
| `address` → `appointment` | 1 ↔ N | An address can host repeat appointments |
| `appointment` → `message` | 1 ↔ N | Per-appointment chat thread |
| `appointment` → `payment` | 1 ↔ 0..1 | One payment per completed appointment (UNIQUE constraint) |
| `appointment` → `appointment_audit` | 1 ↔ N | Trigger writes one row per status transition |
| `caregiver` → `caregiverCertification` | 1 ↔ N | Multiple certs per caregiver |
| `certification` → `caregiverCertification` | 1 ↔ N | Many caregivers hold the same cert |

## Key design choices

**1. Binary(16) UUIDs as primary keys.** Joshua's schema uses `BINARY(16)` with
`uuid_to_bin()` / `bin_to_uuid()` helpers. This is 16 bytes vs 36 for a
hyphenated string — half the index size, faster joins, no collision risk
across distributed inserts.

**2. Profile-as-PK (caregiver_id = user_id).** Older versions of this schema
had a separate `caregiver_profiles` table with its own ID and a FK to
`users`. Joshua collapsed that: the caregiver row's PK IS the user's PK.
One less hop in every query, no risk of orphan profiles.

**3. Caregiver-less appointments.** `appointment.caregiver_id` is nullable
because requests start unassigned. The status FSM treats
`status = 'requested' AND caregiver_id IS NULL` as the canonical "open
request" — caregivers discover and accept these.

**4. Address belongs to care receivers only.** A caregiver's "service area"
is captured client-side (localStorage) for now; a future migration can add
`caregiver.service_zip` + lat/lng without breaking anything else.

**5. Audit and payment as separate tables.** Both are write-once side
effects of state transitions — keeping them out of `appointment` itself
avoids wide-row anti-patterns and lets us index them independently.
