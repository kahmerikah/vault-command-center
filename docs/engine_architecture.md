# SOMB Engine Layer Architecture

## Layering Model

- Layer 1: SOMB Vault OS (dashboard, command center, mission control)
- Layer 2: SOMB Engine (shared runtime and cross-module systems)
- Layer 3: Apps/Modules (arcade, booking, ecommerce, analytics, social, etc.)

## Engine Runtime Components

The shared runtime lives in backend/engine/runtime.py and initializes on app startup.

- ModuleRegistryEngine
  - Loads module manifests from modules/*/module.json
  - Normalizes manifest schema (api_prefix, routes, events, permissions, workflows, uses)
  - Persists modules to registered_modules
  - Auto-registers permission codes in permissions

- EventBusEngine
  - Central event emission and subscription interface
  - Persists events to engine_events
  - Broadcasts engine:event websocket messages
  - Supports decoupled event handlers per event key

- WorkflowEngine
  - Registers workflow definitions from module manifests
  - Supports trigger -> conditions -> actions execution
  - Actions: emit_event, set_state, log
  - Persists executions to workflow_runs

- StatePersistenceLayer
  - Persists engine runtime and automation state in system_state

- ServiceDiscoveryLayer
  - Exposes shared service map (auth, permissions, wallets, payments, notifications, modules)

- TelemetryEngine
  - Runtime counters from activity logs, engine events, workflow runs

## Engine API Surface

Routes under /api/v1/engine:

- GET /status
- GET /modules
- GET /workflows
- POST /workflows/<workflow_key>/run
- POST /events/<event_name>
- GET /events
- GET /workflow-runs
- GET /services

## Unified Context and Gateway

- request_context middleware now creates g.engine_context with:
  - active_user
  - active_org (X-Org-Id header)
  - active_module (derived from path)
  - role and permissions
  - request_id

- API gateway telemetry logs now include module and permission metadata.

## Realtime Architecture

- Socket rooms:
  - engine
  - ops
  - user:<user_id>
  - module:<module_key>
  - dashboard:<stream>

- Socket subscriptions:
  - engine:subscribe
  - module:subscribe

- Core services emit engine:event updates:
  - activity.logged
  - notification.created
  - module.launched
  - booking.created
  - booking.status_changed
  - payment.succeeded
  - payment.refunded
  - payment.disputed

## Module Manifest Contract

Modules self-register through manifest keys:

- key, name, description
- routes, api_prefix, route_prefix
- permissions
- events, websocket_events
- uses
- workflows

This allows clean plugin/module onboarding with minimal coupling.

## Scalability and Extension Strategy

- New modules can be added by dropping a manifest in modules/<key>/module.json
- Shared services remain centralized in engine layer
- Business workflows can be added without modifying route internals
- Event-driven patterns reduce cross-module coupling
- Engine APIs provide one control plane for operational introspection
