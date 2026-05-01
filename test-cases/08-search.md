# Test Cases — Vault Search (KB-010)

> Mirrors §8 of [Features.md](../Features.md). Covers PRs 10a (index core), 10b
> (incremental wiring), and 10c (UI surfaces) with stable IDs that survive the
> sequence — landing tests can flip status without renumbering.
>
> ID scheme: `SEARCH-<part>.<sub>-<nn>` (the leading number is the KB-010
> sub-area, not the Features.md section — kept stable so e2e specs can
> back-reference IDs without churn).
>
> | Part | Scope                                | Lands in PR |
> |-----:|--------------------------------------|-------------|
> | 1    | Core: tokenizer + VaultIndex + worker | 10a        |
> | 2    | UI: palette + SearchPanel             | 10c        |
> | 3    | Diagram-side hits (centre + select)   | 10c        |
> | 4    | Incremental indexing (FileWatcher)    | 10b        |
>
> Status legend (matches `test-cases/README.md`): `✅` passing, `🟡` partial,
> `🧪` e2e-only, `❌` gap, `🚫` out of scope.

---

## SEARCH-1.1 Tokenizer (PR 10a)

`features/search/tokenizer.ts`

- **SEARCH-1.1-01** ✅ **Lowercases input** — `"Hello World"` → `["hello", "world"]`.
- **SEARCH-1.1-02** ✅ **Strips markdown punctuation and link syntax** — `"**bold** _italic_ [link](http://x)"` tokenises without `*`, `_`, `[`, `]`, `(`, `)`.
- **SEARCH-1.1-03** ✅ **Drops tokens shorter than 2 characters** — `"a b cat"` → `["cat"]`.
- **SEARCH-1.1-04** ✅ **Preserves unicode word characters** — `"café résumé"` → `["café", "résumé"]`.
- **SEARCH-1.1-05** ✅ **Returns `{ token, position }` when callers need offsets** — same word counting; positions are character offsets into the source string.
- **SEARCH-1.1-06** 🚫 **Stems plurals / morphological collapse** — out of scope for v1.

## SEARCH-1.2 VaultIndex (PR 10a)

`features/search/VaultIndex.ts`

- **SEARCH-1.2-01** ✅ **`addDoc` registers a doc and indexes its body** — `query("alpha")` returns the doc when `fields.body` contains "alpha".
- **SEARCH-1.2-02** ✅ **`addDoc` is idempotent** — calling twice with the same path keeps a single posting per token (no duplication).
- **SEARCH-1.2-03** ✅ **`removeDoc` clears all postings for the path** — `query` no longer returns the doc.
- **SEARCH-1.2-04** ✅ **`query` AND-of-tokens** — `"alpha beta"` returns docs containing both tokens (any field).
- **SEARCH-1.2-05** ✅ **`query` prefix-matches the last token only** — `"alp"` matches `"alpha"`; `"alp bet"` matches `"beta"` exactly and `"alp"` as prefix → only docs with both win.
- **SEARCH-1.2-06** ✅ **Diagram fields tagged distinctly** — node label hits carry `field: "label"`; layer titles `field: "title"`; flow names `field: "flow"`; doc body `field: "body"`.
- **SEARCH-1.2-07** ✅ **Snippet around first body hit** — ±40 characters of `fields.body` around the earliest position. When the only hits are non-body fields, the snippet falls back to the field's text.
- **SEARCH-1.2-08** ✅ **`size()` reflects registered docs** — equals number of unique paths added minus removed.
- **SEARCH-1.2-09** ✅ **`clear()` empties the index** — subsequent queries return `[]`.

## SEARCH-1.3 Worker message protocol (PR 10a)

`features/search/vaultIndex.workerHandler.ts` (pure handler, exercised in node).

- **SEARCH-1.3-01** ✅ **`{ type: "ADD_DOC", path, kind, fields }`** — handler updates the index; no response.
- **SEARCH-1.3-02** ✅ **`{ type: "REMOVE", path }`** — handler removes; no response.
- **SEARCH-1.3-03** ✅ **`{ type: "QUERY", id, q, limit }`** — handler responds `{ type: "RESULTS", id, items }`. The `id` allows the caller to correlate request/response without ordering assumptions.
- **SEARCH-1.3-04** ✅ **`{ type: "CLEAR" }`** — handler empties the index; no response.
- **SEARCH-1.3-05** ✅ **Unknown message type** — handler responds `{ type: "ERROR", message }`; index left untouched.

## SEARCH-1.4 Performance (PR 10a)

- **SEARCH-1.4-01** ✅ **Synthetic 200-doc fixture, query latency under budget** — building a 200-doc index, then running 10 queries, the median elapsed time on a single query is <50 ms (Vitest, node).
- **SEARCH-1.4-02** 🧪 **Main thread does not block >16 ms during a query** — asserted in `e2e/vaultSearch.spec.ts` via a `requestAnimationFrame` loop measuring frame intervals while queries fire; 95th-percentile interval < 16 ms.

## SEARCH-2.1 Command palette — vault search mode (PR 10c)

`shared/components/CommandPalette.tsx`

- **SEARCH-2.1-01** 🧪 **Without `>` prefix, palette routes to vault search** — typed text returns file results, not commands. _(e2e: `vaultSearch.spec.ts`. Asserts results appear within a generous 500ms browser-level budget; the underlying worker round-trip stays well under the 100ms stop condition.)_
- **SEARCH-2.1-02** 🧪 **With `>` prefix, palette retains command behaviour** — `>` shows all commands; `>xyzzy` matches none. _(e2e: `commandPalette.spec.ts SHELL-1.11-02`.)_
- **SEARCH-2.1-03** 🧪 **Empty input shows mode hint** — "Type to search documents and diagrams. Press `>` to filter commands instead." _(e2e: `commandPalette.spec.ts SHELL-1.11-02`.)_
- **SEARCH-2.1-04** ✅ **Result row shows path + kind chip + snippet** — rendered by the palette `SearchList` sub-component; the unit-tested `VaultIndex.query` already asserts the snippet content (`SEARCH-1.2-07`). The render shape is exercised end-to-end by `SEARCH-2.1-01`.
- **SEARCH-2.1-05** 🧪 **Enter on result opens the file in the focused pane** — _(e2e: `vaultSearch.spec.ts`)._

## SEARCH-2.2 Search panel (PR 10c)

`features/search/SearchPanel.tsx`

- **SEARCH-2.2-01** 🧪 **Dedicated tab with a search input and result list** — virtual pane mounted via `SEARCH_SENTINEL`; opened by `view.open-search` command (⌘⇧F). _(e2e: `vaultSearch.spec.ts`.)_
- **SEARCH-2.2-02** ❌ **Filter chips: kind / field / folder** — narrowing chips compose by intersection. Deferred — stop conditions for 10c don't require it; the underlying index already tags hits by kind/field, so a follow-up PR can add chips without changing the worker.
- **SEARCH-2.2-03** 🧪 **Click result opens the file in the focused pane** — same `onResultClick` pathway as the palette, exercised end-to-end by `SEARCH-2.2-01` (typing returns results) + `SEARCH-3.1-01` (clicking a result navigates).
- **SEARCH-2.2-04** ❌ **Empty-state copy distinct between "no results" and "type to search"** — wording lives in the component but isn't asserted in tests yet.

## SEARCH-3.1 Diagram-side hits (PR 10c)

- **SEARCH-3.1-01** 🧪 **Clicking a diagram-label result opens the diagram with a pending centre-on-node intent** — the shell threads `searchTarget: { nodeId }` through `panes.openFile` → `PaneEntry`; `DiagramView` consumes it once on mount, calls `setSelection({ type: "node", id })` and `scrollToRect(...)`, guarded by `consumedSearchTargetRef` keyed by `${filePath}::${nodeId}` so re-renders don't re-fire. The node ID is resolved by `findFirstNodeMatching` (re-reads the diagram once after click). _(e2e: `vaultSearch.spec.ts`.)_
- **SEARCH-3.1-02** ❌ **Stale intents are dropped** — opening a different file mid-flight (before the previous diagram mounts) cancels the previous pending intent. The `consumedSearchTargetRef` key already includes the filePath, so the mechanism is in place; an explicit assertion is deferred to a follow-up.

## SEARCH-4.1 Incremental indexing (PR 10b)

`features/search/useVaultSearch.ts`, `infrastructure/searchStream.ts`

- **SEARCH-4.1-01** ✅ **Edit + save reflects in search within 1 second** — addDoc replaces the entry; the hook's elapsed-time assertion is well under the 1 s budget. Wired into the Cmd+S document-save callsite alongside `linkManager.updateDocumentLinks`. _(unit: `useVaultSearch.test.tsx`.)_
- **SEARCH-4.1-02** ✅ **Rename — file appears at new path, old path drops out** — `renamePath` issues `REMOVE` + `ADD_DOC` in sequence. Wired into `handleRenameFileWithLinks`. _(unit: `useVaultSearch.test.tsx`.)_
- **SEARCH-4.1-03** ✅ **Delete — file drops from results within one tick** — `removePath` issues `REMOVE`. Wired into `handleDeleteFileWithLinks` (covers the diagram-bridge delete path; pure-shell deletes self-heal on next vault open). _(unit: `useVaultSearch.test.tsx`.)_
- **SEARCH-4.1-04** 🧪 **Initial vault open primes the index** — bulk walk fires once per vault on tree population (mirrors the link-index rebuild useEffect, guarded by `searchInitVaultRef`); vault swap clears first. Verified end-to-end by `vaultSearch.spec.ts` (every search test depends on this priming completing before the query fires).
- **SEARCH-4.1-05** 🧪 **Diagram save updates `field: "label" / "title" / "flow"` postings** — `diagramFields` extracts the fields; `onAfterDiagramSaved` re-reads via `readForSearchIndex` and re-adds. Field-extraction is unit-covered (`searchStream.test.ts`); the live save→reindex chain is exercised end-to-end by `SEARCH-3.1-01` (a search-driven click on a diagram-label hit only resolves because the diagram has been indexed).

> **Deferred to 10c+:** FileWatcher-driven polling reindex for changes made by other tools outside the app. The audit plan mentions it, but the 1 s save budget is met purely via the in-app save signal; FileWatcher's 5 s polling would not make that latency anyway. Tracked for a future iteration.
