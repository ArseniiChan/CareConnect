# Tests

Test directories are intentionally empty in v1. Automated tests are not part of the v1 demo scope — see [`PROJECT_PLAN.md §16` (FAQ)](../PROJECT_PLAN.md#16-faq) for rationale.

## v1 quality gate (manual)

The acceptance criteria for the v1 demo are defined in [`PROJECT_PLAN.md §11`](../PROJECT_PLAN.md#11-success-criteria) — five binary checks (C1–C5) that are verified manually against the deployed app:

- **C1.** Live registration completes in under 60 seconds with no console errors.
- **C2.** Booking → caregiver-accept round trip works across two browsers.
- **C3.** Per-appointment chat messages persist across refresh.
- **C4.** Mark-complete updates status in both windows.
- **C5.** Architecture diagram matches deployed reality.

The Tuesday non-Arsenii integration gate ([`PROJECT_PLAN.md §12`](../PROJECT_PLAN.md#12-timeline--checkpoints)) is the catch-all for integration bugs.

## Backend smoke test (curl)

Quick sanity check against a deployed backend:

```bash
# Health
curl https://<railway-url>/health

# Login (Dorothy)
curl -X POST https://<railway-url>/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dorothy.chen@example.com","password":"Password123!"}'
```

Expected response shapes are documented in [`PROJECT_PLAN.md §13.0`](../PROJECT_PLAN.md#130-canonical-response-envelope-read-this-before-writing-frontend-code).

## v2 — automated test plan (deferred)

When automated tests are added post-demo, the layout is:

```
tests/
├── unit/         ← Service-layer logic (FSM transitions, UUID helpers, etc.)
├── integration/  ← HTTP-level (supertest against the Express app)
└── fixtures/     ← Reusable seed data, mocked TiDB rows, JWT factories
```

First targets when v2 starts:

1. `unit/appointment.service.test.js` — FSM transitions and the race-safe accept (this is the most-likely-to-regress logic).
2. `integration/auth.flow.test.js` — register → login → refresh → me.
3. `integration/appointment.flow.test.js` — full §11 C1–C4 as a programmatic flow.

Stack: Jest + Supertest, already in `devDependencies` in `package.json`.
