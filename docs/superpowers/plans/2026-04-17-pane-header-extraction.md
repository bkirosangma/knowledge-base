# Pane Header + Title Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the two shared header rows — the breadcrumb + Read Mode row and the title row — from the diagram and document panes into a pair of reusable components. The title row adopts the document pane's click-to-edit UI for both panes.

**Architecture:** Two new components under `shared/components`:

1. `PaneHeader` — the flex row with a breadcrumb (from a `filePath` prop), a spacer, a Read Mode toggle, and a `children` slot rendered after the Read Mode button for per-pane extras (currently only the document pane's backlinks button).
2. `PaneTitle` — the row below the header, rendering either a large `<h1>` or, when clicked, an inline editable `<input>`. The editable state (`isEditingTitle`, `titleDraft`) is owned internally. Accepts `title: string` and an optional `onTitleChange?: (newTitle: string) => void`.

Swap the inline JSX in both `DiagramView.tsx` and `MarkdownPane.tsx` for calls to these two components.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind CSS 4, `lucide-react` (all already in use).

**Note on testing:** This project has no unit/integration test framework (`package.json` exposes only `dev`, `build`, `lint`). Verification uses the preview MCP tools (`preview_start`, `preview_snapshot`, `preview_screenshot`, `preview_click`) against the running `next dev` server.

---

## Behavior & appearance changes (read before starting)

This is mostly a refactor, but merging the title rows introduces two small behavior changes in the diagram pane. The user explicitly asked for a common title row using the document pane's UI, so these are intended.

1. **Diagram title becomes click-to-edit.** Today the diagram pane renders a static `<h1>` at `DiagramView.tsx:940-944`. After extraction it renders the same click-to-edit UI as the document pane. Hovering shows a light `hover:bg-slate-50` pill; clicking opens an inline `<input>`. Blur / Enter / Escape behave like the document.
2. **Persistence is still a no-op in both panes.** `MarkdownPane` calls `onTitleChange?.(newTitle)` but `DocumentView.tsx` doesn't pass an `onTitleChange` prop today — i.e. the document title is already "editable-looking but does not persist". `DiagramView` will also not pass `onTitleChange`, matching that behavior exactly. Hooking the diagram's filename rename (or wiring to the bridge's `onTitleCommit`) is explicitly **out of scope**; it's a separate feature.

Also out of scope: the per-pane toolbar rows (diagram: Live / Labels / Minimap / zoom at `DiagramView.tsx:947-989`; document: WYSIWYG / Raw / formatting toolbar in `MarkdownEditor.tsx`). Those are "the different tools" the user called out and stay per-pane.

### Wrapper classes on the title row

The existing wrappers differ slightly:

| Pane | Current wrapper classes |
|------|-------------------------|
| Diagram title row (`DiagramView.tsx:940`) | `flex-shrink-0 px-4 pt-3 pb-1 bg-white` |
| Document title row (`MarkdownPane.tsx:104`) | `px-4 pt-3 pb-1` |

The shared `PaneTitle` will render `flex-shrink-0 px-4 pt-3 pb-1 bg-white`. In `MarkdownPane`'s layout — parent `<div className="flex flex-col h-full bg-white">` has `bg-white` set on the whole pane already, and no `min-h-0` which means flex children can't shrink below content anyway — adding `flex-shrink-0 bg-white` produces no observable change.

Same logic applies to `PaneHeader` carrying `flex-shrink-0` (it matches diagram's current behavior and is a no-op in the document pane).

---

## File Structure

| File | Change |
|------|--------|
| `src/app/knowledge_base/shared/components/PaneHeader.tsx` | **Create.** Breadcrumb + Read Mode toggle row. |
| `src/app/knowledge_base/shared/components/PaneTitle.tsx` | **Create.** Editable title row (owns `isEditingTitle` / `titleDraft` state). |
| `src/app/knowledge_base/features/diagram/DiagramView.tsx` | **Modify.** Replace lines 910–937 (breadcrumb row) with `<PaneHeader>`; replace lines 939–944 (title row) with `<PaneTitle>`; drop the now-unused `pathParts` (901) and `diagramTitle` (902–904) locals if nothing else uses them; trim unused icon imports on line 64. |
| `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` | **Modify.** Replace lines 58–101 (toolbar) with `<PaneHeader>` and move the backlinks button into its `children` slot; replace lines 103–130 (title) with `<PaneTitle>`; drop `isEditingTitle` / `titleDraft` state (hooks move into `PaneTitle`) and the `pathParts` local (56); trim unused `lucide-react` imports on line 5. |

### Import-path calculator

- `DiagramView.tsx` (`features/diagram/`) → `PaneHeader` / `PaneTitle` (`shared/components/`): `../../shared/components/PaneHeader`, `../../shared/components/PaneTitle`.
- `MarkdownPane.tsx` (`features/document/components/`) → same targets: `../../../shared/components/PaneHeader`, `../../../shared/components/PaneTitle`.

---

## Task 1: Create `PaneHeader`

**Files:**
- Create: `src/app/knowledge_base/shared/components/PaneHeader.tsx`

- [ ] **Step 1: Create the file with the following contents**

```tsx
"use client";

import React from "react";
import { ChevronRight, Lock, LockOpen } from "lucide-react";

interface PaneHeaderProps {
  /** Full file path; rendered as a "/"-separated breadcrumb. */
  filePath: string;
  /** Whether the pane is currently in Read Mode. */
  readOnly: boolean;
  /** Toggle Read Mode on/off. */
  onToggleReadOnly: () => void;
  /** Extra actions rendered to the right of the Read Mode button. */
  children?: React.ReactNode;
}

export default function PaneHeader({
  filePath,
  readOnly,
  onToggleReadOnly,
  children,
}: PaneHeaderProps) {
  const pathParts = filePath.split("/");

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-1 text-xs text-slate-400">
        {pathParts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={10} />}
            <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onToggleReadOnly}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
          readOnly
            ? "bg-white shadow-sm text-blue-600 border-slate-200"
            : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
        }`}
        title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
        aria-pressed={readOnly}
        aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
      >
        {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
        <span>Read Mode</span>
      </button>

      {children}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/shared/components/PaneHeader.tsx
git commit -m "feat(kb): add shared PaneHeader for breadcrumb + Read Mode row"
```

---

## Task 2: Create `PaneTitle`

**Files:**
- Create: `src/app/knowledge_base/shared/components/PaneTitle.tsx`

This component is a straight lift of the editable-title JSX and state from `MarkdownPane.tsx` (the two `useState` hooks at lines 38–39 and the JSX at lines 103–130), repackaged as a self-contained component. Behavior is intentionally identical to the document pane's current title: click to open an input, Enter/blur commits via `onTitleChange` (if provided) else reverts, Escape discards.

- [ ] **Step 1: Create the file with the following contents**

```tsx
"use client";

import React, { useState } from "react";

interface PaneTitleProps {
  /** Current title to display. */
  title: string;
  /**
   * Optional commit handler. If provided, called with the trimmed new title
   * on blur / Enter when the value has actually changed. If omitted, edits
   * are accepted locally but do not persist; the component re-renders the
   * externally-provided `title` on next prop change.
   */
  onTitleChange?: (newTitle: string) => void;
}

export default function PaneTitle({ title, onTitleChange }: PaneTitleProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  return (
    <div className="flex-shrink-0 px-4 pt-3 pb-1 bg-white">
      {isEditingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            setIsEditingTitle(false);
            if (titleDraft.trim() && titleDraft !== title) {
              onTitleChange?.(titleDraft.trim());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setTitleDraft(title);
              setIsEditingTitle(false);
            }
          }}
          className="text-lg font-semibold text-slate-900 outline-none border-b-2 border-blue-500 w-full bg-transparent"
        />
      ) : (
        <h1
          onClick={() => {
            setTitleDraft(title);
            setIsEditingTitle(true);
          }}
          className="text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
        >
          {title}
        </h1>
      )}
    </div>
  );
}
```

Implementation notes (vs. the original in `MarkdownPane`):
- `setTitleDraft(title)` is called on click so the draft is seeded with the latest prop value instead of the stale initial value. This matches what the current MarkdownPane code effectively relied on via remount-on-filePath-change. It's a small robustness improvement but does not change any observable output — the input still opens pre-filled with the current title.
- The wrapper `<div>` uses `flex-shrink-0 ... bg-white`. See "Wrapper classes" note above for why this is appearance-preserving.

- [ ] **Step 2: Lint**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/shared/components/PaneTitle.tsx
git commit -m "feat(kb): add shared PaneTitle for editable pane title row"
```

---

## Task 3: Integrate `PaneHeader` + `PaneTitle` into `DiagramView`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

- [ ] **Step 1: Add the two imports**

Near the other relative imports:

```tsx
import PaneHeader from "../../shared/components/PaneHeader";
import PaneTitle from "../../shared/components/PaneTitle";
```

- [ ] **Step 2: Replace the breadcrumb row JSX (lines 910–937) with `<PaneHeader>`**

Current JSX at `DiagramView.tsx:910-937`:

```tsx
{/* Breadcrumb row */}
<div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
  <div className="flex items-center gap-1 text-xs text-slate-400">
    {pathParts.map((part, i) => (
      <React.Fragment key={i}>
        {i > 0 && <ChevronRight size={10} />}
        <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
          {part}
        </span>
      </React.Fragment>
    ))}
  </div>
  <div className="flex-1" />
  <button
    onClick={toggleReadOnly}
    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
      readOnly
        ? "bg-white shadow-sm text-blue-600 border-slate-200"
        : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
    }`}
    title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
    aria-pressed={readOnly}
    aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
  >
    {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
    <span>Read Mode</span>
  </button>
</div>
```

Replace with:

```tsx
{/* Breadcrumb row */}
<PaneHeader
  filePath={activeFile}
  readOnly={readOnly}
  onToggleReadOnly={toggleReadOnly}
/>
```

`activeFile` is non-null inside the `{activeFile && (...)}` block at line 908 — TypeScript narrows it.

- [ ] **Step 3: Replace the title row JSX (lines 939–944) with `<PaneTitle>`**

Current JSX at `DiagramView.tsx:939-944`:

```tsx
{/* Title row */}
<div className="flex-shrink-0 px-4 pt-3 pb-1 bg-white">
  <h1 className="text-lg font-semibold text-slate-900 px-1 -mx-1">
    {diagramTitle}
  </h1>
</div>
```

Replace with:

```tsx
{/* Title row */}
<PaneTitle title={diagramTitle} />
```

Do **not** pass an `onTitleChange` — matching `DocumentView.tsx`'s current behavior, edits don't persist. This is the intended behavior change noted at the top of this plan: the title becomes click-to-edit visually, but the filename still reflects the underlying file name on next render.

- [ ] **Step 4: Drop the now-unused `pathParts` local**

Run: `rg "\bpathParts\b" src/app/knowledge_base/features/diagram/DiagramView.tsx`
Expected: no matches after Step 2. If confirmed, delete line 901:

```tsx
const pathParts = activeFile ? activeFile.split("/") : [];
```

Leave `diagramTitle` (line 902–904) — it's still passed to `<PaneTitle title={diagramTitle} />`.

- [ ] **Step 5: Trim unused icon imports**

Current line 64:

```tsx
import { Activity, Tag, Map as MapIcon, LayoutGrid, ChevronRight, Lock, LockOpen } from "lucide-react";
```

Run: `rg "\bChevronRight\b|\bLock\b|\bLockOpen\b" src/app/knowledge_base/features/diagram/DiagramView.tsx`
Expected: no matches after the edits. Rewrite the import as:

```tsx
import { Activity, Tag, Map as MapIcon, LayoutGrid } from "lucide-react";
```

If any of the three still appears (elsewhere in the file), keep those specific names.

- [ ] **Step 6: Lint and typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npm run lint`
Expected: no new errors.

- [ ] **Step 7: Preview verification**

Start (or reuse) the dev server via `mcp__Claude_Preview__preview_start`, open a diagram file (e.g. `docs/architecture/compound-intelligence-architecture.json`), then:

```
mcp__Claude_Preview__preview_snapshot
```

Confirm:
- Breadcrumb renders identically to before (same path segments, chevron separators, last segment bolded, Read Mode button on the right).
- Title renders as an `<h1>` with the filename-derived title (unchanged appearance at rest).
- Click the title and confirm the inline `<input>` opens — pre-filled with the current title. Press Escape and confirm it closes without changing anything. Press Enter on a different value and confirm the input closes; on next render (e.g. switching files and returning) the title reverts to the filename-derived value (persistence is a no-op by design).
- Click the Read Mode button and confirm the toggle still works (Lock ↔ LockOpen, pill styling).

```
mcp__Claude_Preview__preview_screenshot
```

- [ ] **Step 8: Commit**

```bash
git add src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "refactor(diagram): use shared PaneHeader + PaneTitle in header rows"
```

---

## Task 4: Integrate `PaneHeader` + `PaneTitle` into `MarkdownPane`

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownPane.tsx`

- [ ] **Step 1: Add the two imports**

At the top of the file:

```tsx
import PaneHeader from "../../../shared/components/PaneHeader";
import PaneTitle from "../../../shared/components/PaneTitle";
```

- [ ] **Step 2: Replace the toolbar row JSX (lines 58–101) with `<PaneHeader>` wrapping the backlinks button**

Current JSX around line 58–101 (the toolbar row including breadcrumb, Read Mode button, backlinks button):

```tsx
return (
  <div className="flex flex-col h-full bg-white">
    {/* Toolbar */}
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-slate-400">
        {pathParts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={10} />}
            <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1" />

      {/* Read Mode toggle */}
      <button
        onClick={() => setReadOnly((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
          readOnly
            ? "bg-white shadow-sm text-blue-600 border-slate-200"
            : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
        }`}
        title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
        aria-pressed={readOnly}
        aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
      >
        {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
        <span>Read Mode</span>
      </button>

      {/* Backlinks indicator */}
      {backlinks.length > 0 && (
        <button
          onClick={() => setShowBacklinks(!showBacklinks)}
          className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
        >
          {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
```

Replace with:

```tsx
return (
  <div className="flex flex-col h-full bg-white">
    <PaneHeader
      filePath={filePath}
      readOnly={readOnly}
      onToggleReadOnly={() => setReadOnly((v) => !v)}
    >
      {backlinks.length > 0 && (
        <button
          onClick={() => setShowBacklinks(!showBacklinks)}
          className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
        >
          {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
        </button>
      )}
    </PaneHeader>
```

`filePath` is guaranteed non-null here because of the early-return `if (!filePath) return ...;` at lines 42–53.

- [ ] **Step 3: Replace the title row JSX (lines 103–130) with `<PaneTitle>`**

Current JSX at `MarkdownPane.tsx:103-130`:

```tsx
{/* Title */}
<div className="px-4 pt-3 pb-1">
  {isEditingTitle ? (
    <input
      autoFocus
      value={titleDraft}
      onChange={(e) => setTitleDraft(e.target.value)}
      onBlur={() => {
        setIsEditingTitle(false);
        if (titleDraft.trim() && titleDraft !== title) {
          onTitleChange?.(titleDraft.trim());
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setTitleDraft(title); setIsEditingTitle(false); }
      }}
      className="text-lg font-semibold text-slate-900 outline-none border-b-2 border-blue-500 w-full bg-transparent"
    />
  ) : (
    <h1
      onClick={() => setIsEditingTitle(true)}
      className="text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
    >
      {title}
    </h1>
  )}
</div>
```

Replace with:

```tsx
{/* Title */}
<PaneTitle title={title} onTitleChange={onTitleChange} />
```

- [ ] **Step 4: Remove the now-unused local state and local**

Delete these lines from `MarkdownPane.tsx` (originally at lines 38–39, 55–56):

```tsx
const [isEditingTitle, setIsEditingTitle] = useState(false);
const [titleDraft, setTitleDraft] = useState(title);
```

```tsx
// Breadcrumb from file path
const pathParts = filePath.split("/");
```

Run: `rg "\bisEditingTitle\b|\btitleDraft\b|\bsetIsEditingTitle\b|\bsetTitleDraft\b|\bpathParts\b" src/app/knowledge_base/features/document/components/MarkdownPane.tsx`
Expected: no matches after the deletions.

- [ ] **Step 5: Clean up `useState` import if unused**

`useState` is still used for `showBacklinks` and `readOnly` — leave the import alone. But double-check:

Run: `rg "\buseState\b" src/app/knowledge_base/features/document/components/MarkdownPane.tsx`
Expected: two remaining `useState` calls (for `showBacklinks` and `readOnly`). Keep the `import React, { useState } from "react";` line as-is.

- [ ] **Step 6: Trim unused lucide imports**

Current line 5:

```tsx
import { FileText, ChevronRight, Lock, LockOpen } from "lucide-react";
```

Run: `rg "\bChevronRight\b|\bLock\b|\bLockOpen\b" src/app/knowledge_base/features/document/components/MarkdownPane.tsx`
Expected: no matches. `FileText` is still used in the empty-state at line 46. Rewrite as:

```tsx
import { FileText } from "lucide-react";
```

- [ ] **Step 7: Lint and typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npm run lint`
Expected: no new errors.

- [ ] **Step 8: Preview verification**

Open a markdown document (pick one with backlinks if available). Verify:
- Breadcrumb row: identical to before.
- Title row: identical at rest. Click the `<h1>` → input opens pre-filled. Enter or blur on a new value → closes. Escape → discards. Same as before.
- Backlinks pill (when present) still sits immediately to the right of the Read Mode button, and clicking it still opens the backlinks dropdown below the header row.

```
mcp__Claude_Preview__preview_snapshot
mcp__Claude_Preview__preview_click   // target: title h1
mcp__Claude_Preview__preview_fill    // type a new value
mcp__Claude_Preview__preview_snapshot
mcp__Claude_Preview__preview_screenshot
```

- [ ] **Step 9: Commit**

```bash
git add src/app/knowledge_base/features/document/components/MarkdownPane.tsx
git commit -m "refactor(document): use shared PaneHeader + PaneTitle in header rows"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Split-pane visual check**

Open the app in split mode with one diagram pane and one document pane. Confirm:
- Both breadcrumb rows render identically (height, padding, colors, font, chevron separators).
- Both title rows render identically (font weight, size, padding, hover pill, click-to-edit behavior).
- Each Read Mode button toggles only its own pane.
- Below the shared rows, each pane still renders its own per-pane toolbar unchanged (diagram: Live / Labels / Minimap / zoom; document: the WYSIWYG / Raw / formatting toolbar inside `MarkdownEditor`).

```
mcp__Claude_Preview__preview_screenshot
```

- [ ] **Step 2: Full build**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npm run build`
Expected: build completes without new errors.

- [ ] **Step 3: Rebuild the graphify graph (project convention)**

Run:

```
cd "/Users/kiro/My Projects/knowledge-base" && python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 4: Commit any leftover graphify artifacts**

```bash
git status
# If graphify-out/ changed:
git add graphify-out
git commit -m "chore: rebuild graphify graph after PaneHeader + PaneTitle extraction"
```
