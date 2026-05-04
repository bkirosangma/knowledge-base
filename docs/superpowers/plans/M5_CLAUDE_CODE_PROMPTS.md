# M5 Prompts — Quarter Horizon

> Copy-paste these into Claude Code one at a time. M5 tickets are larger than M0–M4 and most need a scoping conversation **before** code is written. Every prompt below has a built-in "stop and propose a plan first" gate.
>
> **Recommended order** (dependency-aware):
>
> 1. KB-054 (frontmatter — possible P1 data-loss; do first to confirm severity)
> 2. KB-056 (undo for file ops — small, high trust win)
> 3. KB-050 (tags — feeds KB-042 graph guard and KB-055)
> 4. KB-051 (inline diagram embed — needs KB-011 export from M1)
> 5. KB-057 (multi-select drag)
> 6. KB-052 (version history UI)
> 7. KB-055 (publish read-only HTML bundle)
> 8. KB-053 (daily notes / templates)
> 9. KB-059 (folder move — schedule when no other tickets are mid-flight)
> 10. KB-058 (plugin surface — only when justified by user demand)

---

## Session opener — paste once at the start of the M5 session

```
You're working on the Knowledge Base codebase. M0 through M4 are merged. We're starting M5 — quarter-horizon features. These are larger than M0–M4 tickets.

Before writing any code in this session:

1. Read IMPLEMENTATION_PLAN.md cover to cover. Pay attention to "Working agreements" at the end.
2. Read AGENTS.md and acknowledge the non-stable Next.js notice.
3. Confirm M0–M4 status by running `git log --oneline | grep -E "KB-0[0-4][0-9]"` and reporting how many KB-0XX tickets you can see in history. If anything earlier than KB-050 looks unmerged, stop and tell me.
4. Read Knowledge Base Audit.html — specifically the "Functional gaps" section. M5 implements most of those gaps.

For every M5 ticket I paste:
- The ticket entry in IMPLEMENTATION_PLAN.md is intentionally short — it's a brief, not a spec.
- You MUST propose a detailed plan first (data shape, file list, UX, test plan, rollout) and wait for my approval before writing code.
- Some M5 tickets are 1-week scoped; if your plan exceeds that, propose a phased PR breakdown.
- One PR per phase. Commit message format: "KB-XXX [phase N]: <what>".
- Respect the "Working agreements": domain/infra boundary, classified FileSystemError flow, per-vault scopedKey(), prose-spec discipline, design tokens.

Reply when ready with: M0–M4 confirmation, AGENTS.md acknowledgement, and "Ready for first M5 ticket."
```

---

## KB-054 — Frontmatter editor (do first — possible P1)

```
Implement KB-054 from IMPLEMENTATION_PLAN.md (Frontmatter editor).

CRITICAL FIRST STEP — data-loss check:
Before any planning, answer this: does `repositoryHelpers` (or equivalent in the document save path) currently strip YAML frontmatter on save? Open a doc with `---\ntitle: Test\n---\n# Body` frontmatter, save it, and diff the file on disk.

- If frontmatter is preserved → this ticket is P2 polish (UX for editing it).
- If frontmatter is stripped → this is a P1 silent data-loss bug for any Obsidian importer. Stop, tell me, and propose a hotfix PR FIRST that just preserves frontmatter on save (no UI), then a follow-up PR for the editor UI.

Either way, when you're ready to proceed, propose:
1. Data flow: where frontmatter is parsed in / serialized out, what library (gray-matter? hand-rolled?).
2. UI surface: a collapsible panel above the editor? A sidebar? Inline?
3. Schema: which keys get typed inputs (tags, date, aliases) vs raw key/value rows?
4. Test plan: unit (round-trip preservation), e2e (edit + save + reopen).
5. Migration: do we touch existing files at all, or only on next save?

Wait for approval before writing code. Reference: Audit gaps section, KB-054 entry.
```

---

## KB-056 — Undo for file ops

```
Implement KB-056 from IMPLEMENTATION_PLAN.md (5-second undo for delete/move).

Propose a plan first covering:
1. **Scope of "file ops":** delete file, delete folder, move file, move folder, rename. Confirm each.
2. **Undo mechanism:**
   - For delete: do we soft-delete to `.trash/`? Or hold the bytes in memory for 5s?
   - For move: just record the previous path and re-issue a move on undo?
   - What happens if the user does another op during the 5s window — does the undo toast stack, or does the new op cancel the pending undo?
3. **UI:** undo toast appears in the existing toast stack (KB-014). Single "Undo" button with countdown bar.
4. **Wiki-link integrity:** delete cleans up wiki-links. Undo must restore them. Where does that bookkeeping live?
5. **Index integrity:** delete removes from VaultIndex (KB-010). Undo re-adds. Same question.
6. **Tests:** unit for the undo store, e2e for delete-undo, move-undo, delete-then-rapid-second-delete.

Wait for approval. Bias toward soft-delete-to-`.trash/` — survives reload, easier to reason about.
```

---

## KB-050 — Tag system

```
Implement KB-050 from IMPLEMENTATION_PLAN.md (Tag system + tag-filtered explorer).

This is roughly a 1-week ticket. Propose a phased PR breakdown:

**Phase 1 — parsing & indexing**
- Extend the existing VaultIndex (from KB-010) with a tag field.
- Parse `#tag` from .md bodies. Honor common edge cases: don't match `#fragment` in URLs, don't match inside code blocks, don't match inside frontmatter (frontmatter `tags: []` is a separate input — both feed the same set per file).
- Diagram JSON: read a `tags: []` field on the doc root and per-node.

**Phase 2 — surface**
- A tag rail in the explorer (or a tab next to Files / Read / Graph).
- Click a tag → filter explorer + graph to docs/diagrams with that tag.
- Multi-select tags = AND.

**Phase 3 — authoring**
- Autocomplete `#` in the document editor (Tiptap suggestion plugin).
- Tag pills in the diagram QuickInspector for the selected node.

For each phase:
- Files touched
- Test names (unit + e2e)
- Acceptance checklist

Propose, wait for approval, ship one PR per phase.
```

---

## KB-051 — Inline diagram embed

```
Implement KB-051 from IMPLEMENTATION_PLAN.md (`![[diagram-name]]` renders inline).

Prerequisite check: confirm KB-011 (diagram SVG export) is merged and `exportDiagramSVG.ts` is the right entry point. If not, stop.

Propose a plan covering:
1. **Syntax:** does `![[name]]` render inline only in **read mode** or also in the editor (live preview)? My default is read-mode-only — editing should show the link, not a heavy embed.
2. **Caching:** inline embeds re-export every render or cache the SVG string? Cache invalidation strategy when the source diagram changes.
3. **Sizing:** width = container width, height = aspect-preserved? Add an explicit syntax for sizing (`![[name|400]]`)?
4. **Backlinks:** an inline embed counts as a link in the index (KB-010 backlinks already covers this — confirm it picks up `![[…]]` not just `[[…]]`).
5. **Print/PDF (KB-011 print stylesheet):** embeds must render in the printed PDF. Verify.
6. **Tests:** read-mode renders, backlink shows up, print stylesheet test.

Wait for approval. One PR.
```

---

## KB-057 — Multi-select drag in explorer

```
Implement KB-057 from IMPLEMENTATION_PLAN.md (multi-select drag).

Prerequisite check: KB-033 (ARIA tree) must be merged. The selection model and keyboard interaction need that baseline.

Propose a plan covering:
1. **Selection UX:** Click selects one. Cmd/Ctrl+Click toggles. Shift+Click extends range. Confirm matches OS-native expectations on Mac and Windows.
2. **Visual:** how is multi-selection drawn? Same row highlight, plus a count chip on drag?
3. **Drag behavior:** drag any selected row → all selected rows go with it. Drop target: any folder. Reject drops onto self or descendants of selected.
4. **ARIA:** `aria-multiselectable="true"` on the tree, `aria-selected` on each row.
5. **Move atomicity:** if 5 files are being moved and #3 fails (name collision), what happens? Propose: stop, surface a conflict modal, offer per-file resolve.
6. **Wiki-link rewrites:** existing single-file move presumably rewrites links. Multi-file move: same path, batched. Test.
7. **Tests:** keyboard multi-select, mouse multi-select, drag-and-drop, partial-failure handling.

Wait for approval. One PR.
```

---

## KB-052 — Version history UI

```
Implement KB-052 from IMPLEMENTATION_PLAN.md (persisted version history UI).

This is ~1 week. Propose a phased breakdown.

Discovery first:
1. Open the existing `HistoryPanel.tsx` and `.history.json` sidecar plumbing. Report: what's already wired? What's the on-disk schema? How often are snapshots written? Is retention bounded?
2. If retention is unbounded, the first PR is a retention policy (e.g. last 50 snapshots + daily snapshots for 30 days). Propose the policy.

Then propose the UI:
- Where does it live? A right-rail panel? A modal? A dedicated route?
- Diff view: side-by-side or inline? Use `diff-match-patch` or roll our own?
- Restore: full overwrite (with a confirm), or branch into a new file?
- Diagrams have history too — does the same UI handle JSON diffs, or is it docs-only for now?

Phases:
- Phase 1 — retention policy + storage hardening (pure infra, no UI changes)
- Phase 2 — viewer (read-only)
- Phase 3 — restore action

Wait for approval. One PR per phase.
```

---

## KB-055 — Publish read-only HTML bundle

```
Implement KB-055 from IMPLEMENTATION_PLAN.md (publish vault as a browseable HTML site).

This is ~1 week. Propose a plan.

Scope decisions to confirm before code:
1. **Output shape:** single HTML file with everything inlined (super-portable, big), or a folder with `index.html` + assets (smaller, needs hosting)?
2. **What's included:** all docs and diagrams, or only those tagged `published: true` in frontmatter?
3. **Renderer:** server-side render via Next, or a build script that walks the vault and produces static files?
4. **Wiki-links:** must resolve to relative URLs in the published bundle. Diagrams render via the SVG export from KB-011.
5. **Search in published bundle:** include a tiny client-side fulltext index, or skip?
6. **Style:** matches read-mode app styling? Or a stripped editorial template?
7. **Where the export action lives:** a new menu item, ExportMenu (KB-011) integration, or a dedicated "Publish" surface?

Propose plan + phased PRs. Wait for approval.

Constraint: this must NOT require a server. Output should be openable directly from the filesystem (file://) for the simple folder case.
```

---

## KB-053 — Daily notes / templates

```
Implement KB-053 from IMPLEMENTATION_PLAN.md (daily notes + templates).

Two related features. Confirm both are in scope.

Propose a plan covering:
1. **Templates:** where do they live? `.templates/` folder in vault? How are they discovered?
2. **Template variables:** at minimum `{{date}}`, `{{title}}`, `{{cursor}}`. Anything else?
3. **New from template:** Cmd+N variant (Cmd+Shift+N?) opens a picker.
4. **Daily notes:** a single hotkey that opens (or creates) `daily/YYYY-MM-DD.md` from a designated template.
5. **Configuration:** where does the user set the daily-note template, folder, date format? Settings UI exists?
6. **Tests:** template discovery, variable expansion, daily-note creation, daily-note open-when-exists.

Wait for approval. Likely one PR; phase if it grows.
```

---

## KB-059 — Move feature folder to `src/features/`

```
Implement KB-059 from IMPLEMENTATION_PLAN.md (move `app/knowledge_base/` to `src/features/`).

DO NOT START unless: no other M-tickets are in flight. Confirm with me first.

This is a structural refactor with high churn surface (every import in the codebase). Propose a plan:

1. **Target structure:** confirm `src/features/...` is right vs `src/knowledge_base/`. The audit suggests `src/features/`.
2. **Route shell:** what stays in `app/`? Just `app/page.tsx` importing from `@/features/...`?
3. **Path alias:** `@/features/*` already configured in `tsconfig.json`? If not, add it.
4. **Mechanical migration:** propose using `git mv` (preserves history) for the folder, then a single sed/codemod pass for imports.
5. **Verify:** every test green, build green, no broken imports. Run `pnpm typecheck && pnpm test && pnpm build` and `npx playwright test` before opening the PR.
6. **Reviewer note:** this PR will be massive in line count but trivial in semantic change. Tag it clearly.

Wait for approval. One PR. Do this on a Friday afternoon — merge Monday morning so any breakage shows up while the team is around.
```

---

## KB-058 — Plugin / extension surface

```
Before implementing KB-058, answer this: do we have user demand for a plugin surface yet, or is this premature?

The audit flags this as P3 — "only matters at scale." Building a plugin API before users ask for it locks you into commitments you can't unship.

Propose ONE of:

(a) **Defer.** Document why we're not building it yet. Link to the issues / users that would change the calculus. Close the ticket as "won't do, will reopen when justified."

(b) **Minimum surface.** A single, well-scoped extension point (e.g. "register a custom Tiptap node" OR "register a command palette entry"). Tightly defined contract. No promise of broader API.

(c) **Full plugin system.** Manifest format, sandbox model, permission UI, distribution. This is a multi-week project. Propose phases.

I lean (a) unless you can cite real user demand. Wait for my call before writing code.
```

---

## After M5 — wrap-up prompt

```
M5 implementation complete (or with explicit defers).

Final pass:
1. Update IMPLEMENTATION_PLAN.md status — mark each KB-05X with ✅ Merged, 🚧 Deferred, or ❌ Won't do, with one-line reasons.
2. Update Knowledge Base Audit.html footer to bump severity counts if any findings are now resolved.
3. Run the full test suite: `pnpm test && npx playwright test`. Paste the totals.
4. Generate a short CHANGELOG.md entry covering everything M0 through M5 — group by milestone, name each KB-XXX, one-line user-visible impact.
5. Tag a release: `git tag v1.0.0` (or whatever the project's semver discipline is — confirm first).

Reply with: changelog, test totals, IMPLEMENTATION_PLAN.md diff.
```

---

## Notes for you

- **KB-054 first.** If frontmatter is being silently stripped today, every other M5 ticket is less important than fixing it.
- **Scoping gates are intentional.** M5 tickets in the plan are intentionally short briefs because each deserves a real product conversation. Don't let the agent skip that.
- **KB-058 (plugins) — push back.** The default behavior should be "defer this." Premature plugin APIs are one of the most common avoidable mistakes in tools like this.
- **KB-059 (folder move) — Friday afternoon.** Massive diff, trivial change. Land it when nothing else is mid-flight so any breakage is obvious to attribute.
- **After every approved phase**, the agent should give you the same shape: ticket id, files changed, acceptance ✅/❌, verify output. If it stops doing that, paste the session opener again.
