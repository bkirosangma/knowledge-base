# Document Read-Only Toggle — Design

## Context

Users currently have no way to lock a document against accidental edits while browsing. The `MarkdownEditor` component already accepts a `readOnly` prop and correctly disables both the Tiptap instance (`editable: !readOnly`) and the raw-markdown textarea (`readOnly={readOnly}`), but this prop is not wired through `MarkdownPane`, so there is no UI to control it.

This spec adds a per-pane read-only toggle so each open document can be independently locked from editing.

## Goals

- Each `MarkdownPane` has its own read-only state, defaulting to off (editable).
- A toggle button in the pane's existing toolbar row flips the state.
- When read-only is on, the editor body (both rich and raw modes) cannot be edited.
- Save/Discard behave correctly without explicit changes: a locked editor never becomes dirty, so the global header's Save/Discard stay disabled naturally.

## Non-goals

- No persistence across sessions (YAGNI — user chose per-pane, not per-document).
- No global "reading mode" across all panes.
- Title editing and raw/markdown toggle remain functional even when read-only is on (explicit user choice).
- No keyboard shortcut in v1.

## Design

### State

Local state in `MarkdownPane` alongside existing per-pane UI state:

```tsx
const [readOnly, setReadOnly] = useState(false);
```

Sits next to `showBacklinks` and `isEditingTitle` at `MarkdownPane.tsx:37-39`.

### Button placement

In the existing toolbar row (`MarkdownPane.tsx:57-87`), placed near the backlinks button (just before it, so the rightmost item remains the count indicator when backlinks are present). When no backlinks exist, the toggle is the only right-aligned control.

### Button markup

Icon from `lucide-react` (already used throughout the app). Uses `Lock` / `LockOpen` to match the semantic of the action. Styling follows the Split-view button pattern at `Header.tsx:91-102`:

```tsx
<button
  onClick={() => setReadOnly(v => !v)}
  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
    readOnly
      ? "bg-white shadow-sm text-blue-600 border-slate-200"
      : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
  }`}
  title={readOnly ? "Unlock editing" : "Lock (read-only)"}
>
  {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
</button>
```

### Wiring

Pass `readOnly` to the existing `MarkdownEditor` call at `MarkdownPane.tsx:136`:

```tsx
<MarkdownEditor
  content={content}
  onChange={onChange}
  onNavigateLink={onNavigateLink}
  onCreateDocument={onCreateDocument}
  existingDocPaths={existingDocPaths}
  allDocPaths={allDocPaths}
  readOnly={readOnly}
/>
```

No changes needed in `MarkdownEditor.tsx` — the prop is already consumed at lines 162 (Tiptap `editable: !readOnly`) and 336 (textarea `readOnly={readOnly}`).

No changes needed in `DocumentView.tsx`, `knowledgeBase.tsx`, `Header.tsx`, or any state hook.

## Files touched

- `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` — add state, add toggle button, pass prop.

That is the entire change.

## Verification

- Dev server already runs via `preview_start name="dev"` on port 3457.
- Open a `.md` document in the app.
- Confirm the lock icon is visible in the pane toolbar.
- Click to toggle ON → try to type in the editor body → no input accepted.
- Switch to raw mode → confirm the textarea is also read-only.
- Toggle OFF → confirm editing works normally again.
- In split view, toggle one pane's lock → confirm the other pane's lock state is unaffected.
- Confirm Save/Discard in the global header remain disabled while locked (no dirty state).
