# Flow Document Attachment — Design Spec

**Date:** 2026-04-23  
**Branch:** feature/flow-document-attachment  
**Status:** Approved — ready for implementation

---

## Overview

Allow users to attach, preview, and detach Markdown documents from flows in the diagram editor. Introduces a universal doc-preview modal (used by all entity types) that blurs the diagram and renders documents in read-only mode before navigating to the doc pane.

---

## Goals

- Attach one or more existing documents to a flow from the FlowProperties panel.
- Create a new blank document and immediately attach it to a flow (with optional open-in-pane).
- Detach a document from a flow, with an optional cascade delete that cleans up wiki-links in other documents.
- Replace the existing "click doc link → open in pane directly" behaviour with a preview-first modal across **all entity types**.
- Keep the diagram canvas fully interactive by blurring and disabling it while the modal is open.

---

## Architecture

Three layered concerns:

1. **Flow document attachment** — new UI in `FlowProperties` for attach / detach / preview. The `'flow'` entity type already exists in `DocumentMeta["attachedTo"][].type`; only the UI and a type-cast fix are missing.
2. **`DocPreviewModal`** — new component rendered via `ReactDOM.createPortal` at `document.body`. Reads and renders the document in read-only mode, offers close and open-in-pane actions.
3. **Canvas blur** — a CSS class applied to the diagram canvas wrapper in `DiagramView` when the preview modal is open, disabling pointer events and applying `filter: blur(3px)`.

---

## New Component: `DocPreviewModal`

**Location:** `diagram/components/DocPreviewModal.tsx`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `docPath` | `string` | Path of the document to preview |
| `entityName` | `string \| undefined` | Human-readable label shown as a badge (e.g. "Auth Flow") |
| `onClose` | `() => void` | Dismisses the modal |
| `onOpenInPane` | `(path: string) => void` | Opens the document in the doc pane and closes the modal |
| `readDocument` | `(path: string) => Promise<string \| null>` | Injected from `knowledgeBase.tsx` |

### Behaviour

- On mount: calls `readDocument(docPath)`, shows a spinner while loading.
- On success: renders `markdownToHtml(content)` via `dangerouslySetInnerHTML` inside `<div className="markdown-editor"><div className="ProseMirror">`. Exact style match with the doc pane — no new CSS.
- On error: shows a short inline error message.
- Escape key or backdrop click → `onClose()`.
- "Open in pane" button → `onOpenInPane(docPath)` then `onClose()`.
- Rendered via `ReactDOM.createPortal(..., document.body)` — never trapped inside a blurred ancestor.

### Modal layout (header / body)

- **Header:** file icon + filename + "Read only" chip + entity name badge + "Open in pane" button + close ✕
- **Body:** scrollable, document content rendered with `.markdown-editor .ProseMirror` styles

---

## State & Blur

`previewDocPath: string | null` and `previewEntityName: string | undefined` live in `DiagramView.tsx` alongside `pickerTarget`. Both are set together when triggering the modal; `previewEntityName` is optional and only populated when the caller has entity context (e.g. a flow name).

```tsx
// DiagramView.tsx — canvas wrapper
<div
  className={cn("...", previewDocPath && "blur-sm pointer-events-none")}
>
  {/* canvas content */}
</div>
```

When `previewDocPath` is non-null, `DiagramOverlays` renders `DocPreviewModal`:

```tsx
{previewDocPath && (
  <DocPreviewModal
    docPath={previewDocPath}
    entityName={previewEntityName}  {/* string | undefined — set alongside previewDocPath when context is known (e.g. flow name); omit for backlink clicks where entity context is unavailable */}
    onClose={() => setPreviewDocPath(null)}
    onOpenInPane={(path) => { onOpenDocument(path); setPreviewDocPath(null); }}
    readDocument={readDocument}
  />
)}
```

---

## Prop Threading

```
knowledgeBase.tsx
  readDocument(path)                 → Promise<string | null>
  getDocumentReferences(docPath)     → { attachments, wikiBacklinks }
  deleteDocumentWithCleanup(path)    → Promise<void>
  onAttachDocument type cast fixed   → "node" | "connection" | "flow"
  ↓
DiagramView.tsx
  previewDocPath / setPreviewDocPath (state)
  ↓
DiagramOverlays.tsx          (new props: readDocument, previewDocPath,
                              setPreviewDocPath, onPreviewDocument,
                              documents, onOpenDocPicker,
                              onDetachDocument, getDocumentReferences,
                              deleteDocumentWithCleanup)
  ↓
PropertiesPanel.tsx          (new props: documents, onPreviewDocument,
                              onOpenDocPicker, onDetachDocument,
                              getDocumentReferences,
                              deleteDocumentWithCleanup)
  ↓
DiagramProperties.tsx        (threads same props to FlowProperties)
  ↓
FlowProperties.tsx           (consumes all new props — main new UI)
```

---

## FlowProperties: Documents Section

Inserted between the "Elements" and "Danger" sections.

### Attached doc row
- Filename (clickable) → `onPreview(docPath)` → opens `DocPreviewModal`
- Detach `×` button (hidden in `readOnly`) → opens detach confirmation modal

### Attach buttons (hidden in `readOnly`)
```
[+ Attach existing…]    [+ Create & attach new…]
```

### "Create & attach new" modal

Small modal with:
- **Filename input** — pre-filled with a slug of the flow name + `.md`
- **"Edit now" checkbox** — if checked, opens the doc in the doc pane after creation
- **[Cancel] / [Create & Attach]** buttons

On confirm: creates a blank document at the given path, attaches it to the flow (`type: 'flow'`, `id: flowId`), and if "Edit now" is checked calls `onOpenInPane`.

### Detach confirmation modal

```
Detach "auth-flow-overview.md"?

Also referenced by:
  · Auth Node (attached)
  · token-lifecycle.md (wiki-link)

□ Also delete this document
┌─────────────────────────────────────────┐  ← shown only when checkbox checked
│ ⚠ Wiki-links to this document in 1     │
│   other document will also be removed:  │  danger style (red bg/border)
│   token-lifecycle.md                    │
└─────────────────────────────────────────┘

             [Cancel]   [Detach]
```

- "Also referenced by" section omitted if there are no other references.
- References are deduplicated — if a doc wiki-links to this doc multiple times, it appears once.
- Danger warning appears/disappears reactively as the checkbox toggles.
- On confirm with "Also delete" checked: calls `deleteDocumentWithCleanup(path)` which:
  1. Deletes the document file.
  2. Reads each wiki-linking document, strips `[[doc-name]]` references, writes it back.
  3. Updates the link index and `documents` state.

---

## New `knowledgeBase.tsx` Callbacks

### `readDocument(path: string): Promise<string | null>`
Wraps `DocumentRepository.read(path)` via `readOrNull`. Returns raw markdown content or `null`.

### `getDocumentReferences(docPath: string, exclude?: { entityType: string; entityId: string })`
Returns:
```ts
{
  attachments: Array<{ entityType: string; entityId: string; label: string }>,
  wikiBacklinks: string[]   // unique doc paths that wiki-link to this doc
}
```
Queries `documents` state for other `attachedTo` entries, excluding the `exclude` entity (the one the user is detaching from). Queries the `linkIndex` for wiki-link backlinks. Both lists are deduplicated.

### `deleteDocumentWithCleanup(path: string): Promise<void>`
1. Calls `DocumentRepository.delete(path)`. _(Note: a `delete` method may need to be added to `DocumentRepository` if it doesn't already exist — verify during implementation.)_
2. For each doc in `wikiBacklinks` for this path: reads content, strips `[[filename]]` and `[[filename|alias]]` patterns matching this doc, writes back.
3. Calls `removeDocumentFromIndex(path)` and updates `documents` state.

---

## `DocumentsSection` Update

`onOpenDocument` prop renamed to `onPreviewDocument`. All call sites updated:
- `NodeProperties.tsx`
- `LineProperties.tsx`
- `LayerProperties.tsx`
- `DiagramProperties.tsx`

Clicking any wiki-link backlink now opens the preview modal. The doc pane is only reached via "Open in pane" inside the modal.

---

## `knowledgeBase.tsx` Type Cast Fix

```ts
// Before
docManager.attachDocument(docPath, entityType as "node" | "connection", entityId);

// After
docManager.attachDocument(docPath, entityType as "node" | "connection" | "flow", entityId);
```

---

## Features.md Updates

Add / update under **section 3.10 Flows**:
- Attach existing documents to a flow from FlowProperties panel
- Create & attach new blank document (with "Edit now" option)
- Detach document with optional cascade delete (cleans wiki-links in referencing docs)
- Shows other references (attachments + wiki-link backlinks, deduplicated) before delete

Update **section 3.x Doc Preview Modal** (new):
- `DocPreviewModal` — universal read-only doc preview triggered from any entity panel
- Blurs diagram canvas and disables pointer events while open
- "Open in pane" action navigates to doc pane and closes modal
- Rendered via React portal, unaffected by parent filter/transform

Update **Attach-to-entity modal** entry to note `'flow'` type is now fully wired.

---

## test-cases/03-diagram.md Updates

Add cases under a new **3.10.x — Flow Document Attachment** sub-section. IDs use `XX` as placeholders — assign the next free numbers in that section during implementation:

| ID | Scenario |
|----|----------|
| DIAG-3.10-XX | Attach existing doc to flow — appears in Documents section |
| DIAG-3.10-XX | Attach same doc twice — second attach is a no-op |
| DIAG-3.10-XX | Create & attach new — file created, attached, "Edit now" opens pane |
| DIAG-3.10-XX | Create & attach new — "Edit now" unchecked, pane not opened |
| DIAG-3.10-XX | Detach doc — disappears from Documents section |
| DIAG-3.10-XX | Detach doc with no other refs — "Also referenced by" section absent |
| DIAG-3.10-XX | Detach doc with other attachments — lists them deduplicated |
| DIAG-3.10-XX | Detach doc with wiki-link backlinks — lists them deduplicated |
| DIAG-3.10-XX | Detach + delete — file removed from vault |
| DIAG-3.10-XX | Detach + delete — wiki-links removed from referencing docs |
| DIAG-3.10-XX | Danger warning shown when "Also delete" checked, hidden when unchecked |
| DIAG-3.10-XX | Documents section hidden in readOnly mode |

Add cases under a new **Doc Preview Modal** sub-section (cross-cutting):

| ID | Scenario |
|----|----------|
| DIAG-3.x-XX | Click attached flow doc — preview modal opens |
| DIAG-3.x-XX | Click wiki-link backlink in any entity panel — preview modal opens |
| DIAG-3.x-XX | Preview modal renders markdown matching doc pane styles |
| DIAG-3.x-XX | Escape key closes modal |
| DIAG-3.x-XX | Backdrop click closes modal |
| DIAG-3.x-XX | "Open in pane" opens doc pane and closes modal |
| DIAG-3.x-XX | Diagram canvas is blurred and non-interactive while modal open |
| DIAG-3.x-XX | Error state shown when document cannot be read |

---

## Files Changed

| File | Change |
|------|--------|
| `diagram/components/DocPreviewModal.tsx` | **New** |
| `diagram/components/CreateAttachDocModal.tsx` | **New** |
| `diagram/components/DetachDocModal.tsx` | **New** |
| `diagram/properties/FlowProperties.tsx` | Add Documents section |
| `diagram/properties/DocumentsSection.tsx` | Rename prop |
| `diagram/properties/NodeProperties.tsx` | Update prop name |
| `diagram/properties/LineProperties.tsx` | Update prop name |
| `diagram/properties/LayerProperties.tsx` | Update prop name |
| `diagram/properties/DiagramProperties.tsx` | Thread props + update prop name |
| `diagram/properties/PropertiesPanel.tsx` | Add + thread new props |
| `diagram/components/DiagramOverlays.tsx` | Add preview state, render modal |
| `diagram/DiagramView.tsx` | Add blur state, thread props |
| `knowledgeBase.tsx` | Fix cast, add 3 new callbacks |
| `Features.md` | Update flows section, add modal entry |
| `test-cases/03-diagram.md` | Add flow-attachment + modal cases |

---

## Out of Scope

- Attached-docs sections for nodes/connections/layers in their properties panels (they retain the canvas-badge attach mechanism; only the click-to-open behaviour changes to use the modal).
- Doc preview from the document pane or file explorer.
- Rich text editing inside the preview modal.
