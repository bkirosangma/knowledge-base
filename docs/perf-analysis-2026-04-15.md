# Dev server CPU/memory analysis — 2026-04-15

The dev server consumes noticeable CPU and, more visibly, keeps hitting Next.js's "approaching memory threshold, restarting…" warning. This is a read-only analysis of the most likely contributors, ordered by how much relief each would give if fixed. No code changes here.

## Observed evidence

- `.next/dev` is **650 MB** on disk. `.next/cache` is 168 KB, `.next/build` is 848 KB. So the dev cache alone is the dominant disk footprint, and Turbopack keeps a mirrored working set of it in the Node process.
- Preview logs show Turbopack auto-restarts: `"⚠ Server is approaching the used memory threshold, restarting..."` appearing multiple times in a single session.
- `graphify-out/` is only 3.8 MB and contains `.json` + `.md` files. It's not picked up by `tsconfig.json` (which only includes `**/*.ts`, `**/*.tsx`, `**/*.mts`), so this is **not** inflating the type checker or Turbopack module graph.

## Hot paths (client side)

### 1. Full doc HTML→Markdown on every keystroke — **HIGH**

**File:** `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx:172`
```ts
onUpdate: ({ editor: ed }) => {
  …
  const md = htmlToMarkdown(ed.getHTML());
  onChange?.(md);
}
```

`htmlToMarkdown` in `markdownSerializer.ts:12` does:
- `ed.getHTML()` — ProseMirror re-serializes the entire doc to HTML.
- `div.innerHTML = html` — browser parses the whole HTML string back into a DOM.
- Recursive `nodeToMarkdown` walk over every DOM node.

This runs synchronously on every keystroke. For a doc with a few hundred nodes it's cheap, but for the larger notes in the vault it's the single heaviest per-keystroke cost. The resulting `onChange(md)` then fires React state updates up to `useDocuments` (`updateContent` at `useDocuments.ts:86–89`) — just two `setState`s, so the propagation itself isn't the issue, but the serialize-parse-walk before it is.

**Good news:** `updateDocumentLinks` is **only** called from the `Cmd+S` handler (`knowledgeBase.tsx:174`), not from `onChange`. So the backlinks index is not being rebuilt per keystroke — we previously suspected this.

**Fix shape:** debounce `onChange` (e.g. 200–300 ms) so the serialize runs once per pause rather than once per key. Save/dirty tracking can continue to fire immediately off `editor.state`; only the *serialization* needs the debounce.

### 2. `MarkdownReveal` `appendTransaction` runs doc-wide per transaction — **HIGH**

**File:** `src/app/knowledge_base/features/document/extensions/markdownReveal.ts:88–205`

`appendTransaction` fires for every transaction (each key, selection move, mouse click). It:
- `doc.forEach(...)` over every top-level block to find the existing rawBlock (this is cheap — top-level only, not descendants).
- When the cursor crosses a block boundary, calls `rawBlockToRichNodes` (which itself calls `markdownToHtml` → `PMDOMParser.parse`) and/or `richBlockToRawFragment`.

The block-crossing case is already bounded (only fires when you cross a boundary), so it's not per-keystroke in most flows. But when a user arrow-keys through a long doc, every boundary-cross re-parses markdown once. In combination with hot path #1, a held arrow key double-charges the CPU.

**Fix shape:** cache the most recent conversion keyed by `(rawBlock.textContent, attrs)` so re-entering the same block is O(1). Bail earlier if the cursor didn't change blocks.

### 3. `forceUpdate` on every selection/transaction — **MEDIUM**

**File:** `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx:176, 181–182`

```ts
onSelectionUpdate: () => forceUpdate((n) => n + 1),
onTransaction: ({ transaction }) => {
  if (transaction.getMeta("rawSwap")) rawSwapRef.current = true;
  forceUpdate((n) => n + 1);
}
```

Every cursor move or tick re-renders the whole toolbar (~15 `editor.isActive(...)` checks), the `LinkEditorPopover` (which re-reads `editor.state.selection` / `editor.state.doc` via its `useMemo`), and the mode-toggle buttons. The popover's `useMemo` depends on `editor.state.selection` and `editor.state.doc`, both of which are new references on every tr — so the `useMemo` re-evaluates anyway. In other words the extra force-render is measurable *and* the popover's memo doesn't actually save work.

Not catastrophic, but cumulative: every key ticks React through ~20 `editor.isActive` calls and a popover re-render.

**Fix shape:** drive the toolbar-active state from a ProseMirror plugin's `view.state` rather than a parent forceUpdate — or at minimum, drop `onSelectionUpdate`'s update and re-render only on `onTransaction` when the selection or a toolbar-relevant mark actually changed.

### 4. Wiki-link suggestion popup: full innerHTML rebuild per keystroke — **MEDIUM** (only while `[[` is open)

**File:** `src/app/knowledge_base/features/document/extensions/wikiLink.ts` (the `Suggestion` render block, ~line 305)

`onUpdate` rewrites `popup.innerHTML` and re-queries/re-binds click handlers for every item. The filter runs `.includes()` over all doc paths. For a vault of ≤ a few hundred files this is fine; it scales linearly. Only noticeable while the user is actively typing inside `[[…]]`.

**Fix shape:** if a vault grows past ~1k paths, swap to a small fuzzy matcher (Fuse or hand-rolled) and reuse existing DOM nodes instead of nuking innerHTML.

### 5. Wiki-link nodeView `paintFromAttrs` — **LOW**

**File:** `src/app/knowledge_base/features/document/extensions/wikiLink.ts:150`

`paintFromAttrs` guards its writes (`if (dom.textContent !== display)`, `if (iconEl.dataset.kind !== kind)`), so unchanged runs are cheap. The single-node `resolveExistingPath` is O(candidates) with ~4 candidates — negligible.

**No fix needed** unless profiling shows this surfacing later.

## Hot paths (server side)

### 6. `.next/dev` cache growth — **HIGH**

Turbopack keeps a per-module cache in `.next/dev/`. Over the lifetime of a dev session and across restarts, this directory accumulates chunk files, SWC-compiled modules, HMR deltas, and source maps. 650 MB on disk mirrored in Node's working set is almost certainly the direct cause of the "approaching memory threshold" auto-restart.

**Fix shape:**
- Periodically `rm -rf .next/dev` between long sessions (stop the dev server first). This is safe; Turbopack rebuilds it.
- For long-running sessions, consider running with `next dev` (the Webpack path) which has a more aggressively bounded working set than Turbopack — trading compile speed for RSS ceiling. This is a known Turbopack tradeoff at Next 16.
- Do NOT add `graphify-out/` or `node_modules` paths to the Next app's module graph. Confirmed already excluded.

### 7. File System Access API handles — **LOW / informational**

`useDocuments` / `useFileExplorer` hold directory handles but only traverse the tree on explicit actions. No polling. No setInterval/setTimeout leak candidates found in `MarkdownEditor`, `MarkdownPane`, `LinkEditorPopover`, or `useDocuments`. `TablePicker` (`MarkdownEditor.tsx:73–78`) attaches `mousedown` with a matching cleanup.

**No fix needed.**

## Concrete next steps, ranked by cost/benefit

| # | Change | Expected win | Effort |
|---|--------|--------------|--------|
| 1 | Debounce `onUpdate → htmlToMarkdown → onChange` at ~250 ms | Large — removes the heaviest per-keystroke work | Small (one ref + setTimeout in MarkdownEditor) |
| 2 | Purge `.next/dev` + confirm Turbopack threshold warnings stop | Frees 650 MB + stops auto-restart loop | None (just run `rm -rf .next/dev` between sessions; or script it into `predev`) |
| 3 | Cache `rawBlockToRichNodes` / `richBlockToRawFragment` results per block content | Medium — only helps when cursor traverses many blocks | Small (WeakMap keyed on rawBlock identity) |
| 4 | Drop the `forceUpdate` in `onSelectionUpdate`; gate the `onTransaction` version on selection/mark deltas | Medium — removes ~20 `isActive` calls per tick | Small |
| 5 | (If vault grows) swap suggestion popup to fuzzy search + node reuse | Only matters past ~1k files | Medium |
| 6 | (Optional) try `next dev` without Turbopack for long sessions | Smaller RSS ceiling, slower compiles | None |

**Recommendation:** do #1 and #2 first. Both are ~minutes of work and address the two biggest observed symptoms (per-keystroke latency and the auto-restart loop). #3 and #4 are refinements once the headline items land.
