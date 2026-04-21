# Document Read-Only Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-pane read-only toggle button in `MarkdownPane`'s toolbar so each open document can be locked against edits.

**Architecture:** Entirely local per-pane React state. `MarkdownEditor` already consumes a `readOnly` prop (sets `editable: !readOnly` on Tiptap and `readOnly={readOnly}` on the raw textarea). We only need to (a) hold the state in `MarkdownPane`, (b) surface a toggle button, (c) forward the prop.

**Tech Stack:** React 19, Next.js 16, Tiptap v3, Tailwind CSS 4, `lucide-react` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-04-13-document-readonly-toggle-design.md`

**Note on testing:** This project has no unit/integration test framework. Verification is done via the preview browser tools (`preview_start`, `preview_snapshot`, `preview_eval`) that are already how the codebase is exercised during development.

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` | Import `Lock`/`LockOpen` icons, add `readOnly` useState, render toggle button in toolbar row, pass `readOnly` prop to `<MarkdownEditor>`. |

No new files. No other files touched.

---

## Task 1: Wire read-only state and toggle button into `MarkdownPane`

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownPane.tsx`

- [ ] **Step 1: Add `Lock` and `LockOpen` to the lucide-react import**

Current import at line 5:
```tsx
import { FileText, ArrowLeft, ChevronRight } from "lucide-react";
```

Change to:
```tsx
import { FileText, ArrowLeft, ChevronRight, Lock, LockOpen } from "lucide-react";
```

- [ ] **Step 2: Add `readOnly` state alongside the existing per-pane state**

Current state block at lines 37-39:
```tsx
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
```

Change to:
```tsx
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [readOnly, setReadOnly] = useState(false);
```

- [ ] **Step 3: Add the toggle button in the toolbar row, immediately before the backlinks indicator**

Current toolbar tail at lines 76-86 (from `<div className="flex-1" />` through the backlinks button):
```tsx
        <div className="flex-1" />

        {/* Backlinks indicator */}
        {backlinks.length > 0 && (
          <button
            onClick={() => setShowBacklinks(!showBacklinks)}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
          </button>
        )}
```

Change to:
```tsx
        <div className="flex-1" />

        {/* Read-only toggle */}
        <button
          onClick={() => setReadOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
            readOnly
              ? "bg-white shadow-sm text-blue-600 border-slate-200"
              : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
          }`}
          title={readOnly ? "Unlock editing" : "Lock (read-only)"}
          aria-pressed={readOnly}
          aria-label={readOnly ? "Unlock editing" : "Lock (read-only)"}
        >
          {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
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
```

- [ ] **Step 4: Pass `readOnly` to the `<MarkdownEditor>` call**

Current `MarkdownEditor` invocation at lines 135-144:
```tsx
      <div className="flex-1 min-h-0">
        <MarkdownEditor
          content={content}
          onChange={onChange}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
        />
      </div>
```

Change to:
```tsx
      <div className="flex-1 min-h-0">
        <MarkdownEditor
          content={content}
          onChange={onChange}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
          readOnly={readOnly}
        />
      </div>
```

- [ ] **Step 5: Lint check**

Run:
```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx eslint src/app/knowledge_base/features/document/components/MarkdownPane.tsx
```

Expected: no errors.

- [ ] **Step 6: Verify the dev server is running and reload the page**

The `dev` server should already be running. If not, start it with the `preview_start` MCP tool (`name: "dev"`).

With the MCP preview tools:
1. `preview_eval` with expression `window.location.reload()` to pick up the change (HMR should handle it, but a reload is a safe no-op).

- [ ] **Step 7: Verify the lock button renders and toggles correctly**

Open a `.md` document in the app (either use the explorer, or programmatically navigate via the app UI).

Use `preview_snapshot` to confirm a new button appears in the pane toolbar with an accessible label starting with "Lock (read-only)" (when unlocked) or "Unlock editing" (when locked).

Click the button using `preview_click` with selector `button[aria-label="Lock (read-only)"]`.

Take another `preview_snapshot` — the accessible label should now be "Unlock editing" and `aria-pressed="true"`.

- [ ] **Step 8: Verify the editor body becomes non-editable**

With read-only ON:

Use `preview_eval` to probe the Tiptap editor's contenteditable region:
```js
document.querySelector('.ProseMirror')?.getAttribute('contenteditable')
```
Expected: `"false"`.

For stronger confidence, attempt programmatic text insertion:
```js
(() => {
  const pm = document.querySelector('.ProseMirror');
  if (!pm) return 'no editor';
  pm.focus();
  const before = pm.textContent?.length ?? 0;
  document.execCommand('insertText', false, 'XYZ_SHOULD_NOT_APPEAR');
  const after = pm.textContent?.length ?? 0;
  return { before, after, changed: before !== after };
})()
```
Expected: `changed: false`.

- [ ] **Step 9: Verify raw-markdown mode is also locked**

If the editor has a raw/markdown mode toggle, switch to it. Use `preview_eval`:
```js
document.querySelector('textarea')?.readOnly
```
Expected: `true` when the pane is locked.

Toggle back to rich mode for the remaining steps.

- [ ] **Step 10: Verify toggling OFF restores editing**

Click the lock button again via `preview_click` (selector updated — now `button[aria-label="Unlock editing"]`).

Re-run the probe:
```js
document.querySelector('.ProseMirror')?.getAttribute('contenteditable')
```
Expected: `"true"`.

- [ ] **Step 11: Verify split-pane independence (if applicable)**

If the app supports split view, open the second pane with a different document, toggle one pane's lock, and confirm (via `preview_snapshot` or per-pane `contenteditable` queries) that the other pane's editor is unaffected.

If split view is not readily reachable in the current session, skip this step and note it as a manual-check item.

- [ ] **Step 12: Screenshot for user proof**

Use `preview_screenshot` with a locked document visible so the user can see the final UI.

- [ ] **Step 13: Commit**

Only after the user has reviewed the result.

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/components/MarkdownPane.tsx
git commit -m "feat(document): add per-pane read-only toggle"
```

---

## Self-review notes

- **Spec coverage:** The spec's goals list (per-pane state, toolbar toggle, both rich & raw modes locked, no new props on parent components) map to Steps 2, 3, 8, 9, and the fact that only `MarkdownPane.tsx` is modified.
- **Non-goals respected:** No persistence, no global mode, no keyboard shortcut, title editing and mode toggle remain enabled — plan adds none of these.
- **Types / naming consistency:** The prop name `readOnly` matches the existing `MarkdownEditorProps.readOnly?: boolean` on `MarkdownEditor.tsx`.
- **Placeholder scan:** No TBDs; each step has concrete code or an exact command.
