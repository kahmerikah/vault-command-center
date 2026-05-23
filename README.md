# The SOMB Vault

The SOMB Vault is a production-ready, modular, self-hosted command-center platform that serves as reusable infrastructure for all SOMB apps and services.

## Vision
Build once, plug in forever.

Instead of rebuilding auth, payments, dashboards, notifications, analytics, and booking logic per app, every future SOMB product connects to this shared platform.

## Architecture Layers

### Layer 1: SOMB Vault OS
- Personal dashboard
- Command center
- Mission control
- Operational intelligence layer

### Layer 2: SOMB Engine
Shared runtime layer for every future module and app.

Engine responsibilities:
- Auth engine
- RBAC / permissions engine
- Event bus
- Workflow engine
- Module registry
- API gateway
- Realtime engine
- Scheduling engine
- Notification engine
- Payment engine
- Wallet engine
- Asset / file engine
- Logging / telemetry engine
- Search / indexing engine
- AI context engine
- State persistence layer
- Plugin runtime
- Service discovery layer

### Layer 3: Apps / Platforms
- Arcade
- Booking
- Ecommerce
- Property intelligence
- Headshots
- Social
- Analytics
- Future apps

## Runtime Model
- Modules self-register from manifests in `modules/*/module.json`
- Shared events are recorded in the engine event log and broadcast over Socket.IO
- Shared workflows can subscribe to engine events and execute reusable actions
- Vault UI acts as the orchestrator and visual layer for the engine

## Implemented Stack
- Frontend: React + Vite + TailwindCSS + Framer Motion + Recharts + Socket.IO client + Zustand
- Backend: Flask + Flask-SocketIO + Flask-JWT-Extended + SQLAlchemy + Redis + Celery + Stripe SDK
- Infra: PostgreSQL + Nginx reverse proxy + Docker Compose

## Folder Structure

```text
The SOMB Vault/
├── frontend/
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── extensions.py
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── sockets/
│   ├── blockchain/
│   ├── auth/
│   ├── payments/
│   ├── notifications/
│   ├── analytics/
│   ├── storage/
│   ├── utils/
│   └── tasks/
├── services/
├── modules/
├── docker/
├── nginx/
├── scripts/
├── docs/
├── backups/
├── logs/
└── .env.example
```

## Core Features Included
- Central auth foundation: register/login/me, JWT + refresh-ready session model, RBAC roles
- Password recovery flow: forgot-password token issue + reset-password endpoint and UI
- Modular app registry: auto-discovers modules from module manifests
- Shared runtime engine: module discovery, engine events, workflows, shared context, engine health
- Real-time command-center dashboard: metrics, activity, notifications, revenue chart
- API gateway layer: versioned APIs, request logging, health and gateway status endpoints
- Stripe infrastructure: checkout session + webhook endpoint + payment logging
- Unified notifications: in-app now, email/SMS architecture stubs included
- Calendar + booking base: booking creation and event broadcasting
- Blockchain base: wallet provisioning, transaction ledger, websocket transaction feed
- Platform chain bootstrap: optional system user bootstrap and genesis mint on startup
- Analytics service: cross-module event ingestion + dashboard rollups
- Storage abstraction: local provider with cloud-ready extension point
- Security baseline: JWT guards, RBAC middleware, secure headers, rate limiter, audit/activity tables
- DevOps baseline: Dockerfiles, Compose, Nginx host routing, backup scripts, seed script

## Existing Workspace Integration Audit
A full read-only audit is documented in:
- docs/existing_projects_audit.md

## Operational Product Blueprint
The implementation blueprint for designing SOMB Vault as an operational nervous system is documented in:
- docs/operational_nervous_system_blueprint.md

## Local Development

### Option A: Docker (recommended)
1. Copy environment template:
   - cp .env.example .env (PowerShell: Copy-Item .env.example .env)
2. Copy Nginx template:
   - cp nginx/nginx.example.conf nginx/nginx.conf
3. (Optional) copy compose template if starting from scratch:
   - cp docker-compose.example.yml docker-compose.yml
4. Start stack:
   - docker compose --env-file .env up -d --build
5. Verify:
   - Frontend: http://localhost
   - API: http://localhost/api/v1/health

### Option B: Native local
Backend:
1. Create venv and install backend dependencies from backend/requirements.txt
2. Set environment variables from .env.example
3. Run backend:
   - python -m backend.wsgi

Frontend:
1. cd frontend
2. npm install
3. npm run dev

## System Login and Mint Bootstrap
To bootstrap a system account with mint permissions, set these values in local/server `.env` before startup:
- SYSTEM_USERNAME
- SYSTEM_EMAIL
- SYSTEM_PASSWORD

On startup, if SYSTEM_PASSWORD is set, the app:
1. ensures a `super_admin` system user exists
2. ensures the system wallet exists
3. mints the genesis supply into that wallet if not already minted

Mint endpoint (super_admin only):
- POST /api/v1/blockchain/mint
- payload: { "wallet_id": "...", "amount": "100" }

## Deployment Instructions
1. Provision VPS with Docker and Docker Compose.
2. Configure DNS for:
   - vault/admin/api/arcade/booking.YOURSITE.com
3. Set production .env values (secrets, DB, Redis, Stripe, SMTP).
4. Run:
   - docker compose --env-file .env up -d --build
5. Place TLS in front of Nginx (cloud LB or certbot + reverse proxy).
6. Schedule backups with scripts/backup.ps1.

More detail: docs/deployment.md

## Setup Scripts
- scripts/bootstrap.ps1: build/start full stack
- scripts/backup.ps1: Postgres dump into backups/
- scripts/seed_demo_data.py: create initial DB records

## Secret Management
- Real environment files (`.env`, `frontend/.env`, and other `.env.*`) are git-ignored.
- Template environment files (`.env.example`) remain commit-safe and tracked.
- If a real `.env` was ever tracked before ignore rules were added, untrack it once:
   - `git rm --cached .env`
   - `git rm --cached frontend/.env`

## How to Add Future Modules/Apps
1. Create modules/<name>/module.json.
2. Add backend service and routes under backend/services and backend/routes.
3. Register the new route blueprint in backend/routes/__init__.py.
4. Add frontend page/components and module card UI.
5. Add permissions and role checks.
6. Add websocket events and analytics tracking.

See docs/module_creation_guide.md for a complete step-by-step process.

## API + WebSocket Docs
- docs/api_reference.md
- docs/websocket_events.md

## Architectural Notes
- The backend intentionally keeps feature domains separated to reduce coupling.
- Module manifests are used for discoverability and runtime registration.
- Stripe, notifications, OAuth, and cloud storage include TODO extension points for safe incremental rollout.
- Existing projects were left untouched and can migrate gradually via adapters under services/.
- Domain strategy: use placeholder hostnames in git (for example, `vault.YOURSITE.com` and `api.YOURSITE.com`) and apply real production domains via local `.env` and server-only Nginx config.

## Next Recommended Production Enhancements
1. Add Alembic migration scripts for Vault schema versioning.
2. Add refresh token rotation + revoke-on-compromise workflows.
3. Add Redis-backed server-side session revocation checks for JWT blacklist support.
4. Add object storage provider adapters (S3/GCS).
5. Add observability stack (Prometheus/Grafana/Sentry).
6. Add test suites (pytest + frontend component tests).
