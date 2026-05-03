# Guitar Tabs — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Guitar Tabs feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to "Next Action".

**Last updated:** 2026-05-03 (after TAB-007a merged; TAB-012 is next).

---

## Resume protocol — when the user says "take the next task"

If the user says anything like *"continue from this doc"*, *"take the next task"*, *"resume guitar tabs"*, or just points at this file:

1. Run the bootstrap block in the next section.
2. Skim **Where we are** + **Remaining tickets** to confirm the next ticket — the **Next Action** section near the bottom names it explicitly.
3. Check open PRs (`gh pr list --state open`). If a Guitar-Tabs PR is still open, ask the user whether to wait for it or stack a follow-up branch on top.
4. Read the spec section + plan-doc references for that ticket.
5. **Branch first** (`git checkout -b plan/guitar-tabs-<slug>`), then plan, then execute via subagents — see the **Process recipe** section.
6. Honour every rule in **Project conventions** (branch-per-unit, main protected, no worktrees, `useRepositories` scope, etc.).
7. After the ticket merges, **update this doc** per the **Doc-update protocol** below — same branch as the cleanup, same PR.

The user's intent when pointing here is: *"Pick up where we left off without me having to re-explain anything."* Don't ask clarifying questions if the doc + spec + previous plans answer them; just go.

---

## Doc-update protocol (do this on every ticket close)

After a Guitar-Tabs PR merges, **before** starting the next ticket, update this doc on a doc-only branch (or fold the updates into the next ticket's branch — either works). Touch these sections:

1. **Last updated** — bump the date + parenthetical to reflect what just shipped.
2. **Where we are table** — flip the just-shipped ticket to ✅ Merged with the merge PR number.
3. **Remaining tickets** — strike or remove the just-shipped row from M1 / M2 tables.
4. **Open follow-up items** — add anything the just-merged review surfaced as deferred (with a memory reference if durable). Remove items that were closed by the just-merged ticket.
5. **Reference architecture** — add new files / hooks / components. Remove deleted ones. Keep paths accurate; this is the map a fresh session relies on.
6. **Next Action** — replace the body with the next ticket's bootstrap: spec section to read, patterns to mirror, key brainstorm decisions, ship target. Make it concrete enough that a fresh session can start in one read.
7. **`Features.md` + `test-cases/11-tabs.md` cross-reference counts** — if you mention case counts anywhere in the doc, update them.

If you skip the doc update, future sessions will resume from a stale map — that's the failure mode this protocol exists to prevent.

---

## Bootstrap (run first)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
gh pr list --state open
git log --oneline -10
ls docs/superpowers/plans/2026-05-*.md
```

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and lists the in-flight Guitar Tabs plans.

---

## Where we are

| Ticket | Title | PR | Status |
|---|---|---|---|
| TAB-001 → TAB-003 | Foundation (domain interfaces, repositories, pane plumbing) | [#98](https://github.com/bkirosangma/knowledge-base/pull/98) | ✅ Merged |
| (test-cases scaffold) | `test-cases/11-tabs.md` §11 added | [#99](https://github.com/bkirosangma/knowledge-base/pull/99) | ✅ Merged |
| TAB-004 | Viewer (lazy AlphaTabEngine + TabView) | [#100](https://github.com/bkirosangma/knowledge-base/pull/100) | ✅ Merged |
| TAB-005 | Playback chrome (toolbar + audio + SoundFont + theme push) | [#101](https://github.com/bkirosangma/knowledge-base/pull/101) | ✅ Merged |
| TAB-006 | Guitar Pro `.gp` import (palette command) | [#102](https://github.com/bkirosangma/knowledge-base/pull/102) | ✅ Merged |
| (handoff doc) | Session resume checklist + protocols | [#103](https://github.com/bkirosangma/knowledge-base/pull/103) | ✅ Merged |
| TAB-007 | Properties panel — read-only metadata view (`TabProperties`) | [#104](https://github.com/bkirosangma/knowledge-base/pull/104) | ✅ Merged |
| (handoff refresh) | Post-TAB-007 handoff update | [#105](https://github.com/bkirosangma/knowledge-base/pull/105) | ✅ Merged |
| TAB-011 | Vault search + wiki-link integration (`alphatexHeader`, `tabFields`, `buildTabEntry`, `handleTabImported`) | [#106](https://github.com/bkirosangma/knowledge-base/pull/106) | ✅ Merged |
| (handoff refresh) | Post-TAB-011 handoff update | [#107](https://github.com/bkirosangma/knowledge-base/pull/107) | ✅ Merged |
| TAB-007a | Tab properties cross-references (`slugifySectionName`, `getSectionIds`, `useTabSectionSync`, `migrateAttachments`, `TabReferencesList`, `TabPaneContext`) | [#108](https://github.com/bkirosangma/knowledge-base/pull/108) | 🚧 In flight |

**TAB-012** is the next ticket. The TAB-007a PR ([#108](https://github.com/bkirosangma/knowledge-base/pull/108)) is in flight on branch `plan/guitar-tabs-properties-cross-refs`.

---

## Remaining tickets

### M1 viewer ship-point (remaining)

| Ticket | Title | Effort | Dependencies | Status |
|---|---|---|---|---|
| **TAB-012** | Mobile read-only + playback (per KB-040 stance) | 2 days | TAB-005 | ❌ Not started — **next** |

After this, M1 = "viewer ship-point" complete. Natural pause-and-evaluate boundary per the spec.

### M2 editor ship-point

| Ticket | Title | Effort | Dependencies |
|---|---|---|---|
| **TAB-008** | Editor v1 — click-to-place fret, keyboard shortcuts, techniques toolbar, undo/redo through `applyEdit` | ~2 weeks | TAB-007 |
| **TAB-009** | Multi-track + multi-voice editing | 1 week | TAB-008 |
| **TAB-009a** | Track-level attachment surface (folds into TAB-009) | 1 day | TAB-009 |
| **TAB-010** | Export — MIDI / WAV / PDF (alphaTab APIs) | 2 days | TAB-008 |

---

## Open follow-up items (parked, not ticketed yet)

These were flagged during reviews and intentionally deferred. The user explicitly asked to **revisit after all TAB tickets ship** — surface them at the M1 ship boundary or whenever the user invokes `/knowledge-base guitar-tabs` and sees fallout.

1. **`~/.claude/skills/knowledge-base/commands/guitar-tabs.md` bug list** — see memory `project_guitar_tabs_skill_bugs.md`. Three `%` → `//` syntax sites (will break alphaTab parsing if the skill output is followed verbatim), tuning-direction comment flip, and a link-index claim that's overstated until TAB-011 ships.
2. **`alphaTabEngine.ts` logLevel = 1 (Debug)** — was already in the TAB-004 baseline; reviewer flagged in TAB-005 review as an Important-Minor cleanup. Set to `2` (Info) or import the named constant. One-line change.
3. **`useGpImport`'s `opts` memo churn (M1 from TAB-006 review)** — final TAB-006 fix in commit `7e0dbd5` already addressed this via the ref pattern; nothing left to do, leaving here as a note.
4. **e2e for the GP import flow (TAB-11.4-06)** — currently ❌. Driving native file picker in headless Chromium needs a custom mock layer. Defer until there's a clean fixture pattern.
5. **Playwright `clicking Play` smoke (TAB-11.3-19)** — currently 🧪 but relaxed: only asserts the toolbar mounts; SoundFont readiness doesn't fire in headless Chromium within timeout. Could be tightened by mocking `playerReady` or using a tiny SoundFont fixture.
6. **Shared `"properties-collapsed"` localStorage key duplicated across panes** — surfaced in TAB-007 review. Diagram has it as a named constant in `useDiagramLayoutState.ts`; `DocumentView.tsx` and now `TabView.tsx` inline the literal. Toggling collapse on one pane carries to the others (which may even be desired). Pre-existing pattern; collapse into one shared constant when a fourth pane joins or when changing the key.
7. **~~`key={section.name}` in `TabProperties`~~** — _Closed by TAB-007a_: deterministic kebab-case section ids via `getSectionIds` are now the React key.
8. **`linkManager.fullRebuild` walks every file on every GP import** — TAB-011 ships with O(N) re-index per import. Acceptable today (vault sizes ~hundreds of files); a single-file `updateTabLinks()` helper mirroring `updateDocumentLinks()` is the natural follow-up if this ever shows up in profiles.
9. **`\lyrics` extraction is single-line only** — `parseAlphatexHeader` captures only the quoted-string form. AlphaTab's grammar supports multi-string `\lyrics` blocks (one per bar) and per-track `\lyrics t N "…"`. Acceptable for indexing (first stanza usually contains the chorus/title line); extend the parser if real fixtures show this gap.
10. **`REFERENCES_LINE` regex duplicated in two sites** — `infrastructure/alphatexHeader.ts` and `features/document/hooks/useLinkIndex.ts` both define `/^\s*\/\/\s*references\s*:\s*(.*)$/gim`. Two lines of repetition isn't worth a shared module; if a third caller appears, hoist to `alphatexHeader.ts` and re-export.
11. **Audit diagram flow rename/delete attachment integrity** — flow ids are stable so rename is safe by construction, but deletion may leave orphan `attachedTo` entries (no cleanup hook visible in `DiagramView`). Triggered by user request during TAB-007a brainstorm; spec a fix once tabs ship.
12. **Side-car stable section ids for tabs** — TAB-007a's position-based section-rename reconciliation (`useTabSectionSync`) breaks if the user renames *and* reorders sections in the same save. True stability requires persisting a `name → stableId` map per tab (e.g., `tabs/song.alphatex.refs.json`) so renames survive reorder. Targets TAB-008/M2 when the editor lands and renames become first-class.
13. **`<DocumentPicker>` Create row silently no-ops in TabView when prerequisites missing** — when `rootHandle` or `onCreateDocument` is unwired, clicking "Create" inside the picker does nothing (no toast, no error). In production this only matters before vault open, but it could mask wireup regressions. Either gate the Create row in `DocumentPicker` or surface a `reportError` from the no-op branch. Surfaced in T9 review.

---

## Project conventions to honour

These are durable; pull from memory before making any change.

- **Branch per unit of work** (`feedback_branch_per_unit_of_work.md`) — `git checkout -b` BEFORE the first commit on any task. Never commit directly on `main`, even one-liners.
- **Main is protected** (`project_branch_protection.md`) — push to a branch, open a PR via `gh pr create`. Never `git push origin main` directly.
- **No git worktrees** (`feedback_no_worktrees.md`) — work directly on feature branches; skip the `using-git-worktrees` skill entirely.
- **`useRepositories()` only works below `RepositoryProvider`** (`project_repository_context_deferred.md`) — `KnowledgeBaseInner` itself is *above* the provider in the React tree (it returns the provider in its JSX). Hooks called at that level must accept the repository as a prop and the caller instantiates it inline via `createTabRepository(rootHandle)`. **TAB-006 hit this twice** — `useGpImport` was rewritten to take `tab` as a prop in commits `0a82dd3` + `7e0dbd5`.
- **SoundFont served from `public/`** (`project_soundfont_host.md`) — bundled at `public/soundfonts/sonivox.sf2`; precached by service worker via `kb-static-v3` cache.
- **Worktree baseline** (`feedback_worktree_nvm_baseline.md`) — if `npm install` produces a lockfile diff CI rejects, re-run after `nvm use` to match `.nvmrc`.
- **Verification ceiling** (`feedback_preview_verification_limits.md`) — preview MCP can't drive the FSA folder picker; clean build + clean console is the verification ceiling for in-app changes.

---

## Reference architecture

```
src/app/knowledge_base/
  domain/
    tabEngine.ts                   ← TabEngine, TabSession, TabSource, TabEditOp, TabMetadata, …; + slugifySectionName + getSectionIds (TAB-007a — pure helpers, kebab-case slug with NFKD diacritic strip; collision-suffixed by appearance order)
    repositories.ts                ← TabRepository interface
    errors.ts                      ← FileSystemError + classifyError
  infrastructure/
    alphaTabEngine.ts              ← AlphaTabEngine impl; lazy alphatab import; play/pause/stop/seek/etc.
    alphaTabAssets.ts              ← SOUNDFONT_URL constant
    tabRepo.ts                     ← FSA-backed TabRepository factory
    gpToAlphatex.ts                ← Pure conversion utility (TAB-006)
    alphatexHeader.ts              ← TAB-011 pure regex parser for header directives + // references: lines (no DOM, no alphaTab)
    searchStream.ts                ← Extension router for vault search; .md / .json / .alphatex branches; tabFields() helper for indexable mapping
  features/tab/
    TabView.tsx                    ← Pane shell — flex-row: TabToolbar + TabCanvas (canvas column) + TabProperties (panel column with collapse persistence)
    components/
      TabCanvas.tsx                ← forwardRef host div for AlphaTab to mount into
      TabToolbar.tsx               ← play/pause/stop/tempo/loop transport
    properties/
      TabProperties.tsx            ← TAB-007 metadata panel + TAB-007a cross-references (file-level + per-section References lists with merged attachments + backlinks; Attach affordances; deterministic section-id keys)
      TabReferencesList.tsx        ← TAB-007a presentational component — merges DocumentMeta attachments and BacklinkEntry rows, de-dupe by sourcePath with attachment-wins precedence; readOnly hides detach
      useTabSectionSync.ts         ← TAB-007a hook — diffs section ids across metadata snapshots and emits position-aligned migrations to migrateAttachments; trailing deletions orphan-by-design; resets cache on filePath change
    hooks/
      useTabEngine.ts              ← Engine + session lifecycle; surfaces playerStatus, currentTick, isAudioReady, session, metadata
      useTabContent.ts             ← Reads .alphatex via useRepositories().tab
      useTabPlayback.ts            ← Wraps TabSession callables with null-safe no-ops + audioBlocked tracking
      useGpImport.ts               ← TAB-006 import flow (above-provider — accepts tab as prop)
  shell/
    RepositoryContext.tsx          ← Provider + useRepositories + StubRepositoryProvider
    ToolbarContext.tsx             ← PaneType union (incl. "tab")
    PaneManager.tsx                ← PaneEntry shape + pane state
  features/document/hooks/
    useLinkIndex.ts                ← Wiki-link graph; buildTabEntry() + .alphatex branch in fullRebuild (TAB-011); getLinkType maps .alphatex → "tab"
    useDocuments.ts                ← TAB-007a: migrateAttachments(filePath, migrations[]) bulk rewrites tab-section attachment ids on rename; idempotent; preserves identity for untouched docs
  features/document/types.ts       ← OutboundLink.type union now includes "tab"; DocumentMeta.attachedTo.type union widened with "tab" | "tab-section" (TAB-007a)
  features/search/VaultIndex.ts    ← DocKind union now includes "tab"
  shared/utils/graphifyBridge.ts   ← CrossReference.{source,target}Type widened for "tab" (additive, TAB-011)
  knowledgeBase.tsx                ← KnowledgeBaseInner — top-level shell; registers palette commands; handleSearchPick routes kind="tab" to tab pane (TAB-011); handleTabImported wraps useGpImport with fire-and-forget search + link re-index (TAB-011); renderTabPaneEntry receives full TabPaneContext (documents/backlinks/attach/detach/migrate) for TAB-007a wireup
  knowledgeBase.tabRouting.helper.tsx ← TAB-007a: TabPaneContext interface + renderTabPaneEntry(entry, context?) spreads context onto TabView; backwards-compatible with zero-arg test calls
public/
  soundfonts/sonivox.sf2           ← 1.35 MB Sonivox GM SoundFont
  sw.js                            ← Service worker; cache-first lane for /soundfonts/*; kb-static-v3
test-cases/
  11-tabs.md                       ← TAB-11.x case catalog (86 cases; mirrors Features.md §11)
Features.md                        ← §11 Guitar Tabs (subsections §11.1 Foundation, §11.2 Playback, §11.3 .gp import, §11.4 Properties panel, §11.5 Vault search & wiki-links, §11.6 Cross-references, §11.7 Pending)
docs/superpowers/
  specs/2026-05-02-guitar-tabs-design.md         ← Source of truth design spec
  plans/2026-05-02-guitar-tabs-foundation.md     ← TAB-001..TAB-003
  plans/2026-05-02-guitar-tabs-viewer.md         ← TAB-004
  plans/2026-05-03-guitar-tabs-playback.md       ← TAB-005
  plans/2026-05-03-guitar-tabs-gp-import.md      ← TAB-006
  plans/2026-05-03-guitar-tabs-properties-panel.md ← TAB-007
  plans/2026-05-03-guitar-tabs-search-links.md   ← TAB-011
  plans/2026-05-03-tab-cross-references.md       ← TAB-007a
  specs/2026-05-03-tab-cross-references-design.md ← TAB-007a
  handoffs/2026-05-03-guitar-tabs.md             ← THIS doc — session resume + ticket status
```

---

## Process recipe (every ticket follows this)

1. **Confirm scope.** Read the spec section for the target ticket. Note dependencies on already-shipped tickets.
2. **Create branch.** `git checkout main && git pull --ff-only && git checkout -b plan/guitar-tabs-<ticket-slug>`.
3. **Investigate patterns.** Use Explore agent or targeted grep to map the existing files the new ticket will touch / mirror. Common patterns to look up:
   - `useRepositories()` consumers vs above-the-provider sites.
   - `useRegisterCommands(...)` for palette commands.
   - `StubRepositoryProvider` + `StubShellErrorProvider` test wrapper shape.
   - Existing `features/...` panel/component conventions (DocumentView, DiagramView).
4. **Brainstorm + plan.** Use `superpowers:brainstorming` if the spec is ambiguous; otherwise jump to `superpowers:writing-plans` and save to `docs/superpowers/plans/YYYY-MM-DD-guitar-tabs-<slug>.md`.
5. **Self-review the plan.** Spec coverage / placeholder scan / type consistency / runtime traps (provider scope, dep churn, identity stability).
6. **Execute via subagents.** `superpowers:subagent-driven-development`. Two-stage review per task. Sonnet for implementation; Haiku for cheap verification reviews.
7. **Final reviewer pass.** `superpowers:code-reviewer` over the whole branch diff. Address critical/important issues before PR.
8. **Ship.** `superpowers:finishing-a-development-branch` → push + `gh pr create` with a complete test plan.
9. **After merge:** `git checkout main && git pull --ff-only && git branch -D <branch>` (squash-merge means `-D` not `-d`).
10. **Update `Features.md` + `test-cases/11-tabs.md`** in the same change set as the implementation. The maintenance contract in `CLAUDE.md` is enforced.
11. **Update this handoff doc** per the **Doc-update protocol** above. The user relies on it as the single resume point — leaving it stale defeats the whole purpose. Same branch as cleanup OR fold into the next ticket; never skip.

---

## Next Action

**TAB-012: Mobile read-only + playback** — branch not yet created. 2-day ticket. Last M1 ticket — after this, M1 = "viewer ship-point" complete. No dependencies block it (TAB-005 playback shipped long ago).

Bootstrap:
- `git checkout main && git pull --ff-only`
- `git checkout -b plan/guitar-tabs-mobile`

Spec section to read in `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`:
- **"Mobile (KB-040 stance)"** (~L260): defines the mobile contract — read-only + playback only.
  - Files tab: `.alphatex` files visible alongside docs and diagrams.
  - Read tab: `TabView` mounts in `readOnly` mode. Toolbar shows play/pause/loop/scrub. Editor surface is dropped from the bundle (`next/dynamic` lazy import only on desktop).
  - Properties panel: sections + tuning shown read-only. (TAB-007a's Attach affordances and detach buttons must auto-hide via the existing `readOnly` flag — already wired.)
  - **No "Create new tab" button on mobile** — matches `.md` / `.json` mobile gating.

Patterns to mirror (grep first):
- `useResponsive` / `useIsMobile` hooks if they exist; otherwise check how `.md` / `.json` mobile gating is implemented today (search `mobile` and `isMobile` in `src/app/knowledge_base/shell/` and palette command files).
- The "Create new" palette commands for documents and diagrams — find the spot that gates them on mobile and add a sibling gate for `.alphatex`.
- `TabView`'s `readOnly` prop already exists (TAB-007a) and threads through to `TabProperties` to suppress chrome — verify it actually suppresses the toolbar's edit-only affordances when set (none today, since TAB-008 editor isn't built yet — this is the contract for when TAB-008 lands).

Ship target:
- `TabView` accepts/respects `readOnly` end-to-end on mobile (Files-tab routing always passes `readOnly={isMobile}`).
- "Create new tab" palette command gated off on mobile (parallel to `.md` / `.json`).
- Mobile bundle size: `next/dynamic` lazy import on the editor surface (which doesn't exist yet — drop in a marker comment so TAB-008 picks it up).
- `Features.md` §11.7 → new §11.7 Mobile entry (push Pending to §11.8 if Mobile-Editor distinction matters; otherwise keep as §11.7).
- `test-cases/11-tabs.md` §11.8 (next free) for mobile gating cases.

Out of scope:
- Editor surfaces (TAB-008+).
- Touch-first UX overhaul of toolbar (defer if TAB-005's existing transport works adequately on touch).
- Mobile-specific keyboard shortcut adjustments.

Brainstorm decisions to confirm:
1. **`isMobile` source of truth.** Existing hook? Viewport-based vs UA sniff? Pick one and reuse.
2. **`readOnly` propagation.** Does Files-tab routing already know `isMobile`? Where does the flag flow into `renderTabPaneEntry`?
3. **Bundle exclusion.** `next/dynamic` with `{ ssr: false }` is the default for client-only chunks. Editor doesn't exist yet — leave a clear stub for TAB-008 rather than building infra for vapor.

---

## How to read this doc

If you arrived here from a fresh context:

1. Read sections **Bootstrap** + **Where we are** + **Project conventions** first.
2. Skim **Reference architecture** to know where things live.
3. Jump to **Next Action** and start there.
4. The **Open follow-up items** list is parked; don't pick those up unless the user explicitly asks.
5. Keep this doc current as you ship — update the "Where we are" table at the bottom of each ticket's PR description.
