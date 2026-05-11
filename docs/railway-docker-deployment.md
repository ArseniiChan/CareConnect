# Railway — Docker-based Deployment

How to deploy CareConnect to Railway as two Docker services (backend + frontend), with the database hosted externally on Aiven.

This is the canonical deployment guide for the Docker path. The repo also supports Railway's auto-detection (railpack) and Vercel for the frontend — those continue to work — but this doc covers the Docker path the spec asks for.

---

## Architecture

```
                    ┌──────────────────────────┐
                    │  Railway project         │
                    │                          │
   browser   ───►   │  ┌────────────────────┐  │
                    │  │ frontend service   │  │
                    │  │ (Dockerfile,       │  │   port 80
                    │  │  nginx + Vite SPA) │  │
                    │  └─────────┬──────────┘  │
                    │            │ /api/*      │
                    │            ▼             │
                    │  ┌────────────────────┐  │
                    │  │ backend service    │  │
                    │  │ (Dockerfile,       │  │   port 3000
                    │  │  Node + Express +  │  │
                    │  │  Socket.IO)        │  │
                    │  └─────────┬──────────┘  │
                    │            │             │
                    └────────────┼─────────────┘
                                 │ MySQL (TLS)
                                 ▼
                    ┌──────────────────────────┐
                    │   Aiven MySQL 8          │
                    │   (managed, external)    │
                    └──────────────────────────┘
```

Two Railway services in one project, one external database. No DB container — the database lives on Aiven.

---

## Files in this PR

| Path | Purpose |
|---|---|
| `Dockerfile` | Backend image. Node 22 alpine, installs prod deps only, starts `npm start`. |
| `frontend/Dockerfile` | Frontend image. Multi-stage: Node 22 alpine build → nginx alpine serve. |
| `frontend/nginx.conf` | SPA fallback for React Router. Long-cache `/assets/*`, no-cache `index.html`. |
| `docker-compose.yml` | Local-only composition. Brings up both services for `docker compose up --build`. |
| `.dockerignore` | Excludes node_modules, .env, frontend source, tests, docs from the backend build context. |
| `frontend/.dockerignore` | Excludes node_modules, dist, .env from the frontend build context. |
| `.env.example` | Backend env-var template (no secrets). Includes `FRONTEND_URL`, all `DB_*`, `JWT_SECRET`, etc. |
| `frontend/.env.example` | Frontend env-var template. Only `VITE_API_BASE_URL`. |

---

## Local test

Bring both services up with one command:

```bash
docker compose up --build
```

URLs:

| Service | URL | Container port | Host port |
|---|---|---|---|
| Frontend | http://localhost:8080 | 80 | 8080 |
| Backend | http://localhost:3000 | 3000 | 3000 |
| Backend health | http://localhost:3000/health | — | — |
| Backend docs | http://localhost:3000/api/docs | — | — |

The backend reads its DB credentials from `.env` at the repo root (mounted via `env_file:` in docker-compose.yml). You need to create that file before bringing the stack up:

```bash
cp .env.example .env
# then fill in DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
```

If the backend can't reach the database it will exit on boot with "Database connection failed" — that's a config issue, not a Docker issue.

To stop:

```bash
docker compose down
```

---

## Railway — create the two services

### 1. Backend service

In Railway dashboard → **New Service** → **Deploy from GitHub repo** → pick `ArseniiChan/CareConnect`.

Configure:

| Setting | Value |
|---|---|
| Root Directory | `/` (repo root) |
| Builder | Dockerfile |
| Dockerfile Path | `Dockerfile` |
| Port | `3000` |

Environment variables (Variables tab):

```
NODE_ENV=production
PORT=3000

# Database (Aiven)
DB_HOST=mysql-198cb31e-careconnect-2032.l.aivencloud.com
DB_PORT=13341
DB_USER=api
DB_PASSWORD=<from Aiven dashboard>
DB_NAME=CareConnect
DB_POOL_MIN=2
DB_POOL_MAX=20

# Auth
JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_ACCESS_EXPIRY=60m
JWT_REFRESH_EXPIRY=7d

# Frontend origin — fill in AFTER the frontend service has been deployed
# and assigned a Railway domain. Multiple origins can be comma-separated.
FRONTEND_URL=

# Marketplace
PLATFORM_FEE_PERCENT=20

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional services (leave blank to disable)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

Deploy. Railway builds the image, runs the container, and assigns a public domain like `careconnect-backend-production-xxxx.up.railway.app`. **Note the URL — the frontend needs it.**

### 2. Frontend service

In the same Railway project → **New Service** → **Deploy from GitHub repo** → same repo.

Configure:

| Setting | Value |
|---|---|
| Root Directory | `/frontend` |
| Builder | Dockerfile |
| Dockerfile Path | `Dockerfile` (resolved relative to Root Directory, so this is `/frontend/Dockerfile`) |
| Port | `80` |

Build-time variables (Variables tab — these need to be set BEFORE the first build because Vite inlines them at build time):

```
VITE_API_BASE_URL=https://careconnect-backend-production-xxxx.up.railway.app
```

Use the backend Railway URL from step 1, NOT localhost.

Deploy. Railway builds the SPA, hands it to nginx, and assigns a public domain like `careconnect-frontend-production-yyyy.up.railway.app`.

### 3. Wire the two services together

After both services are live:

1. Copy the frontend's public Railway domain
2. Go back to the **backend** service → Variables → set `FRONTEND_URL` to that domain
3. Redeploy the backend (Railway will pick up the new env var on next deploy; or click "Redeploy")

This step is necessary because CORS on the backend rejects any origin not on the allowlist. Without `FRONTEND_URL`, browsers loading the production frontend will get "Failed to fetch" on every API call.

---

## Updating an env var changes which side?

| Variable | Where set | When it takes effect |
|---|---|---|
| `VITE_API_BASE_URL` | Frontend service, **build-time** | On next frontend build (push a commit OR click Redeploy) |
| `FRONTEND_URL` | Backend service, runtime | On next backend deploy/restart |
| `DB_*` | Backend service, runtime | On next backend deploy/restart |
| `JWT_SECRET` | Backend service, runtime | On next backend deploy/restart — but rotating this invalidates all existing tokens |

Frontend env vars are baked into the JS bundle. If `VITE_API_BASE_URL` changes, you have to rebuild. Setting it in the Railway UI alone doesn't update the running site — Railway needs to trigger a new build.

---

## Security

- **Never commit `.env`** — `.dockerignore` excludes it from the build context, but it's also excluded by `.gitignore`. Both are belt-and-suspenders.
- **Don't put DB credentials, JWT_SECRET, or Gemini API key in the frontend.** Anything in `frontend/` that starts with `VITE_` is shipped to the browser. Public URLs only.
- **Rotate `JWT_SECRET`** if you suspect a leak. All existing tokens become invalid (which is the point).
- **Aiven enforces TLS** by default. The backend's mysql2 driver uses `ssl: { rejectUnauthorized: false }` in production — verifies the connection is encrypted but doesn't pin the CA. Acceptable for v1; tighten later by mounting Aiven's CA cert.

---

## Troubleshooting

**Backend exits immediately with "FATAL: JWT_SECRET is missing or set to a known weak value"**
You forgot to set `JWT_SECRET` on the backend service or used a placeholder value. Generate a real one and set it.

**Frontend loads but every API call fails with "Failed to fetch"**
Backend's `FRONTEND_URL` doesn't include the frontend's Railway origin. Fix: set `FRONTEND_URL` on the backend service (comma-separated list is supported for multiple origins) and redeploy.

**Frontend builds but `VITE_API_BASE_URL` is undefined at runtime**
The build-time variable wasn't set BEFORE the build. Set it in Railway, then trigger a new build (push a commit or click Redeploy on the frontend service).

**`/login`, `/admin/revenue`, etc. return 404 when refreshed**
nginx isn't using the SPA-fallback config. Check that `frontend/nginx.conf` is copied to `/etc/nginx/conf.d/default.conf` in the Dockerfile (the `COPY nginx.conf …` line is present).

**Backend `/health` is 200 but `/api/v1/*` returns 500 with "Unknown column"**
Database schema is out of date. Run the migration scripts on Aiven:
- `database/migrate-revenue-split.sql` for the revenue columns
- (Or re-run `database/aiven-init.sql` if you wiped and need a fresh start)

**Two caregivers tap Accept at the same instant — both get success**
That's a bug, please file an issue. The expected behavior: `sp_accept_appointment` returns `accepted` for one and `unavailable` for the other via the atomic conditional UPDATE.
