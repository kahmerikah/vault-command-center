# The SOMB Vault Architecture

## Core Idea
The SOMB Vault is the central reusable infrastructure layer for all SOMB products. Domain apps connect through common services instead of re-implementing auth, payments, notifications, booking, blockchain telemetry, and analytics.

## Runtime Topology
- Nginx: entry + host routing
- Frontend (React/Vite build): operator command center UI
- Backend (Flask + Socket.IO): API gateway + service orchestration
- Worker (Celery): background tasks
- PostgreSQL: durable relational store
- Redis: cache, rate limits, queue broker

## Backend Composition
- app.py: app factory and cross-cutting setup
- routes/: versioned APIs
- services/: domain logic and orchestration
- middleware/: security, auth guards, request context
- models/: normalized production schema
- sockets/: real-time event handlers
- tasks/: background jobs
- payments/, notifications/, blockchain/, analytics/, storage/, auth/: pluggable infrastructure domains

## Data Model Domains
- Identity: users, roles, permissions, sessions, api_keys
- Revenue: payments, subscriptions
- Operations: notifications, bookings, modules
- Chain: wallets, chain_transactions
- Telemetry: analytics_events, activity_logs, audit_logs

## Architecture Decisions
- Flask chosen for ecosystem continuity with existing SOMB Python services.
- Versioned API path /api/v1 to support non-breaking future evolution.
- Module manifests in modules/*/module.json to support runtime registration.
- JWT + RBAC to unify access control across all modules.
- Socket.IO for immediate live updates in dashboard and module events.
- Celery + Redis for long-running and asynchronous workflows.
- Local storage abstraction with cloud-ready extension point.
