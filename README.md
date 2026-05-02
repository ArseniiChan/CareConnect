# CareConnect

> On-demand home care marketplace. CSC33600 capstone, Spring 2026.

**[📋 PROJECT_PLAN.md](./PROJECT_PLAN.md)** ← the canonical source of truth for what we're building, who's doing what, and the demo plan. Read it before this README.

---

## What it is

A platform that connects older adults with verified home care attendants. Care receivers book, caregivers accept, both parties chat in-app, the caregiver marks the visit complete. Built as a class project that demonstrates end-to-end product engineering: state-machine design, real-time chat, security audit, schema migration, cloud deployment.

## Live demo

| | URL |
|---|---|
| Frontend | `https://<TBD — Atai fills in after first Vercel prod deploy>` |
| Backend API | `https://<TBD — Arsenii fills in after first Railway deploy>` |
| API docs (Swagger) | `https://<backend-url>/api/docs` |

**Demo credentials** (after `npm run seed`):

| Role | Email | Password |
|---|---|---|
| Care Receiver | `dorothy.chen@example.com` | `Password123!` |
| Caregiver | `maria.garcia@example.com` | `Password123!` |
| Caregiver | `james.wilson@example.com` | `Password123!` |
| Admin | `admin@careconnect.com` | `Password123!` |

## Repo layout

```
CareConnect/
├── frontend/                ← Vite + React 19 SPA, deployed to Vercel
│   ├── src/
│   │   ├── api/             ← fetch() wrapper + endpoint helpers
│   │   ├── auth/            ← AuthContext + ProtectedRoute
│   │   ├── pages/           ← LoginPage, BookPage, ChatPage, etc.
│   │   └── components/      ← StatusBadge, NavBar, AppointmentCard
│   └── ...
│
├── src/                     ← Backend Node.js / Express 5, deployed to Railway
│   ├── config/              ← database, socket, swagger
│   ├── middleware/          ← auth, RBAC, rate limit, validate, error handler
│   ├── routes/              ← Express route definitions
│   ├── controllers/         ← Request/response handling (thin)
│   ├── services/            ← Business logic (testable without HTTP)
│   ├── models/              ← Knex queries
│   ├── validations/         ← Joi request schemas
│   ├── socket/              ← Socket.io chat handler
│   └── utils/               ← ApiError, catchAsync, geo, pagination, uuid
│
├── database/
│   ├── migrations/          ← Knex migrations (auth users table is one we added)
│   └── seeds/               ← Demo data: certifications, users, addresses
│
├── docs/
│   ├── swagger.yaml         ← OpenAPI 3.0 spec
│   └── interview-prep/      ← Security audit report, technical decisions
│
├── PROJECT_PLAN.md          ← THE plan. Read it.
├── server.js                ← Backend entry point (HTTP + WebSocket)
├── knexfile.js              ← Knex config
├── package.json
└── README.md                ← (you are here)
```

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, vanilla CSS (Aurora theme) |
| Backend | Node.js 20+, Express 5, Knex.js (SQL query builder) |
| Database | TiDB Cloud (MySQL 8 dialect, port 4000, TLS) |
| Auth | JWT — 60-min access token + 7-day refresh, bcrypt 12 rounds |
| Real-time | Socket.io for per-appointment chat (REST fallback via polling) |
| Validation | Joi |
| Security | helmet, cors, express-rate-limit, hpp, XSS sanitization middleware |
| Frontend deploy | Vercel |
| Backend deploy | Railway (long-lived Express + Socket.io process) |
| Docs | Swagger UI + OpenAPI 3.0 |

## Demo scope (the five flows that work)

This is v1. See [§18 of PROJECT_PLAN.md](./PROJECT_PLAN.md#18-appendix-b-whats-in-v2-and-why-we-cut-it-from-v1) for v2 roadmap.

1. **Register** — new user signs up as `caregiver` or `care_receiver`
2. **Book** — care receiver creates an appointment with address, time, notes
3. **Accept** — caregiver claims a `requested` appointment (race-safe atomic update)
4. **Chat** — both parties exchange messages persisted to the database
5. **Complete** — caregiver marks the appointment `completed`

The appointment status lifecycle:

```
requested → scheduled → completed
    ↓           ↓
cancelled   cancelled
```

## Quick start (local dev)

### Prerequisites
- Node.js 20+
- TiDB Cloud account OR a local MySQL 8 instance (the `mysql2` driver works for both)

### Backend

```bash
git clone https://github.com/ArseniiChan/CareConnect.git
cd CareConnect
npm install

# Configure environment
cp .env.example .env
# Edit .env — see PROJECT_PLAN.md §14.1 for the full env-var list

# Apply migrations (creates the `users` auth table)
npm run migrate

# Seed demo data
npm run seed

# Start the dev server
npm run dev
# Backend runs at http://localhost:3000
# API:     http://localhost:3000/api/v1
# Swagger: http://localhost:3000/api/docs
# Health:  http://localhost:3000/health
```

### Frontend

```bash
cd frontend
npm install

# Configure environment
echo "VITE_API_URL=http://localhost:3000" > .env

# Start the dev server
npm run dev
# Frontend runs at http://localhost:5173
```

### Smoke test the API

```bash
# Health check
curl http://localhost:3000/health

# Login as Dorothy (returns JWT pair)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dorothy.chen@example.com","password":"Password123!"}'
```

## Deployment

See [PROJECT_PLAN.md §8.1 (backend)](./PROJECT_PLAN.md#81-arsenii--backend--database) and [§8.3.3 (frontend)](./PROJECT_PLAN.md#833-deploying-the-frontend-to-vercel-replaces-the-old-netlify-config) for the full deploy runbooks.

**Backend (Railway):**
```bash
npm i -g @railway/cli
railway login && railway init
# Set env vars (see PROJECT_PLAN.md §14.1) — order matters; do this BEFORE `railway up`
railway up
railway domain  # generates the public URL
```

**Frontend (Vercel):**
```bash
cd frontend
npm i -g vercel
vercel login && vercel
vercel env add VITE_API_URL production  # paste Railway URL
vercel --prod
```

## API at a glance

All endpoints live under `/api/v1`. All `:id` params are UUID strings (e.g., `550e8400-e29b-41d4-a716-446655440000`). Full reference in [PROJECT_PLAN.md §13](./PROJECT_PLAN.md#13-reference-api-endpoints).

```
# Auth
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
GET    /auth/me

# Appointments (the core flow)
POST   /appointments                       # create (care_receiver only)
GET    /appointments                       # list (filtered by role)
GET    /appointments/:id                   # detail
POST   /appointments/:id/accept            # caregiver claims an open request
POST   /appointments/:id/decline           # caregiver passes
POST   /appointments/:id/complete          # caregiver marks done
POST   /appointments/:id/cancel            # either party cancels (with reason)

# Per-appointment chat
GET    /appointments/:id/messages
POST   /appointments/:id/messages

# Caregivers
GET    /caregivers
GET    /caregivers/:id
POST   /caregivers/:id/certifications
DELETE /caregivers/:id/certifications/:certId

# Care-receiver addresses
GET    /addresses
POST   /addresses
PATCH  /addresses/:id
DELETE /addresses/:id

# Admin
GET    /admin/dashboard
GET    /admin/appointments/stats?period=30d
```

WebSocket events (under `/socket.io/`):

```
# Client → server
join_appointment_chat   { appointmentId }
send_message            { appointmentId, content }
typing                  { appointmentId }

# Server → client
new_message             { id, sender_role, message_text, sent_at, ... }
user_typing             { userId, appointmentId }
```

## Security

This project went through a 12-finding security audit. See [`docs/interview-prep/security-audit-report.md`](./docs/interview-prep/security-audit-report.md) for the full writeup. The fixes:

- SQL injection in admin queries → parameterized queries
- Mass-assignment in user/review updates → field whitelisting via `pick()`
- Race condition in caregiver accept → atomic conditional UPDATE (optimistic locking)
- Weak JWT secret detection at boot → process exits in production with default values
- Path traversal in file uploads → MIME-based extension mapping (no user-controlled extensions)
- XSS sanitization middleware on all request bodies
- Socket-eavesdropping prevention → participant verification before joining rooms
- Mass-assignment in profile updates → whitelist
- Pagination DoS protection → max 100 items per page
- ... and more

## Database schema

Joshua's TiDB schema. Eleven tables, all `binary(16)` UUID primary keys. ER diagram and migration translation table are in [PROJECT_PLAN.md §5](./PROJECT_PLAN.md#5-the-database--joshuas-tidb-schema).

Key fact: in our auth model, `users.user_id == caregiver_id == care_receiver_id` (the same UUID). No profile-table indirection.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Backend with hot reload (nodemon) |
| `npm start` | Backend production start |
| `npm run migrate` | Apply pending DB migrations |
| `npm run migrate:rollback` | Undo last migration |
| `npm run seed` | Load demo data (certifications, users, addresses) |
| `npm run lint` | ESLint on `src/` |
| `npm test` | Jest test suite (currently empty — not in v1 scope) |

Frontend scripts are in `frontend/package.json` (`dev`, `build`, `preview`, `lint`).

## Team

| Name | Role |
|---|---|
| Arsenii Chan | Backend & Database |
| Joshua Immordino | Reporting & Analytics, TiDB owner |
| Atai Kydyrov | Deployment + frontend pairing |
| Axyl Frederick | Frontend & client-side |
| Faisal / Abdullah Zidan | Backend pairing + AI integration (stretch) |

For who is doing what this week, see [PROJECT_PLAN.md §8](./PROJECT_PLAN.md#8-per-person-workplan).

## Course

CSC33600 — Database Systems — City College of New York — Spring 2026.

## License

ISC. See `package.json`.
