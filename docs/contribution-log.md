# Individual Contribution Log — Arsenii Chan

> CSC33600 Spring 2026 · CareConnect team project

This document records substantive engineering work I personally shipped on the CareConnect repository. It exists to give the grader a clear, dated record of individual contribution that can be evaluated separately from the group demo.

The full git history with diffs is the source of truth: <https://github.com/ArseniiChan/CareConnect/commits/main?author=ArseniiChan>

## Snapshot as of May 2 2026

- **Commits authored:** 7 (out of 9 total in the repo). The two non-Arsenii commits are frontend scaffolding (`55d9d46`, `b1d8494`) authored by another teammate.
- **Major surfaces I own:** Express backend, database schema design, security audit, schema migration to TiDB Cloud, project planning document.
- **Approximate code volume:** ~6,000 lines of source code (excluding generated lockfiles), plus ~2,000 lines of documentation.

## Timeline

### March 31 2026 — Initial backend foundation

**Commit:** `5aac09c — Initial backend setup: Express server, MySQL schema, API routes, seeds`

Set up the entire backend project from a blank `npm init`:

- Express 5 application with full middleware stack: `helmet`, `cors`, `hpp`, `morgan`, `express-rate-limit`, custom validation middleware (Joi), central error handler with custom `ApiError` class.
- Knex.js migration system. Initial 20-table relational schema (later replaced — see April 3 entry).
- JWT auth with access-token + refresh-token rotation. `bcryptjs` password hashing at 12 rounds.
- Service layer pattern: thin controllers, business logic in `src/services/*.service.js`, Knex queries in `src/models/*.model.js`. Decoupled enough that services are callable without HTTP.
- 60+ API endpoints across 9 controllers, every one with a Joi validation schema.
- Swagger UI + OpenAPI 3.0 spec at `/api/docs`.
- Three seed files (certifications, service types, demo users with addresses and certifications).

**Files:** entire `src/`, `database/migrations/`, `database/seeds/`, `server.js`, `knexfile.js`, initial `package.json`.

### March 31 2026 — Bug fixes from first round of API testing

**Commit:** `51602b6 — Fix 4 API bugs: route ordering, NaN validation, review routes, camelCase mapping`

- Express 5 route-ordering bug: `GET /users/profile` was being matched by `GET /users/:id` because `:id` was registered first. Moved literal segments above parameterized ones.
- `parseInt(undefined) → NaN → SQL crash` on caregiver search. Added explicit guard before parsing query params.
- Reviews caregiver-listing route was missing despite the model implementing `listForUser`. Added the route + controller path.
- API accepted camelCase request bodies but Knex needed snake_case columns. Added an explicit field-mapping helper in the address controller (chose explicit mapping over global `wrapIdentifier` to avoid surprise effects).

### March 31 2026 — Appointment lifecycle state machine

**Commit:** `46c50d0 — Implement appointment lifecycle state machine + review system`

Built the most complex feature of the backend:

- Finite state machine for appointment status: `pending → accepted → in_progress → completed`, with `cancelled` and `no_show` branches. Centralized in `src/services/appointment.service.js` (~480 lines).
- `VALID_TRANSITIONS` map enforces every transition; invalid transitions throw `ApiError.badRequest` with a human-readable message that names the current state and the allowed next states.
- **Race-safe accept** via atomic conditional UPDATE (optimistic locking pattern). The `WHERE status='pending' AND caregiver_id IS NULL` clause means two caregivers tapping accept simultaneously can never both win — `affectedRows === 0` indicates the lost race.
- Review system: post-completion reviews, 48-hour author-edit window, per-appointment uniqueness constraint, cascade update of caregiver `average_rating`.
- 9 lifecycle bugs found and fixed in the same session: ownership checks (`_requireAssignedCaregiver`), participant checks (`_requireParticipant`), ID-resolution helpers for the profile-table indirection problem.

### March 31 2026 — Security audit (12 vulnerabilities, all fixed)

**Commit:** `a1835ad — Security audit: fix 12 vulnerabilities`

Performed a full code review of the auth, controllers, services, and socket layers as an attacker would. Found and fixed:

| Severity | Finding | Fix |
|---|---|---|
| Critical | SQL injection in admin date-range query (string interpolation of `days`) | Parameterized `db.raw('DATE_SUB(NOW(), INTERVAL ? DAY)', [days])` |
| Critical | SQL injection in geo Haversine helper (lat/lon interpolated) | Returned `{ sql, bindings }` so caller passes via `db.raw()` |
| High | Race condition in caregiver accept (read-then-write) | Atomic conditional UPDATE — see appointment lifecycle entry |
| High | Mass-assignment in user profile update (`role`, `is_active`, `password_hash` writable from request body) | `pick()` whitelist of `[first_name, last_name, phone, avatar_url]` |
| High | Socket.io chat eavesdropping (any user could `join_conversation` for any conversation ID) | `ConversationModel.isParticipant()` check before `socket.join()` |
| High | Socket.io tracking privacy (any user could subscribe to any caregiver's live location) | Participant verification on `track_appointment` and `update_location` |
| Medium | Caregiver certification/availability mutation endpoints had no ownership check | `requireOwnership()` helper that compares profile owner to `req.user.id` |
| Medium | Mass-assignment in review update | `pick()` whitelist of editable fields |
| Medium | Chat pagination had no upper limit (DoS via `?limit=999999`) | `Math.min(100, parsedLimit)` |
| Medium | Stored XSS — request bodies weren't sanitized before DB insert | New `sanitizeObject()` middleware that HTML-encodes all string values pre-validation |
| Low | Default `JWT_SECRET` accepted in production | Boot-time check against known weak values; `process.exit(1)` if production |
| Low | Path traversal in file upload (filename-based extension) | MIME-type-based extension mapping |

Each finding has a matching test/repro in `docs/interview-prep/security-audit-report.md`.

### March 31 2026 — Interview-prep documentation

**Commit:** `b47a662 — Add interview prep docs: security audit report + technical decisions`

Wrote two reference documents under `docs/interview-prep/`:

- `security-audit-report.md` — full writeup of every finding, the attacker scenario, and the fix.
- `technical-decisions.md` — short rationale for each major architectural choice.

### April 3 2026 — TiDB Cloud schema migration

**Commit:** `60c1a04 — Adapt backend to Joshua's TiDB Cloud schema`

Migrated the entire backend to a teammate's pre-existing TiDB Cloud schema, mid-build:

- Schema went from 20 tables to 10. Reviews, notifications, caregiver_availability, caregiver_locations, appointment_tasks, payments, conversations, conversation_participants, payment_methods, service_types — all gone.
- Primary keys went from auto-increment integers to `binary(16)` UUIDs. Created `src/utils/uuid.js` with `toBin()`, `fromBin()`, `whereUuid()`, `bufferToUuid()`, and `convertBuffers()` helpers using TiDB's built-in `uuid_to_bin()` / `bin_to_uuid()` functions.
- **Auth model redesign:** in the new schema, `users.user_id` is the SAME UUID as `caregiver_id` or `care_receiver_id`. This removes the entire profile-table indirection that had caused recurring bugs in v1 (resolving profile IDs to user IDs for notifications, reviews, ownership checks). After this redesign, `req.user.id` equals the foreign key in every appointment row — direct comparison, no joins.
- Rewrote 6 models, 3 services (auth, appointment, chat), 7 controllers, 3 validation files, and the socket layer.
- Removed 12+ files that depended on missing tables. Created the auth-table migration (`database/migrations/20260403000001_add_users_auth.js`) since the live TiDB schema had no users/auth concept.
- Verified the entire app loads cleanly via Node module-resolution check (no `require()` errors after the rewrite).

This is the migration story I would walk an interviewer through to demonstrate "adapting to ambiguity" or "working with constraints I didn't choose."

### May 2 2026 — Project plan, critical bug fixes, deploy prep

**Commit:** `9fe95d1 — PROJECT_PLAN v2 plus backend fixes for caregiver discovery and CORS`

Two distinct workstreams in one commit:

**Documentation:**
- Wrote `PROJECT_PLAN.md` v2 — a 1,500-line canonical handoff document covering: current-state audit, scope-cut rationale, system architecture (Mermaid), database schema (Mermaid ERD), 6-step demo flow, FSM diagram, per-person workplans with acceptance criteria and copy-paste commands, demo script, risk register, success criteria, timeline, full API reference with canonical response envelope, env-var reference, JWT and UUID handling reference, FAQ, glossary, and a "first 30 minutes" onboarding appendix. The plan was reviewed by an internal LLM council (5 advisors with peer review) and a separate ChatGPT critique pass; every legitimate finding was applied.
- Rewrote `README.md` to frame the repo as a full-stack project (frontend + backend + docs) instead of just a backend.

**Backend bug fixes caught by the ChatGPT review:**
- **Caregiver discovery query.** The `listForUser` model method had `WHERE caregiver_id = userId` for caregivers, which returned an empty list when querying `?status=requested` — caregivers can never own a `requested` row by FSM rules. Reworked the query: when `role==='caregiver' && status==='requested'`, return `WHERE caregiver_id IS NULL AND status='requested'` (the discovery feed). For any other status, return the caregiver's own assignments. This is documented as the "caregiver discovery semantic" in §13.2 of the plan.
- **Multi-origin CORS.** The CORS middleware accepted only a single origin, but Vercel issues different URLs for preview deploys vs production, plus dev runs at `localhost:5173`. Switched to a comma-separated allowlist parsed from `CORS_ORIGIN`, with a function-based origin-check that allows curl/server-to-server (no `Origin` header).

**Files:** `PROJECT_PLAN.md`, `README.md`, `src/app.js`, `src/models/appointment.model.js`.

### May 2 2026 — JWT storage decision (ADR-001)

**Commit:** _pending_

- Wrote `docs/interview-prep/adr-001-jwt-localstorage.md` — formal Architecture Decision Record covering the JWT-in-localStorage choice, the three alternatives considered (httpOnly cookies, in-memory + httpOnly refresh, server sessions), the threat-model reasoning, the mitigations against the XSS exposure, and the conditions under which we would migrate to the production-grade pattern.
- Started this contribution log.

## Architecture decisions I made and own

These appear in the codebase, the project plan, or the ADR set:

1. **Express 5 over NestJS / Fastify** — developer velocity, team familiarity, mature middleware ecosystem.
2. **Knex.js over Sequelize / TypeORM** — explicit SQL-shaped code; learning the database is part of the assignment.
3. **Service-layer pattern** — testable business logic, controller-agnostic, REST and WebSocket can share `ChatService`.
4. **JWT with refresh-token rotation over server sessions** — stateless, no Redis dependency for v1.
5. **JWT in `localStorage` over httpOnly cookies** — see ADR-001.
6. **Optimistic locking (atomic conditional UPDATE) for the accept-race** — chosen over `SELECT FOR UPDATE` because it avoids holding row locks across the round-trip.
7. **TiDB schema migration approach** — adapt the application code to the existing schema rather than fight it; preserve the new `user_id == profile_id` invariant to remove old profile-table indirection.
8. **Scope cut from 10 features to 5** — see `PROJECT_PLAN.md` §3.
9. **Demote AI integration to stretch-goal status** — based on team-capacity reality, not feature value.
10. **Tuesday non-Arsenii integration gate** — force discovery of integration bugs (CORS, response-shape, env-var) in front of teammates rather than in front of the grader.

## Open / in-flight

- ADR-002: TiDB schema migration narrative (planned, not yet written)
- Office-hours conversation with the professor about contribution distribution (planned for Wednesday May 7, per `PROJECT_PLAN.md` §8.0)

## How to verify any of the above

```bash
# Clone
git clone https://github.com/ArseniiChan/CareConnect.git
cd CareConnect

# View my commits with diffs
git log --author=ArseniiChan -p

# View the security audit
cat docs/interview-prep/security-audit-report.md

# View the architecture decisions
cat docs/interview-prep/adr-001-jwt-localstorage.md
cat docs/interview-prep/technical-decisions.md

# View the project plan
cat PROJECT_PLAN.md
```

---

*Maintained by Arsenii Chan. Last updated May 2 2026.*
