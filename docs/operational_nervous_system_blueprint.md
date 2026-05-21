# SOMB Vault Operational Nervous System Blueprint

## Purpose
SOMB Vault is not a dashboard product. It is infrastructure that reduces operational entropy for a founder-operator managing many connected systems.

The product mission is to convert fragmentation into continuity:
- fragmented tools -> unified operational state
- manual stitching -> orchestration
- reactive checking -> proactive surfacing
- context loss -> operational memory

## Target User Model
Primary user profile:
- founder
- operator
- investor
- builder
- technically literate creative
- systems thinker

User reality:
- runs finance, infra, projects, domains, deployments, property scouting, and growth loops in parallel
- works across many apps and tabs
- pays an ongoing cognitive tax from context switching and manual monitoring

Design implication:
- optimize for reduced cognitive load and continuity, not visual novelty

## Core User Needs
1. Control
2. Reduced cognitive load
3. Operational awareness
4. Momentum
5. Trust

Product requirement: every screen must improve at least one of these five outcomes.

## Product Principles (Non-Negotiable)
1. Decision-first output
- Show what matters now, what is drifting, and what should happen next.
- Raw metrics without action context are insufficient.

2. Unified operational state
- User should understand system state in 30 seconds.
- Morning and session re-entry must be first-class use cases.

3. Persistent continuity
- Vault must preserve unfinished threads, stalled items, and pending workflows.
- Re-entry should answer: what changed, what is blocked, what continues.

4. Real actions only
- No decorative controls.
- Any visible control must execute a real workflow or clearly indicate why unavailable.

5. Truthful surfaces
- No fake metrics, no simulated reliability.
- Every KPI must map to a real source and timestamp.

## Operating System View of SOMB Ecosystem
SOMB ecosystem layers:
- Culture layer: SOMB brand, identity, creative outputs, community signals
- Infrastructure layer: SOMB Vault command and orchestration plane
- Economic layer: KirkNet rails, tokenized commerce, rewards, seller loops
- Asset layer: property intelligence and long-horizon wealth systems
- Memory layer: Knowledge OS and operational history
- Automation layer: event-driven execution across all above layers

Vault role:
- control plane for cross-layer coordination
- memory plane for context persistence
- action plane for orchestration and intervention

## UX System Contract
### A. 30-Second Orientation (always on entry)
Top-of-screen must answer immediately:
- cash position
- infra health
- obligations due soon
- deployments pending/failing
- opportunities surfaced
- top 3 priority actions

### B. Triage Pipeline (stateful)
All meaningful items map into:
- now
- soon
- watch
- done

Each item must include:
- state
- owner (default: user)
- confidence
- impact score
- next action
- last update timestamp

### C. Memory and Momentum
Provide a persistent panel for:
- unfinished threads
- paused workflows
- stale tasks by age
- last session checkpoint

### D. Action Density without overload
Use progressive disclosure:
- default view: compressed signal + top actions
- drill-down: diagnostics, detail, raw logs

## Morning Briefing Specification
Create a unified briefing endpoint and panel that aggregates:
- finance snapshot
- due obligations (calendar, bills, commitments)
- infrastructure risk (service, SSL, deploy health)
- revenue trend
- opportunity alerts (property, growth, workflow)
- continuity reminders (unfinished and blocked threads)

Response contract (minimum):
- generated_at
- summary_status (good | warning | critical)
- cash_position
- due_soon[]
- infra_alerts[]
- momentum[]
- opportunities[]
- top_actions[]

## Operational Awareness Model
Every module should emit standardized signal objects:
- module
- signal_type
- severity
- confidence
- impact
- detected_at
- expires_at (optional)
- context
- recommended_action

The dashboard should consume signal objects rather than hardcoded per-module widget logic.

## Trust and Reliability Requirements
### Reliability gates
- user action response < 300ms for optimistic UI acknowledgement
- critical workflow completion feedback < 3s where possible
- explicit loading/error/empty states for all async panels
- retries and failure reason visibility

### UX honesty rules
- if stale data, label it
- if disconnected source, show degraded state and fallback action
- if action queued, show queue state and expected completion

### Event and audit discipline
- every mutation path should emit activity + audit logs
- action outcomes must be queryable in timeline/history views

## Orchestration Patterns (Initial)
1. Property capture automation
- input: address + asking price
- enrich: comps, valuation, cash-flow, risk flags
- output: scored opportunity + watchlist item + next action

2. Deployment run automation
- trigger: Git push or manual release
- steps: build -> test -> deploy -> health check
- output: success/fail signal + remediation action

3. Cashflow automation
- trigger: inbound transaction
- steps: routing rules, reserve updates, drift checks
- output: allocation summary + anomaly signals

## Information Architecture Standard
All core pages should follow this layout hierarchy:
- Tier 1: decision cards (what matters now)
- Tier 2: evidence cards (why this matters)
- Tier 3: operational table/timeline (what to do next)

Each Tier 1 card should include:
- value
- status
- delta/trend
- why
- single primary action

## 90-Day Implementation Plan
### Phase 1: Control + Trust Foundation (Weeks 1-3)
- add unified morning briefing backend service and API route
- build briefing panel with real timestamps and degraded-state handling
- normalize loading/error/empty states across dashboard modules
- enforce action-state toasts and result receipts for all quick actions

### Phase 2: Cognitive Compression + Awareness (Weeks 4-7)
- implement standardized Signal object ingestion and dashboard feed
- introduce triage pipeline view (now/soon/watch/done)
- add cross-module priority ranking based on impact + urgency

### Phase 3: Momentum + Automation (Weeks 8-12)
- launch continuity panel (unfinished, blocked, stale)
- wire automated playbooks for property, deploy, and cashflow flows
- add session handoff summary (what changed since last visit)

## Product Metrics (Leading Indicators)
Primary:
- time-to-orientation (target: <= 30s)
- context switches per task (target: down week-over-week)
- unattended workflow completion rate
- unresolved high-impact signals over 24h
- stale-thread count (>72h)

Quality and trust:
- action success rate
- false-positive alert rate
- stale-data exposure rate
- module availability and response SLAs

## Definition of Done for New Features
A feature is only done when:
- it maps to at least one core user need
- it has meaningful action output
- it emits or consumes standardized signal/state events
- it handles loading, error, empty, and degraded conditions
- it preserves continuity (history/checkpoint/timeline)
- it is observable (logs/audit/activity)

## Anti-Patterns to Reject
- decorative cards without action or truth value
- workflows that silently fail
- duplicate entry surfaces that increase cognitive burden
- fake operational data in production-facing views
- disconnected module widgets that do not influence priorities

## Immediate Next Build Tasks
1. Create backend aggregator: MorningBriefingService
2. Add route: GET /api/v1/ops/briefing
3. Add frontend panel: OperationsBriefing on dashboard top
4. Build shared status components: stale/degraded/loading/error
5. Add continuity panel: unfinished + blocked + stale threads

This blueprint should be treated as the canonical product operating contract for SOMB Vault.