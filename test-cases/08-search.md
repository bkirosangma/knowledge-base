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
- **SEARCH-1.4-02** ❌ **Main thread does not block >16 ms during a query** — asserted in PR 10c's e2e via `performance.now()` around the worker round-trip while a `requestAnimationFrame` loop measures frame intervals.

## SEARCH-2.1 Command palette — vault search mode (PR 10c)

`shared/components/CommandPalette.tsx`

- **SEARCH-2.1-01** ❌ **Without `>` prefix, palette routes to vault search** — typed text returns file results, not commands.
- **SEARCH-2.1-02** ❌ **With `>` prefix, palette retains command behaviour** — existing command-filter UX unchanged; `>op` filters commands containing "op".
- **SEARCH-2.1-03** ❌ **Empty input shows mode hint** — "Type `>` for commands" visible when no query.
- **SEARCH-2.1-04** ❌ **Result row shows path + snippet** — relative path, kind chip (doc/diagram), ±40-char snippet with the matched span emphasised.
- **SEARCH-2.1-05** ❌ **Enter on result opens the file in the focused pane** — same convention as `panes.openFile`.

## SEARCH-2.2 Search panel (PR 10c)

`features/search/SearchPanel.tsx`

- **SEARCH-2.2-01** ❌ **Dedicated tab with a search input and result list** — accessible via palette command + ⌘⇧F shortcut.
- **SEARCH-2.2-02** ❌ **Filter chips: kind / field / folder** — narrowing chips compose by intersection.
- **SEARCH-2.2-03** ❌ **Click result opens the file in the focused pane**.
- **SEARCH-2.2-04** ❌ **Empty-state copy** — distinct from "no results" vs "type to search".

## SEARCH-3.1 Diagram-side hits (PR 10c)

- **SEARCH-3.1-01** ❌ **Clicking a diagram-label result opens the diagram with a pending centre-on-node intent** — the intent is consumed once on `DiagramView` mount, the node is selected, and the viewport is centred on it. Reuses or extends `features/diagram/components/Canvas.tsx#fitToContent`. _(If a viewport-translating helper does not yet exist, PR 10c introduces a small, focused helper rather than driving setTimeout chains.)_
- **SEARCH-3.1-02** ❌ **Stale intents are dropped** — opening a different file mid-flight cancels the previous pending intent.

## SEARCH-4.1 Incremental indexing (PR 10b)

`features/search/useVaultSearch.ts`, `infrastructure/`

- **SEARCH-4.1-01** ❌ **Edit + save reflects in search within 1 second** — typing in a doc, saving, then querying returns the updated body. Subscribes to the document save signal directly (not just FileWatcher polling) so the latency budget is met without bumping the polling interval.
- **SEARCH-4.1-02** ❌ **Rename — file appears at new path, old path drops out** — index removes old, adds new in one transaction.
- **SEARCH-4.1-03** ❌ **Delete — file drops from results within one tick**.
- **SEARCH-4.1-04** ❌ **Initial vault open primes the index** — first vault open triggers a full pass; subsequent vault opens reuse the worker but rebuild for the new tree.
- **SEARCH-4.1-05** ❌ **Diagram save updates `field: "label" / "title" / "flow"` postings**.
