# Existing Projects Audit for The SOMB Vault

This audit was performed in read-only mode across the current workspace. Existing projects were not modified.

## CDSS Benefits Helper
- Stack: Flask, Flask-SocketIO, SQLAlchemy, React/Vite.
- Key infrastructure files:
  - chain_service.py
  - contracts/contract_registry.py
  - eligibility_importer.py
  - bank_account.py
- Reusable modules:
  - Contract registry pattern
  - Eligibility import pipeline
  - Wallet/pass issuance logic
- Vault integration path:
  - Integrate as a Benefits module behind Vault Auth and API Gateway.
  - Reuse contract loader concepts in Vault blockchain module.
- Duplicated logic to centralize:
  - User auth/session decorators
  - Role and user schema
- Keep untouched:
  - contracts/*
  - eligibility_importer.py
- Risks:
  - SQLite + in-memory assumptions
  - session strategy not centralized

## CDSS Outreach Dashboard
- Stack: Node/TypeScript, Express, Prisma, React/Vite, Redis/BullMQ, Postgres.
- Key infrastructure files:
  - backend/src/services/auth.service.ts
  - backend/src/services/audit.service.ts
  - backend/src/middleware/auth.ts
  - backend/prisma/schema.prisma
  - docker-compose.yml
- Reusable modules:
  - Mature RBAC and auth middleware patterns
  - Queue worker pattern (BullMQ)
  - Audit service conventions
- Vault integration path:
  - Connect as external service via Vault API key + JWT trust.
  - Reuse audit event shape and queue architecture.
- Duplicated logic to centralize:
  - RBAC/auth checks
  - Notification routing
- Keep untouched:
  - backend/prisma/schema.prisma
  - backend/src/services/everbridge.service.ts
- Risks:
  - Runtime split between worker/API
  - Secret handling and queue dependency

## CDSS Outreach Dashboard CLI
- Stack: FastAPI, SQLite, CLI workflow tooling.
- Key infrastructure files:
  - src/everbridge_campaign/campaign_service.py
  - src/everbridge_campaign/everbridge_client.py
  - src/everbridge_campaign/saws_parser.py
- Reusable modules:
  - Deterministic campaign orchestration pipeline
  - CSV normalization/dedupe utilities
- Vault integration path:
  - Add as a background campaign orchestration module triggered by Vault tasks.
- Duplicated logic to centralize:
  - Everbridge client wrappers
  - campaign metadata handling
- Keep untouched:
  - saws_parser.py
  - campaign_service.py
- Risks:
  - SQLite persistence for concurrent workflows

## DriveChain
- Stack: Flask, custom blockchain engine, React/Vite (motuSoko).
- Key infrastructure files:
  - drivechain_core/chain_from_scratch3.py
  - drivechain_core/chain_modules.py
  - drivechain_core/chain_api.py
  - motuSoko/services.py
- Reusable modules:
  - Transaction/event model for token activity
  - Moduleized marketplace service layer
- Vault integration path:
  - Treat as an external blockchain engine behind Vault blockchain adapters.
- Duplicated logic to centralize:
  - wallet/user identity mapping
  - API auth enforcement
- Keep untouched:
  - chain_from_scratch3.py
  - chain_modules.py
- Risks:
  - in-memory assumptions
  - consensus not independently audited

## IG_BOT
- Stack: FastAPI, SQLAlchemy, Alembic, FFmpeg, OpenAI.
- Key infrastructure files:
  - app/services/llm_service.py
  - app/services/ffmpeg_service.py
  - app/services/analytics_service.py
- Reusable modules:
  - LLM client abstraction pattern
  - Media generation pipeline design
- Vault integration path:
  - Add as AI/media module using Vault auth and job queue.
- Duplicated logic to centralize:
  - analytics event schema
  - local file storage conventions
- Keep untouched:
  - prompts/*
  - training_material/*
- Risks:
  - unbounded render/API cost without queue guardrails

## kirknet
- Stack: Flask services (chain + arcade), React/Vite dashboard.
- Key infrastructure files:
  - services/chain/app.py
  - services/arcade/app.py
  - run.py
  - frontend/negreaux-dashboard/src/lib/api.js
- Reusable modules:
  - Service orchestration split patterns
  - Arcade domain rules and event flows
- Vault integration path:
  - Register as kirknet module with trusted API integration.
- Duplicated logic to centralize:
  - auth/session roles
  - wallet state access patterns
- Keep untouched:
  - deploy/*
  - services/arcade/games/*
- Risks:
  - multiple app process coordination

## moneyTracker
- Stack: Flask, SQLAlchemy, Plaid, React frontend.
- Key infrastructure files:
  - backend/app/services/plaid_client.py
  - backend/app/models/account.py
  - backend/app/routes/plaid.py
- Reusable modules:
  - Plaid ingestion + cursor handling
  - finance account and transaction models
- Vault integration path:
  - Add as finance connector module and reuse in shared services.
- Duplicated logic to centralize:
  - Plaid sync logic mirrored in SuSuMoney
- Keep untouched:
  - plaid client/model files
- Risks:
  - sync scheduling and idempotency concerns

## simple_scheduler
- Stack: Flask + Docker + Nginx.
- Key infrastructure files:
  - Dockerfile
  - docker-compose.yml
  - nginx.conf
- Reusable modules:
  - baseline Nginx and container structure references
- Vault integration path:
  - limited direct reuse; mostly ops references.
- Keep untouched:
  - nginx.conf
- Risks:
  - minimal security controls and unclear persistence

## survey_website
- Stack: Flask + JSON state files.
- Key infrastructure files:
  - app.py
  - config.py
  - ecosystem/*
- Reusable modules:
  - basic modular folder strategy only
- Vault integration path:
  - low priority migration; use Vault auth + DB first.
- Keep untouched:
  - none required for immediate Vault work
- Risks:
  - JSON persistence and no robust auth

## SuSuMoney
- Stack: Flask, SQLAlchemy, Alembic, React.
- Key infrastructure files:
  - backend/app/utils/money.py
  - backend/app/services/*
  - backend/app/models/*
- Reusable modules:
  - Decimal-safe money handling
  - audit-first service pattern
  - decision-first analytics service style
- Vault integration path:
  - primary reference architecture for service layering.
- Duplicated logic to centralize:
  - transaction and category modeling overlaps with moneyTracker
- Keep untouched:
  - backend/app/models/*
  - backend/app/services/*
- Risks:
  - migration complexity due to breadth

## trading_
- Stack: FastAPI, async broker integrations, strategy/risk modules.
- Key infrastructure files:
  - bot/risk/*
  - bot/strategies/*
  - bot/ui/app.py
- Reusable modules:
  - risk-engine structuring
  - strategy plugin style
- Vault integration path:
  - connect as optional quant module with strict API boundaries.
- Duplicated logic to centralize:
  - LLM usage and audit event streams
- Keep untouched:
  - bot/risk/*
  - bot/strategies/*
- Risks:
  - external broker coupling and operational sensitivity

## Migration Priority
1. SuSuMoney patterns (service architecture, money safety, audit style).
2. moneyTracker and CDSS Outreach auth/audit patterns.
3. DriveChain/kirknet module integrations.
4. IG_BOT and trading_ as optional modules.
5. survey_website and simple_scheduler last.
