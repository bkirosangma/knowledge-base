# Phase 2 — OCP: Strategy + Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Replace `switch`-on-algorithm-string dispatchers with Strategy registries so adding a new routing or layout algorithm means writing a new strategy + registering it, not editing a switch. Centralize scattered `el-${Date.now()}-${random}` / `ly-${...}` ID generation into factory helpers.

**Architecture:**
- **Strategy pattern** for path routing (straight / bezier / orthogonal) and auto-arrange layout (hierarchical-tb / hierarchical-lr / force). Each strategy is a function matching a shared signature; a registry maps algorithm keys to implementations. `computePath` and `handleAutoArrange` look up and invoke.
- **Factory pattern** for element/layer ID generation. A single `createElementId()` / `createLayerId()` produces the `el-${ts}-${rand}` shape consistently.

**Tech Stack:** TypeScript 5, no new runtime deps.

**Baseline:** 831 unit + 25 e2e tests passing on Node 22.

---

## Task 1: Line routing strategy registry

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/utils/pathRouter.ts` — replace `switch(algorithm)` with a registry lookup.
- Unit tests at `utils/pathRouter.test.ts` continue to pass unchanged.

Each strategy (`straight`, `bezier`, `orthogonal`) becomes a named function satisfying a `LineRoutingStrategy` signature. A `routerRegistry` Record maps `LineCurveAlgorithm` → strategy. `computePath` does `routerRegistry[algorithm](...)` with `orthogonal` as default. No behaviour change — mechanical refactor.

## Task 2: Layout strategy registry

**Files:**
- Modify: `features/diagram/utils/autoArrange.ts` — add `layoutRegistry` keyed by `ArrangeAlgorithm`.
- Modify: `features/diagram/DiagramView.tsx:507` — `handleAutoArrange` looks up from registry instead of branching.

Strategy signature: `(nodes: NodeData[], connections: Connection[], opts?: ...) => PositionMap`. Three implementations: `hierarchicalTbLayout`, `hierarchicalLrLayout`, `forceLayout`. Registry: `{ "hierarchical-tb": ..., "hierarchical-lr": ..., "force": ... }`.

## Task 3: Element + layer ID factories

**Files:**
- Create: `features/diagram/utils/idFactory.ts` — exports `createElementId()` and `createLayerId()`.
- Modify: `features/diagram/hooks/useContextMenuActions.ts` (two sites) — use factories.
- Modify: `features/diagram/DiagramView.tsx:482` — use factory.

Each factory: `\`el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}\`` (and same with `ly-`). One place to change collision resistance or prefix format in future.

## Task 4: Cleanup + Features.md

- Remove now-unused imports.
- Update `Features.md` section 3 to note the strategy/factory patterns.

---

## Definition of Done

- [ ] All 3 task commits green on Node 22.
- [ ] 831 unit + 25 e2e tests pass unchanged.
- [ ] No `switch(algorithm)` in `computePath` or `handleAutoArrange`.
- [ ] No inline `el-${Date.now()}` / `ly-${Date.now()}` template literals outside `idFactory.ts`.
- [ ] `Features.md` updated.
- [ ] No user-visible behaviour change.

## Risk & rollback

- **Risk: Strategy signatures don't capture one path's quirk** (orthogonal needs obstacles + waypoints; straight doesn't). Mitigation: use a single `RouterContext` object argument so every strategy has the same shape and ignores what it doesn't need.
- **Rollback:** each task = one commit = `git revert <SHA>`.
