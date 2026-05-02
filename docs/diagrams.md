# UML Diagrams — CareConnect

Three diagrams beyond the required Data Model Diagram, satisfying the
project rubric's "three additional UML diagrams" extra-credit item.
All diagrams are Mermaid and render inline on GitHub.

---

## 1. Flow Diagram — Appointment Lifecycle

The booking finite-state machine. Each transition lists who can trigger
it and which database object enforces the rule.

```mermaid
flowchart TD
    Start([Care receiver opens<br/>Book Care]):::actor
    Start --> Form[Pick address +<br/>start/end time + notes]:::ui
    Form --> Submit{{Submit booking}}:::action
    Submit --> Created([appointment row inserted<br/>status='requested'<br/>caregiver_id=NULL]):::db

    Created --> Discovery[Caregivers see request<br/>in discovery feed<br/>filtered by Haversine]:::ui

    Discovery --> Accept{{Caregiver taps<br/>Accept}}:::action
    Accept --> SP1[CALL sp_accept_appointment<br/>conditional UPDATE]:::sp
    SP1 -->|ROW_COUNT = 1| Scheduled([status='scheduled'<br/>caregiver_id set]):::db
    SP1 -->|ROW_COUNT = 0<br/>race lost| Conflict([409 Conflict<br/>shown to caregiver]):::error

    Scheduled --> Chat[In-app chat opens<br/>poll every 3s]:::ui

    Chat --> CompleteBtn{{Caregiver taps<br/>Mark complete}}:::action
    CompleteBtn --> SP2[CALL sp_complete_appointment<br/>UPDATE + INSERT payment<br/>in one TXN]:::sp
    SP2 --> Completed([status='completed'<br/>payment row created]):::db
    Completed --> AuditDone[trg_appointment_audit<br/>logs status change]:::trigger

    Scheduled --> CancelBtn{{Either party<br/>cancels with reason}}:::action
    Created --> CancelBtn
    CancelBtn --> SP3[CALL sp_cancel_appointment<br/>role check inside SP]:::sp
    SP3 --> Cancelled([status='cancelled'<br/>cancelled_at stamped]):::db
    Cancelled --> AuditCancel[trg_appointment_audit<br/>logs status change]:::trigger

    classDef actor fill:#e8f4fb,stroke:#3b82a3,stroke-width:1.5px
    classDef ui fill:#fef9e7,stroke:#a37b3b,stroke-width:1.5px
    classDef action fill:#f0e7fb,stroke:#6f3ba3,stroke-width:1.5px
    classDef db fill:#e7fbef,stroke:#3ba36b,stroke-width:1.5px
    classDef sp fill:#fbe7e7,stroke:#a33b3b,stroke-width:1.5px
    classDef trigger fill:#fbf2e7,stroke:#a3713b,stroke-width:1.5px
    classDef error fill:#fbe7f0,stroke:#a33b6f,stroke-width:1.5px
```

**Key:** Blue = actor. Yellow = UI. Purple = user action. Green = DB
state. Red = stored procedure. Orange = trigger fires. Pink = error
surface.

---

## 2. Sequence Diagram — Race-Safe Accept

What happens when **two caregivers tap Accept on the same open request
at the same time.** This is the scenario the stored procedure exists to
handle correctly.

```mermaid
sequenceDiagram
    autonumber
    actor C1 as Caregiver A<br/>(faster network)
    actor C2 as Caregiver B<br/>(slower network)
    participant API as Express API
    participant DB as TiDB
    participant SP as sp_accept_appointment

    Note over C1,C2: Both see appointment X open in their feed

    par
        C1->>API: POST /appointments/X/accept
        API->>API: authenticate + authorize<br/>(role = caregiver)
    and
        C2->>API: POST /appointments/X/accept
        API->>API: authenticate + authorize<br/>(role = caregiver)
    end

    API->>SP: CALL sp_accept_appointment(<br/>caregiver_A_id, X)
    SP->>DB: UPDATE appointment<br/>SET caregiver_id=A, status='scheduled'<br/>WHERE appointment_id=X<br/>AND status='requested'<br/>AND caregiver_id IS NULL
    DB-->>SP: ROW_COUNT() = 1
    SP-->>API: OUT @result = 'accepted'
    API-->>C1: 200 OK<br/>{status:'scheduled', caregiver_id:A}

    API->>SP: CALL sp_accept_appointment(<br/>caregiver_B_id, X)
    SP->>DB: UPDATE appointment<br/>... same WHERE clause
    Note over DB: Row no longer matches<br/>(caregiver_id IS NOT NULL)
    DB-->>SP: ROW_COUNT() = 0
    SP-->>API: OUT @result = 'unavailable'
    API-->>C2: 409 Conflict<br/>"Just accepted by another caregiver"

    Note over C1,C2: Caregiver A wins. Caregiver B sees a clear<br/>error and refreshes their feed.
```

The crucial detail: the WHERE clause inside the procedure includes
`caregiver_id IS NULL`. The first UPDATE flips that to a UUID; the
second UPDATE no longer matches and silently no-ops. ROW_COUNT() tells
us which side of the race we landed on.

---

## 3. User Journey — Care Receiver's First Booking

The end-to-end experience for a new care receiver from sign-up through
chatting with their caregiver. Touchpoints, emotions, frictions, and
where the platform helps.

```mermaid
journey
    title Dorothy books her first home visit
    section Sign up
      Land on /register: 4: Dorothy
      Pick "I need care": 5: Dorothy
      Fill name, email, password: 4: Dorothy
      Pick birthday + sex (optional): 5: Dorothy
      Account created, redirected home: 5: Dorothy
    section First booking
      See "Book Care" CTA on home: 5: Dorothy
      Tap Book Care: 5: Dorothy
      Enter address (no saved ones yet): 3: Dorothy
      Pick date, start time, end time: 4: Dorothy
      Add notes "mobility help": 4: Dorothy
      Confirm and submit: 5: Dorothy
      See appointment as 'requested': 4: Dorothy
    section Waiting for a caregiver
      Refresh home, still requested: 3: Dorothy
      Caregiver Maria accepts: 5: Dorothy
      Status flips to 'scheduled': 5: Dorothy
      Maria's name + photo appear: 5: Dorothy
    section Day-of communication
      Open appointment detail page: 5: Dorothy
      Send "running 5 min late" message: 4: Dorothy
      Maria replies: 5: Dorothy
      Visit takes place: 5: Dorothy
    section After the visit
      Maria taps Mark complete: 5: Dorothy
      Status flips to 'completed': 5: Dorothy
      Payment row created (sp_complete): 5: Dorothy
      Dorothy sees "Past" section update: 4: Dorothy
```

The lower scores in "Waiting for a caregiver" reflect the inherent
uncertainty of an open request — nothing the product does badly, just
the intrinsic emotion of "is anyone going to come help my mom?". Future
iterations could surface estimated-time-to-acceptance based on similar
historical requests in the same ZIP.
