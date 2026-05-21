# SOMB Vault UX Audit (Laws of UX)

Date: 2026-05-20  
Mode: Read-only analysis before implementation

## Executive Summary

SOMB Vault already performs unusually well for an early-stage operational dashboard in visual discipline, modular structure, and mental-model consistency. The main risk is not visual quality, but trust: several interaction surfaces look production-ready while behavior and feedback still feel partial.

Primary UX objective for refactor:

- Move from visual confidence to operational trust.
- Ensure every interactive element has clear affordance, reliable response, and truthful state communication.

## Strengths (Preserve)

- Coherent sidebar + topbar shell model.
- Strong panel spacing and modular grouping.
- Restrained premium dark aesthetic.
- Clear dashboard decomposition (metrics, health, terminal, modules, activity).
- Minimal visual clutter and consistent typography.

## Core Trust Gaps

- Affordances are too subtle on smaller utility controls.
- Empty states are often non-guiding and non-actionable.
- Operational priority is visually flat on key dashboards.
- Some interactions feel decorative due to weak completion feedback.
- Expectation mismatch where advanced visuals front-run feature depth.

## Laws of UX Assessment

### 1) Jakob’s Law
Score: 8/10

What works:

- Familiar dashboard conventions: left nav, KPI tiles, feeds, cards.

Violations:

- Some clickable surfaces are visually similar to static content.
- Utility controls (pagination/filter/actions) are not prominent enough.

Implementation direction:

- Strengthen hover/focus/active states and pointer signaling on all interactive surfaces.

### 2) Hick’s Law
Score: 7.5/10

What works:

- Good module compartmentalization.

Violations:

- Metrics on dashboard compete at equal visual weight.
- Critical operational cues are not clearly tiered.

Implementation direction:

- Introduce Tier 1/Tier 2/Tier 3 layout emphasis through scale, contrast, and grouping.

### 3) Fitts’s Law
Score: 6.5/10

Violations:

- Small controls in feeds, tabs, utility buttons, and terminal actions.
- Tight spacing around high-frequency controls.

Implementation direction:

- Increase hitbox/padding/min-height for controls while preserving aesthetics.

### 4) Aesthetic-Usability Effect
Score: 9/10

What works:

- Strong aesthetic coherence and premium feel.

Risk:

- UI can overpromise capability where states are sparse or placeholder-like.

Implementation direction:

- Replace generic empties with explicit operational states and next actions.

### 5) Miller’s Law
Score: 8/10

What works:

- Strong information chunking.

Violations:

- Sparse pages (Payments, PDA, Financial OS, Property) leave user uncertain on next action.

Implementation direction:

- Add guided empty states, contextual summaries, and action prompts.

### 6) Tesler’s Law
Score: 7/10

Violations:

- Technical complexity exposed too early in some workflows.

Implementation direction:

- Add progressive disclosure patterns: concise defaults, expandable detail, context hints.

### 7) Doherty Threshold
Score: 7/10 (observed responsiveness generally good, but consistency gaps)

Violations:

- Some async actions lack explicit pending and completion states.

Implementation direction:

- Normalize loading skeletons/messages and completion confirmations.

### 8) Peak-End Rule
Score: 8/10 potential

What works:

- Strong login/dashboard emotional peaks.

Violations:

- Flow endings can be flat (no explicit success acknowledgement).

Implementation direction:

- Add subtle completion messaging on launches, syncs, saves, and dispatches.

### 9) Law of Proximity
Score: 9/10

What works:

- Section grouping and card spacing are strong.

Implementation direction:

- Keep spacing model intact while refining semantics and action hierarchy.

### 10) Serial Position Effect
Score: 7/10

Violations:

- Sidebar ordering mixes core, operations, and infrastructure concerns.

Implementation direction:

- Group nav into labeled sections: Core, Operations, Infrastructure.

### 11) Principle of Least Astonishment
Score: 6.5/10 (largest risk)

Violations:

- Users can’t always tell if a control is operational, pending, or placeholder.

Implementation direction:

- Every visible control must either perform meaningful action or communicate exact operational state.

### 12) Operational Trust (Program Goal)
Score: 7/10

Gaps:

- Truthful state communication and feedback consistency are not yet universal.

Implementation direction:

- Unify feedback patterns, smart empty states, and operational acknowledgements across modules.

## Priority Refactor Plan

1. Shared interaction primitives

- Standardize actionable surface styles (hover, focus, active, pointer, min-hit area).
- Improve card/button affordance clarity.

2. Information architecture

- Rework sidebar into grouped operational categories.
- Establish dashboard priority tiers (critical vs operational vs reference).

3. Feedback + trust

- Add explicit pending/success/error states to major workflows.
- Add completion confirmations for launch/sync/create actions.

4. Smart empty states

- Replace generic “No data” text with status + next best actions.

5. Progressive disclosure

- Surface essential info first; move technical details into optional/secondary context.

## Files targeted in implementation phase

- Shared shell/components:
  - frontend/src/components/Sidebar.jsx
  - frontend/src/components/Topbar.jsx
  - frontend/src/components/GlassPanel.jsx
  - frontend/src/components/MetricCard.jsx
  - frontend/src/components/ActivityFeed.jsx
  - frontend/src/components/NotificationPanel.jsx
  - frontend/src/components/ModuleLauncher.jsx
  - frontend/src/components/LiveTerminalCard.jsx
  - frontend/src/styles/index.css

- Core pages:
  - frontend/src/pages/DashboardPage.jsx
  - frontend/src/pages/FinancialPage.jsx
  - frontend/src/pages/PaymentsPage.jsx
  - frontend/src/pages/PDAPage.jsx
  - frontend/src/pages/PropertyPage.jsx
  - frontend/src/pages/KnowledgePage.jsx
  - frontend/src/pages/ModulesPage.jsx
  - frontend/src/pages/NotificationsPage.jsx
