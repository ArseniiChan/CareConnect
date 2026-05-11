# CareConnect — Final Demo Script

**Audience:** Prof. Sheng Chen, CSC 33600 (Database Systems), Spring 2026
**Length:** 10 minutes (~7 demo + ~3 architecture/Q&A)
**Date:** Tuesday, May 12, 2026
**Format:** Live, in-person, single laptop projected

---

## Pre-demo checklist (do this 10 minutes before)

Before walking on stage:

1. **Three browser windows open and pre-arranged**, in this order on screen:
   - Window 1 (Chrome, full screen): logged in as **`admin@careconnect.com`**, on `/admin/revenue`
   - Window 2 (Chrome, incognito A): logged in as **`dorothy.chen@example.com`**, on home page
   - Window 3 (Chrome, incognito B): logged in as **`maria.garcia@example.com`**, on home page
2. **A fourth window with the GitHub repo open** to `database/aiven-init.sql` so we can pull up the schema mid-demo if asked
3. **One terminal window** with `railway logs --tail 100` running, so we can show triggers firing live if asked
4. **Cold-start fix:** hit each Vercel URL once in advance so the first demo click isn't slow
5. **Backup:** if Vercel fails, have `localhost:5174 → Railway` ready as fallback (already CORS-allowed)
6. **Phone hotspot ready** in case classroom Wi-Fi drops

**All passwords:** `Password123!`

---

## Roles

| Section | Time | Lead | Backup |
|---|---|---|---|
| 1. Intro + business model | 1:00 | Arsenii | Atai |
| 2. Live demo flow | 4:30 | Arsenii | — |
| 3. Schema + 2NF + ER diagram | 1:30 | Joshua | Arsenii |
| 4. Stored procedures + triggers | 1:30 | Joshua | Arsenii |
| 5. Revenue + reporting + CSV export | 0:30 | Shab | Arsenii |
| 6. Tech stack + deployment | 0:30 | Atai | Arsenii |
| 7. Q&A | 1:30 | All | — |

Times are budgets, not floors. Cut sections short if running long.

---

## 1. Intro + business model (1:00)

> "CareConnect is a marketplace that connects elderly people in New York with verified caregivers for in-home visits. Care receivers book a visit, caregivers in their area accept it, the visit happens, and the platform takes a 20% service fee on every completed booking."

> "We built this end-to-end: a MySQL 8 database on Aiven, a Node + Express backend on Railway, and a React + Vite frontend on Vercel. Tonight we're going to show the database-side features that make this actually work — stored procedures for atomic operations, triggers for state guards and audit, and views for read-side performance."

**Click action:** none yet — this is over the title slide.

---

## 2. Live demo flow (4:30)

This is the heart of the demo. Click through it in order.

### 2a. Care receiver creates a booking (1:00)

**Switch to Window 2 (Dorothy logged in).**

> "This is Dorothy. She's 78. Her daughter set her up on CareConnect last month. She needs help with mobility and groceries on Friday."

**Click "Book Care".** Form appears.

> "She picks her saved address — we have one primary, one at her daughter's. Native date and time pickers, large touch targets, plain-language labels. We took accessibility seriously: 18-pixel base font, WCAG-AAA contrast, no placeholder-as-label."

**Fill in:** date = next Saturday, 10am–12pm, address = "Home", notes = "Help with groceries and walk to mailbox."

**Click "Book this appointment".**

> "When she submits, we INSERT a row into the appointment table with status `requested` and caregiver_id NULL. The trigger doesn't fire on insert — only on UPDATE — so this row is silent."

She lands on the appointment detail page. Status badge says "Looking for caregiver."

> "Notice the badge doesn't say 'Requested' — that meant nothing to a 78-year-old in user testing. It says 'Looking for caregiver,' which actually answers her question."

### 2b. Caregiver discovers + accepts (1:00)

**Switch to Window 3 (Maria logged in).**

> "Maria is a verified caregiver, $45 an hour, 4.85-star rating. She lives in Manhattan. Look at her home page."

The discovery feed shows ~25 open requests, including Dorothy's.

> "She sees open requests filtered by distance, sorted closest first. We compute distance with a Haversine SQL function — there's the formula joining the appointment to the address, calculating great-circle distance from Maria's stored ZIP. The radius filter is a single WHERE clause."

**Click into Dorothy's request.** Detail page opens.

> "Maria taps Accept. Now this is the most interesting database moment in the app."

**Click "Accept this request".**

> "Behind that button is a stored procedure called `sp_accept_appointment`. It does an atomic conditional UPDATE — set caregiver_id and status='scheduled' WHERE appointment_id = ? AND status = 'requested' AND caregiver_id IS NULL. If two caregivers tap Accept at the exact same moment, only one wins — the other gets ROW_COUNT() = 0 and we return a 409 Conflict. We don't need a SELECT-then-UPDATE which would have a TOCTOU race."

The status badge flips to "Caregiver confirmed."

### 2c. Trigger fires (silent) (0:30)

> "And right here, two triggers just fired. One: `trg_appointment_state_guard` validated the FSM transition — requested → scheduled is allowed, requested → completed is not. Two: `trg_appointment_audit` wrote a row to the `appointment_audit` table with old_status, new_status, and changed_at. We have a complete history of every state transition for every booking."

If asked, pull up the terminal:

```sql
SELECT * FROM appointment_audit WHERE appointment_id = uuid_to_bin('...') ORDER BY changed_at;
```

### 2d. Chat (0:30)

**Switch back to Window 2 (Dorothy).** Refresh the appointment page. Chat panel appeared.

**Type:** "Hi Maria, the door code is 4471."

**Click Send.**

**Switch to Window 3 (Maria).** Wait 3 seconds (chat polls every 3s). The message appears.

**Type:** "Got it — I'll be there at 10."

**Click Send.**

> "In-app chat. Per-appointment, one row per message in the `message` table. Each row has sender_role denormalized so we don't need to JOIN users on every render. Polling every 3 seconds — for a real production app we'd switch this to WebSockets, but our schema doesn't change."

### 2e. Caregiver completes the visit (1:00)

**Stay on Window 3 (Maria).**

> "Saturday comes, Maria does the visit. She taps Mark complete."

**Click "Mark complete".** Confirmation dialog appears.

**Click confirm.**

> "This calls `sp_complete_appointment`. It's a multi-statement procedure inside one transaction: it updates the appointment status to 'completed', it reads Maria's hourly_rate_cents from her caregiver row, calculates total = hours × rate, splits 80% to caregiver_payout_cents and 20% to platform_fee_cents, and inserts a row into the `payment` table — all atomically. If any step fails, the whole thing rolls back."

> "There's also a CHECK constraint on the payment table that enforces `amount_cents = caregiver_payout_cents + platform_fee_cents`, so the split has to balance or the INSERT fails."

Status flips to "Visit complete." If you want to show off, sign out and sign in as admin:

### 2f. Admin sees revenue update (0:30)

**Switch to Window 1 (Admin, on /admin/revenue).** Refresh.

> "And here's the platform-level view. Total platform revenue is now ~$897 across 45 paid bookings — including the one Maria just completed. Each row is a payment from a real visit. The CSV export here downloads everything Excel-ready, fulfilling the rubric's reporting requirement."

**Click "Download CSV".** A file lands. Don't open it during demo unless asked.

---

## 3. Schema + 2NF + ER diagram (1:30)

**Switch to GitHub repo, `docs/data-model.md`.** The Mermaid ER diagram renders inline.

**Joshua takes the mic.**

> "Twelve tables, all in 3NF — we documented the normalization analysis table-by-table in `docs/normalization.md`. Primary keys are BINARY(16) UUIDs using `uuid_to_bin()` and `bin_to_uuid()` — half the index size of hyphenated strings, no collision risk."

> "The interesting design decision: caregiver_id and care_receiver_id ARE the user_id. We don't have a separate profile table with its own ID and a foreign key — the role-specific row's PK is the same UUID as the users row. One less JOIN on every query."

> "Foreign keys: appointment.caregiver_id is nullable because requests start unassigned. Address belongs to care receivers only. Payment has a UNIQUE constraint on appointment_id — one payment per booking max."

---

## 4. Stored procedures + triggers (1:30)

**Switch to GitHub, `database/aiven-init.sql`, scroll to the procedures section.**

**Joshua continues.**

> "Three stored procedures power the appointment lifecycle: sp_accept, sp_cancel, sp_complete. They live in the database, not the application. Why? Atomicity. The accept procedure has the UPDATE inside it — even if two API instances race, only one UPDATE matches the WHERE clause. The complete procedure is a transaction that updates the appointment AND inserts a payment row — neither happens without the other."

**Show sp_complete_appointment.** Read the key lines:

```sql
SET v_total = ROUND(v_hours * v_rate_cents);
SET v_platform_fee = ROUND(v_total * p_platform_fee_bps / 10000);
SET v_payout = v_total - v_platform_fee;
```

> "The take-rate is parameterized in basis points — 2000 bp = 20%. Changing the platform fee is one env var, no schema change. Production uses 20% but we could A/B test 15% vs 25% on different cohorts."

**Show triggers section.**

> "Two triggers. State guard prevents impossible transitions like completed → requested. Audit log writes one row to appointment_audit per status change. The professor can SELECT * FROM appointment_audit and see the entire history of every booking we've shown today."

---

## 5. Revenue + reporting (0:30)

**Switch to Window 1 (admin/revenue).**

**Shab takes the mic.**

> "Revenue dashboard, three metrics: gross billings (what flowed through the platform), platform revenue (our 20%), caregiver payouts (the 80%). Top caregivers ranked by platform fee they generated. Two views power this — `v_caregiver_stats` aggregates per-caregiver totals using GROUP BY, and the by-day table is a simple GROUP BY DATE on payment.created_at."

> "CSV export streams payment rows for accounting. Header includes paid_at, gross, payout, fee, currency. Excel-compatible."

---

## 6. Tech stack + deployment (0:30)

**Atai takes the mic.**

> "Frontend: React 19, Vite 8, Tailwind CSS, deployed on Vercel. Backend: Node + Express, Knex query builder over native mysql2 driver — we don't use an ORM, all SQL is hand-written, deployed on Railway. Database: MySQL 8 on Aiven, free tier, 1 GB. All three platforms auto-deploy from GitHub main."

> "Authentication: JWT with a 60-minute access token and a 7-day refresh token, signed with HS256. Stored client-side in localStorage. Architecture decision documented in docs/interview-prep/adr-001-jwt-localstorage.md."

---

## 7. Q&A (1:30)

### Anticipated questions and answers

**Q: Why MySQL and not Postgres?**
> "Project rubric required a relational database. We picked MySQL because Aiven offers a 1 GB free tier with no credit card and the team had familiarity with mysql2. Postgres would have worked equally well — our SQL is portable except for `uuid_to_bin/bin_to_uuid` which is a MySQL 8 built-in."

**Q: Why no ORM?**
> "Project rubric explicitly forbade ORMs — the assignment is to learn SQL, and ORMs hide it. Knex is a query builder, not an ORM. We don't define classes that map to tables, no lazy loading, no relationship resolution. Every query in the codebase is hand-written SQL the LLM can't shortcut around."

**Q: Why localStorage for the JWT and not httpOnly cookies?**
> "ADR-001 — we wrote it up explicitly. The trade-off is XSS exposure (localStorage) vs CSRF complexity (cookies). For a marketplace where the API and the SPA are on different domains (Railway and Vercel), cookies require SameSite=None, CSRF tokens, and a top-of-app interceptor. localStorage with strict input sanitization (we use dompurify-equivalent server-side) was simpler for v1. Production at scale would migrate to httpOnly + refresh-rotation."

**Q: How do you handle a caregiver canceling on the customer mid-visit?**
> "Right now sp_cancel can run from either side, with a role check inside the procedure. We don't yet model partial-completion or refund proration. That's noted in `docs/diagrams.md` user-journey as a future iteration."

**Q: Show me a window function.**
> "Sure." (If asked, run on the terminal:)
```sql
SELECT first_name, last_name,
       SUM(p.amount_cents) AS gross,
       RANK() OVER (ORDER BY SUM(p.amount_cents) DESC) AS rank
FROM caregiver c
JOIN appointment a ON a.caregiver_id = c.caregiver_id
JOIN payment p ON p.appointment_id = a.appointment_id
WHERE p.status = 'paid'
GROUP BY c.caregiver_id, c.first_name, c.last_name
ORDER BY rank LIMIT 5;
```

**Q: What's the schema diagram tool?**
> "Mermaid. Renders inline on GitHub, no external tooling. The ER diagram in docs/data-model.md is generated from the schema by hand but stays in sync because we update it whenever we touch the schema."

---

## What to do if something breaks

**Vercel returns 500:** Switch to localhost. We have `npm run dev` ready, frontend already pointed at Railway via `.env.local`. Hit `localhost:5173` and continue.

**Railway returns 502:** Cold start. Wait 15 seconds and refresh. If still down, switch to a screenshot we'll have prepared.

**Aiven returns "too many connections":** Restart Railway from the dashboard. Worst case, switch to a recorded video segment.

**Internet drops entirely:** Switch to phone hotspot. Have the recorded tech video ready as ultimate backup.

**Stored procedure throws an error:** Don't try to debug live. Pivot to "this is what the proc does" and walk through the SQL on screen instead. Recover credibility with the next click.

---

## After the demo

If we have extra time AND the prof is engaged:
- Show `data-model.md` ER diagram inline
- Open `database/aiven-init.sql` and scroll through the trigger definitions
- Open `docs/normalization.md` for the 3NF analysis
- Show the CSV file we exported earlier in Excel

Don't over-extend. Better to land clean with 30 seconds left than miss a beat.
