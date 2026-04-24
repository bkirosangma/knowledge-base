# Flow Document Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow documents to be attached to flows in the diagram editor, with a universal read-only doc-preview modal (used by all entity types) that blurs the diagram canvas while open.

**Architecture:** Three layers — (1) infrastructure callbacks in `knowledgeBase.tsx` for reading/referencing/deleting docs, (2) a portalled `DocPreviewModal` component with canvas blur, (3) a Documents section in `FlowProperties` with attach/detach/create modals. The `DocumentsSection` prop rename propagates the preview-first pattern to all existing entity panels.

**Tech Stack:** React 18, TypeScript, Tiptap (markdown serializer only — no editor mount), Tailwind CSS, Vitest + React Testing Library, File System Access API.

**Spec:** `docs/superpowers/specs/2026-04-23-flow-document-attachment-design.md`

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/features/document/utils/wikiLinkParser.ts` | Add `stripWikiLinksForPath` export |
| `src/app/knowledge_base/features/document/utils/wikiLinkParser.test.ts` | Add tests for new function |
| `src/app/knowledge_base/features/document/hooks/useDocuments.ts` | Add `removeDocument` |
| `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts` | Add tests |
| `src/app/knowledge_base/knowledgeBase.tsx` | Fix type cast; add `readDocument`, `getDocumentReferences`, `deleteDocumentWithCleanup` callbacks |
| `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/components/DetachDocModal.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/components/DetachDocModal.test.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx` | Add Documents section |
| `src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx` | **New** |
| `src/app/knowledge_base/features/diagram/properties/DocumentsSection.tsx` | Rename prop |
| `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx` | Update prop name |
| `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx` | Update prop name |
| `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx` | Update prop name |
| `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx` | Thread props + update prop name |
| `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx` | Add + thread new props |
| `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx` | Add new props, render DocPreviewModal |
| `src/app/knowledge_base/features/diagram/DiagramView.tsx` | Add blur state, thread props |
| `src/app/knowledge_base/domain/repositories.ts` | No change needed (delete via fileExplorer) |
| `Features.md` | Update flows + add modal entry |
| `test-cases/03-diagram.md` | Add flow-attachment + modal cases |

---

## Task 1: `stripWikiLinksForPath` utility

**Files:**
- Modify: `src/app/knowledge_base/features/document/utils/wikiLinkParser.ts`
- Modify: `src/app/knowledge_base/features/document/utils/wikiLinkParser.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Add to `wikiLinkParser.test.ts`:

```ts
import { stripWikiLinksForPath } from "./wikiLinkParser";

describe("stripWikiLinksForPath", () => {
  it("removes a plain wiki-link to the deleted doc", () => {
    expect(stripWikiLinksForPath("See [[notes/auth]] for details.", "notes/auth.md"))
      .toBe("See  for details.");
  });

  it("removes an aliased wiki-link, keeping no residue", () => {
    expect(stripWikiLinksForPath("See [[notes/auth | Auth Flow]] here.", "notes/auth.md"))
      .toBe("See  here.");
  });

  it("leaves unrelated wiki-links intact", () => {
    expect(stripWikiLinksForPath("See [[other/doc]] and [[notes/auth]].", "notes/auth.md"))
      .toBe("See [[other/doc]] and .");
  });

  it("handles doc path without extension", () => {
    expect(stripWikiLinksForPath("[[notes/auth]]", "notes/auth"))
      .toBe("");
  });

  it("handles section-anchored link to the deleted doc", () => {
    expect(stripWikiLinksForPath("See [[notes/auth#intro]].", "notes/auth.md"))
      .toBe("See .");
  });

  it("returns unchanged string when doc is not referenced", () => {
    const md = "No links here.";
    expect(stripWikiLinksForPath(md, "notes/auth.md")).toBe(md);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run test:run -- src/app/knowledge_base/features/document/utils/wikiLinkParser.test.ts
```

Expected: `stripWikiLinksForPath is not a function` or similar import error.

- [ ] **Step 1.3: Implement `stripWikiLinksForPath`**

Add to the end of `src/app/knowledge_base/features/document/utils/wikiLinkParser.ts`:

```ts
/**
 * Removes all wiki-links pointing to `deletedDocPath` from `markdown`.
 * Both `[[path]]` and `[[path|alias]]` forms are stripped entirely.
 */
export function stripWikiLinksForPath(markdown: string, deletedDocPath: string): string {
  const deletedBase = deletedDocPath.replace(/\.(md|json)$/, "");
  return markdown.replace(/\[\[([^\]]+?)\]\]/g, (fullMatch, inner: string) => {
    const [pathAndSection] = inner.split("|").map((s: string) => s.trim());
    const [linkPath] = pathAndSection.split("#").map((s: string) => s.trim());
    const normalized = linkPath.replace(/\.(md|json)$/, "");
    if (normalized === deletedBase || normalized === `/${deletedBase}`) {
      return "";
    }
    return fullMatch;
  });
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npm run test:run -- src/app/knowledge_base/features/document/utils/wikiLinkParser.test.ts
```

Expected: all `stripWikiLinksForPath` tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/app/knowledge_base/features/document/utils/wikiLinkParser.ts \
        src/app/knowledge_base/features/document/utils/wikiLinkParser.test.ts
git commit -m "feat(wiki-links): add stripWikiLinksForPath for delete cleanup"
```

---

## Task 2: `removeDocument` in `useDocuments`

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`

- [ ] **Step 2.1: Write the failing test**

Add to the existing `useDocuments.test.ts` describe block:

```ts
it("removeDocument removes the entry from state entirely", () => {
  const { result } = renderHook(() => useDocuments(null));

  // seed a document
  act(() => {
    result.current.attachDocument("docs/my-doc.md", "node", "node-1");
  });
  expect(result.current.documents).toHaveLength(1);

  act(() => {
    result.current.removeDocument("docs/my-doc.md");
  });
  expect(result.current.documents).toHaveLength(0);
});
```

- [ ] **Step 2.2: Run to confirm failure**

```bash
npm run test:run -- src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
```

Expected: `result.current.removeDocument is not a function`.

- [ ] **Step 2.3: Implement `removeDocument`**

In `src/app/knowledge_base/features/document/hooks/useDocuments.ts`, add after `detachDocument`:

```ts
const removeDocument = useCallback((docPath: string) => {
  setDocuments(prev => prev.filter(d => d.filename !== docPath));
}, []);
```

Add `removeDocument` to the return object alongside the other exports.

- [ ] **Step 2.4: Run to confirm passing**

```bash
npm run test:run -- src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocuments.ts \
        src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
git commit -m "feat(docs): add removeDocument to useDocuments hook"
```

---

## Task 3: New callbacks + type-cast fix in `knowledgeBase.tsx`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 3.1: Fix the type cast for `onAttachDocument`**

Find line ~301 in `knowledgeBase.tsx`:
```ts
docManager.attachDocument(docPath, entityType as "node" | "connection", entityId);
```
Change to:
```ts
docManager.attachDocument(docPath, entityType as "node" | "connection" | "flow", entityId);
```

- [ ] **Step 3.2: Add `readDocument` callback**

After the `handleRename` block (around line 96), add:

```ts
const readDocument = useCallback(async (docPath: string): Promise<string | null> => {
  const rootHandle = fileExplorer.dirHandleRef.current;
  if (!rootHandle) return null;
  try {
    const repo = createDocumentRepository(rootHandle);
    return await repo.read(docPath);
  } catch {
    return null;
  }
}, [fileExplorer.dirHandleRef]);
```

`createDocumentRepository` is not imported in `knowledgeBase.tsx` yet — it lives inside `useDocuments.ts`. Add the import: `import { createDocumentRepository } from "./infrastructure/documentRepo";`.

- [ ] **Step 3.3: Add `getDocumentReferences` callback**

```ts
const getDocumentReferences = useCallback((
  docPath: string,
  exclude?: { entityType: string; entityId: string },
) => {
  const doc = docManager.documents.find(d => d.filename === docPath);
  const attachments = (doc?.attachedTo ?? [])
    .filter(a => !exclude || !(a.type === exclude.entityType && a.id === exclude.entityId))
    .map(a => ({ entityType: a.type, entityId: a.id }));

  const seen = new Set<string>();
  const wikiBacklinks: string[] = [];
  for (const bl of linkManager.getBacklinksFor(docPath)) {
    if (!seen.has(bl.sourcePath)) {
      seen.add(bl.sourcePath);
      wikiBacklinks.push(bl.sourcePath);
    }
  }

  return { attachments, wikiBacklinks };
}, [docManager.documents, linkManager]);
```

- [ ] **Step 3.4: Add `deleteDocumentWithCleanup` callback**

Add the import at the top of the file if not present:
```ts
import { stripWikiLinksForPath } from "./features/document/utils/wikiLinkParser";
import { createDocumentRepository } from "./infrastructure/documentRepo";
```

Then add the callback:

```ts
const deleteDocumentWithCleanup = useCallback(async (docPath: string) => {
  const rootHandle = fileExplorer.dirHandleRef.current;
  if (!rootHandle) return;

  // Strip wiki-links from all backlink sources (deduplicated)
  const seen = new Set<string>();
  for (const bl of linkManager.getBacklinksFor(docPath)) {
    if (seen.has(bl.sourcePath)) continue;
    seen.add(bl.sourcePath);
    try {
      const repo = createDocumentRepository(rootHandle);
      const content = await repo.read(bl.sourcePath);
      const stripped = stripWikiLinksForPath(content, docPath);
      if (stripped !== content) await repo.write(bl.sourcePath, stripped);
    } catch { /* skip unreadable files */ }
  }

  // Remove from link index
  await linkManager.removeDocumentFromIndex(rootHandle, docPath);

  // Delete the file via fileExplorer (handles drafts + localStorage)
  await fileExplorer.deleteFile(docPath);

  // Remove from documents state
  docManager.removeDocument(docPath);
}, [fileExplorer, linkManager, docManager]);
```

- [ ] **Step 3.5: Pass new callbacks into `DiagramView`**

Find where `DiagramView` is rendered in `knowledgeBase.tsx` (around line 300). Add the new props:

```tsx
<DiagramView
  {/* ... existing props ... */}
  readDocument={readDocument}
  getDocumentReferences={getDocumentReferences}
  deleteDocumentWithCleanup={deleteDocumentWithCleanup}
/>
```

- [ ] **Step 3.6: Build check**

```bash
npm run build 2>&1 | head -40
```

Expected: no new TypeScript errors from these changes (existing errors, if any, are pre-existing).

- [ ] **Step 3.7: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(kb): add readDocument, getDocumentReferences, deleteDocumentWithCleanup callbacks"
```

---

## Task 4: `DocPreviewModal` component

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx`

- [ ] **Step 4.1: Write failing tests**

Create `src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DocPreviewModal } from "./DocPreviewModal";

const baseProps = {
  docPath: "docs/auth-flow.md",
  onClose: vi.fn(),
  onOpenInPane: vi.fn(),
  readDocument: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

it("shows a spinner while loading", () => {
  baseProps.readDocument.mockReturnValue(new Promise(() => {})); // never resolves
  render(<DocPreviewModal {...baseProps} />);
  expect(screen.getByRole("status")).toBeInTheDocument(); // spinner
});

it("renders document content after loading", async () => {
  baseProps.readDocument.mockResolvedValue("# Hello\n\nWorld");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello");
  });
});

it("shows error message when readDocument returns null", async () => {
  baseProps.readDocument.mockResolvedValue(null);
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});

it("shows error message when readDocument rejects", async () => {
  baseProps.readDocument.mockRejectedValue(new Error("fs error"));
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => {
    expect(screen.getByText(/could not load/i)).toBeInTheDocument();
  });
});

it("calls onClose when Escape is pressed", async () => {
  baseProps.readDocument.mockResolvedValue("content");
  render(<DocPreviewModal {...baseProps} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("calls onClose when backdrop is clicked", async () => {
  baseProps.readDocument.mockResolvedValue("content");
  render(<DocPreviewModal {...baseProps} />);
  fireEvent.click(screen.getByTestId("doc-preview-backdrop"));
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("calls onOpenInPane and onClose when 'Open in pane' is clicked", async () => {
  baseProps.readDocument.mockResolvedValue("# Doc");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => screen.getByText(/open in pane/i));
  fireEvent.click(screen.getByText(/open in pane/i));
  expect(baseProps.onOpenInPane).toHaveBeenCalledWith("docs/auth-flow.md");
  expect(baseProps.onClose).toHaveBeenCalledTimes(1);
});

it("shows entity name badge when entityName is provided", async () => {
  baseProps.readDocument.mockResolvedValue("");
  render(<DocPreviewModal {...baseProps} entityName="Auth Flow" />);
  await waitFor(() => expect(screen.getByText("Auth Flow")).toBeInTheDocument());
});

it("shows the filename in the header", async () => {
  baseProps.readDocument.mockResolvedValue("");
  render(<DocPreviewModal {...baseProps} />);
  await waitFor(() => expect(screen.getByText("auth-flow.md")).toBeInTheDocument());
});
```

- [ ] **Step 4.2: Run to confirm failures**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx
```

Expected: cannot find module `./DocPreviewModal`.

- [ ] **Step 4.3: Implement `DocPreviewModal`**

Create `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom";
import { FileText, X, ExternalLink, Loader2 } from "lucide-react";
import { markdownToHtml } from "../../document/extensions/markdownSerializer";

interface DocPreviewModalProps {
  docPath: string;
  entityName?: string;
  onClose: () => void;
  onOpenInPane: (path: string) => void;
  readDocument: (path: string) => Promise<string | null>;
}

export function DocPreviewModal({
  docPath,
  entityName,
  onClose,
  onOpenInPane,
  readDocument,
}: DocPreviewModalProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(false);
    readDocument(docPath)
      .then(raw => {
        if (cancelled) return;
        if (raw === null) { setError(true); return; }
        setHtml(markdownToHtml(raw));
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [docPath, readDocument]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const filename = docPath.split("/").pop() ?? docPath;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        data-testid="doc-preview-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-2xl w-[680px] max-h-[78vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-800">{filename}</span>
            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 uppercase tracking-wide">
              Read only
            </span>
          </div>
          <div className="flex items-center gap-2">
            {entityName && (
              <span className="text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-0.5">
                {entityName}
              </span>
            )}
            <button
              onClick={() => { onOpenInPane(docPath); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
            >
              <ExternalLink size={12} />
              Open in pane
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {html === null && !error && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 role="status" size={20} className="animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              Could not load document.
            </div>
          )}
          {html !== null && !error && (
            <div
              className="markdown-editor"
              dangerouslySetInnerHTML={{ __html: `<div class="ProseMirror">${html}</div>` }}
            />
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
```

- [ ] **Step 4.4: Run tests to confirm passing**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx
```

Expected: all 9 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx \
        src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx
git commit -m "feat(diagram): add DocPreviewModal component"
```

---

## Task 5: Wire blur state in `DiagramView` + thread to `DiagramOverlays`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx`

- [ ] **Step 5.1: Add new props to `DiagramView`**

In `DiagramView.tsx`, add to the props interface (search for the existing `onAttachDocument` prop area, around line 118):

```ts
readDocument: (path: string) => Promise<string | null>;
getDocumentReferences: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
  attachments: Array<{ entityType: string; entityId: string }>;
  wikiBacklinks: string[];
};
deleteDocumentWithCleanup: (path: string) => Promise<void>;
```

Destructure them in the function body alongside other props.

- [ ] **Step 5.2: Add preview state in `DiagramView`**

After the `pickerTarget` state declaration (around line 194), add:

```ts
const [previewDocPath, setPreviewDocPath] = useState<string | null>(null);
const [previewEntityName, setPreviewEntityName] = useState<string | undefined>(undefined);
```

- [ ] **Step 5.3: Apply blur class to canvas wrapper**

Find the main canvas wrapper `<div>` in `DiagramView.tsx` (the one that contains the canvas/zoom container). It should be a div with `ref={canvasRef}` or similar. Apply a conditional class:

```tsx
<div
  ref={canvasRef}
  className={`... existing classes ...${previewDocPath ? " blur-sm pointer-events-none select-none" : ""}`}
  {/* rest of props */}
>
```

If the existing className is complex, use template literals or `cn()` if available. Look for the `canvasRef` assignment to identify the exact element.

- [ ] **Step 5.4: Pass preview state + new callbacks into `DiagramOverlays`**

Find the `<DiagramOverlays>` render in `DiagramView.tsx` (around line 1240). Add:

```tsx
<DiagramOverlays
  {/* existing props */}
  previewDocPath={previewDocPath}
  previewEntityName={previewEntityName}
  setPreviewDocPath={setPreviewDocPath}
  setPreviewEntityName={setPreviewEntityName}
  readDocument={readDocument}
  getDocumentReferences={getDocumentReferences}
  deleteDocumentWithCleanup={deleteDocumentWithCleanup}
/>
```

- [ ] **Step 5.5: Add new props to `DiagramOverlays`**

In `DiagramOverlays.tsx`, add to the props destructure and interface:

```ts
previewDocPath: string | null;
previewEntityName: string | undefined;
setPreviewDocPath: React.Dispatch<React.SetStateAction<string | null>>;
setPreviewEntityName: React.Dispatch<React.SetStateAction<string | undefined>>;
readDocument: (path: string) => Promise<string | null>;
getDocumentReferences: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
  attachments: Array<{ entityType: string; entityId: string }>;
  wikiBacklinks: string[];
};
deleteDocumentWithCleanup: (path: string) => Promise<void>;
```

- [ ] **Step 5.6: Render `DocPreviewModal` in `DiagramOverlays`**

Import `DocPreviewModal` at the top of `DiagramOverlays.tsx`:
```ts
import { DocPreviewModal } from "./DocPreviewModal";
```

After the `{/* Document Picker */}` block (at the end of the component JSX), add:

```tsx
{/* Doc Preview Modal */}
{previewDocPath && (
  <DocPreviewModal
    docPath={previewDocPath}
    entityName={previewEntityName}
    onClose={() => { setPreviewDocPath(null); setPreviewEntityName(undefined); }}
    onOpenInPane={(path) => { onOpenDocument(path); setPreviewDocPath(null); setPreviewEntityName(undefined); }}
    readDocument={readDocument}
  />
)}
```

- [ ] **Step 5.7: Build check**

```bash
npm run build 2>&1 | head -60
```

Fix any TypeScript errors before continuing.

- [ ] **Step 5.8: Commit**

```bash
git add src/app/knowledge_base/features/diagram/DiagramView.tsx \
        src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx
git commit -m "feat(diagram): wire DocPreviewModal with canvas blur in DiagramView"
```

---

## Task 6: `CreateAttachDocModal` component

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx`

- [ ] **Step 6.1: Write failing tests**

Create `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateAttachDocModal } from "./CreateAttachDocModal";

const baseProps = {
  defaultFilename: "auth-flow-notes.md",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

it("pre-fills the filename input with defaultFilename", () => {
  render(<CreateAttachDocModal {...baseProps} />);
  expect(screen.getByRole("textbox")).toHaveValue("auth-flow-notes.md");
});

it("calls onCancel when Cancel is clicked", () => {
  render(<CreateAttachDocModal {...baseProps} />);
  fireEvent.click(screen.getByText(/cancel/i));
  expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
});

it("calls onConfirm with filename and editNow=false when checkbox unchecked", () => {
  render(<CreateAttachDocModal {...baseProps} />);
  const checkbox = screen.getByRole("checkbox", { name: /edit now/i });
  if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox); // ensure unchecked
  fireEvent.click(screen.getByRole("button", { name: /create/i }));
  expect(baseProps.onConfirm).toHaveBeenCalledWith("auth-flow-notes.md", false);
});

it("calls onConfirm with editNow=true when checkbox is checked", () => {
  render(<CreateAttachDocModal {...baseProps} />);
  const checkbox = screen.getByRole("checkbox", { name: /edit now/i });
  if (!(checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: /create/i }));
  expect(baseProps.onConfirm).toHaveBeenCalledWith("auth-flow-notes.md", true);
});

it("uses updated filename from input when confirmed", () => {
  render(<CreateAttachDocModal {...baseProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "my-custom-doc.md" } });
  fireEvent.click(screen.getByRole("button", { name: /create/i }));
  expect(baseProps.onConfirm).toHaveBeenCalledWith("my-custom-doc.md", expect.any(Boolean));
});

it("disables confirm button when filename is empty", () => {
  render(<CreateAttachDocModal {...baseProps} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
});
```

- [ ] **Step 6.2: Run to confirm failures**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx
```

Expected: module not found.

- [ ] **Step 6.3: Implement `CreateAttachDocModal`**

Create `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx`:

```tsx
"use client";

import { useState } from "react";

interface CreateAttachDocModalProps {
  defaultFilename: string;
  onConfirm: (filename: string, editNow: boolean) => void;
  onCancel: () => void;
}

export function CreateAttachDocModal({ defaultFilename, onConfirm, onCancel }: CreateAttachDocModalProps) {
  const [filename, setFilename] = useState(defaultFilename);
  const [editNow, setEditNow] = useState(false);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[400px] p-6 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-800">Create & Attach Document</h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="new-doc-filename">
            Filename
          </label>
          <input
            id="new-doc-filename"
            type="text"
            value={filename}
            onChange={e => setFilename(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Edit now"
            checked={editNow}
            onChange={e => setEditNow(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600"
          />
          <span className="text-sm text-slate-600">Edit now</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(filename.trim(), editNow)}
            disabled={!filename.trim()}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Create & Attach
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6.4: Run tests to confirm passing**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx \
        src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx
git commit -m "feat(diagram): add CreateAttachDocModal component"
```

---

## Task 7: `DetachDocModal` component

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/DetachDocModal.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/DetachDocModal.test.tsx`

- [ ] **Step 7.1: Write failing tests**

Create `src/app/knowledge_base/features/diagram/components/DetachDocModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { DetachDocModal } from "./DetachDocModal";

const baseProps = {
  docPath: "docs/auth-flow.md",
  attachments: [],
  wikiBacklinks: [],
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

it("shows the filename in the title", () => {
  render(<DetachDocModal {...baseProps} />);
  expect(screen.getByText(/auth-flow\.md/i)).toBeInTheDocument();
});

it("hides 'Also referenced by' section when no refs exist", () => {
  render(<DetachDocModal {...baseProps} />);
  expect(screen.queryByText(/also referenced by/i)).not.toBeInTheDocument();
});

it("shows attachments in the references list", () => {
  render(<DetachDocModal {...baseProps} attachments={[{ entityType: "node", entityId: "node-1" }]} />);
  expect(screen.getByText(/also referenced by/i)).toBeInTheDocument();
  expect(screen.getByText(/node.*node-1/i)).toBeInTheDocument();
});

it("shows wiki backlinks in the references list (deduplicated display)", () => {
  render(<DetachDocModal {...baseProps} wikiBacklinks={["docs/other.md"]} />);
  expect(screen.getByText(/other\.md/i)).toBeInTheDocument();
});

it("danger warning is hidden when 'Also delete' is unchecked", () => {
  render(<DetachDocModal {...baseProps} wikiBacklinks={["docs/other.md"]} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("danger warning appears when 'Also delete' is checked and there are backlinks", () => {
  render(<DetachDocModal {...baseProps} wikiBacklinks={["docs/other.md"]} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /also delete/i }));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(/other\.md/);
});

it("calls onCancel when Cancel is clicked", () => {
  render(<DetachDocModal {...baseProps} />);
  fireEvent.click(screen.getByText(/cancel/i));
  expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
});

it("calls onConfirm with alsoDelete=false when checkbox unchecked", () => {
  render(<DetachDocModal {...baseProps} />);
  fireEvent.click(screen.getByRole("button", { name: /^detach$/i }));
  expect(baseProps.onConfirm).toHaveBeenCalledWith(false);
});

it("calls onConfirm with alsoDelete=true when checkbox checked", () => {
  render(<DetachDocModal {...baseProps} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /also delete/i }));
  fireEvent.click(screen.getByRole("button", { name: /^detach$/i }));
  expect(baseProps.onConfirm).toHaveBeenCalledWith(true);
});
```

- [ ] **Step 7.2: Run to confirm failures**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/DetachDocModal.test.tsx
```

Expected: module not found.

- [ ] **Step 7.3: Implement `DetachDocModal`**

Create `src/app/knowledge_base/features/diagram/components/DetachDocModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface DetachDocModalProps {
  docPath: string;
  attachments: Array<{ entityType: string; entityId: string }>;
  wikiBacklinks: string[];
  onConfirm: (alsoDelete: boolean) => void;
  onCancel: () => void;
}

export function DetachDocModal({
  docPath,
  attachments,
  wikiBacklinks,
  onConfirm,
  onCancel,
}: DetachDocModalProps) {
  const [alsoDelete, setAlsoDelete] = useState(false);
  const filename = docPath.split("/").pop() ?? docPath;
  const hasRefs = attachments.length > 0 || wikiBacklinks.length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[440px] p-6 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-slate-800">
          Detach &ldquo;{filename}&rdquo;?
        </h3>

        {hasRefs && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Also referenced by
            </p>
            <ul className="flex flex-col gap-1">
              {attachments.map(a => (
                <li key={`${a.entityType}-${a.entityId}`} className="text-xs text-slate-600">
                  · {a.entityType} · {a.entityId} <span className="text-slate-400">(attached)</span>
                </li>
              ))}
              {wikiBacklinks.map(path => (
                <li key={path} className="text-xs text-slate-600">
                  · {path.split("/").pop()} <span className="text-slate-400">(wiki-link)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Also delete this document"
            checked={alsoDelete}
            onChange={e => setAlsoDelete(e.target.checked)}
            className="rounded border-slate-300 text-red-600"
          />
          <span className="text-sm text-slate-600">Also delete this document</span>
        </label>

        {alsoDelete && wikiBacklinks.length > 0 && (
          <div
            role="alert"
            className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
          >
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Wiki-links to this document in{" "}
              <strong>{wikiBacklinks.length}</strong>{" "}
              {wikiBacklinks.length === 1 ? "document" : "documents"} will also be
              removed:{" "}
              {wikiBacklinks.map(p => p.split("/").pop()).join(", ")}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            aria-label="Detach"
            onClick={() => onConfirm(alsoDelete)}
            className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Detach
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7.4: Run tests to confirm passing**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/DetachDocModal.test.tsx
```

Expected: all 9 tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/DetachDocModal.tsx \
        src/app/knowledge_base/features/diagram/components/DetachDocModal.test.tsx
git commit -m "feat(diagram): add DetachDocModal component"
```

---

## Task 8: `FlowProperties` Documents section

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx`
- Create: `src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx`

- [ ] **Step 8.1: Write failing tests**

Create `src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { FlowProperties } from "./FlowProperties";
import type { FlowDef, Connection, NodeData } from "../types";

const flow: FlowDef = { id: "flow-1", name: "Auth Flow", connectionIds: [] };
const baseProps = {
  id: "flow-1",
  flows: [flow],
  connections: [] as Connection[],
  nodes: [] as NodeData[],
  allFlowIds: ["flow-1"],
  attachedDocs: [],
  onAttach: vi.fn(),
  onDetach: vi.fn(),
  onPreview: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

it("renders a Documents section", () => {
  render(<FlowProperties {...baseProps} />);
  expect(screen.getByText("Documents")).toBeInTheDocument();
});

it("shows 'No documents attached' when attachedDocs is empty", () => {
  render(<FlowProperties {...baseProps} />);
  expect(screen.getByText(/no documents attached/i)).toBeInTheDocument();
});

it("renders attached doc filename", () => {
  render(<FlowProperties {...baseProps} attachedDocs={[{ id: "d1", filename: "docs/auth.md", title: "auth", attachedTo: [] }]} />);
  expect(screen.getByText("auth.md")).toBeInTheDocument();
});

it("calls onPreview when a doc filename is clicked", () => {
  render(<FlowProperties {...baseProps} attachedDocs={[{ id: "d1", filename: "docs/auth.md", title: "auth", attachedTo: [] }]} />);
  fireEvent.click(screen.getByText("auth.md"));
  expect(baseProps.onPreview).toHaveBeenCalledWith("docs/auth.md");
});

it("calls onAttach when 'Attach existing' is clicked", () => {
  render(<FlowProperties {...baseProps} />);
  fireEvent.click(screen.getByText(/attach existing/i));
  expect(baseProps.onAttach).toHaveBeenCalledTimes(1);
});

it("hides attach/detach controls in readOnly mode", () => {
  render(<FlowProperties {...baseProps} readOnly />);
  expect(screen.queryByText(/attach/i)).not.toBeInTheDocument();
});

it("opens DetachDocModal when detach button is clicked", () => {
  render(<FlowProperties {...baseProps} attachedDocs={[{ id: "d1", filename: "docs/auth.md", title: "auth", attachedTo: [] }]} getDocumentReferences={vi.fn().mockReturnValue({ attachments: [], wikiBacklinks: [] })} deleteDocumentWithCleanup={vi.fn()} />);
  fireEvent.click(screen.getByLabelText(/detach docs\/auth\.md/i));
  expect(screen.getByText(/detach/i)).toBeInTheDocument(); // DetachDocModal rendered
});
```

- [ ] **Step 8.2: Run to confirm failures**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx
```

Expected: failures on missing props / Documents section not found.

- [ ] **Step 8.3: Implement the Documents section in `FlowProperties.tsx`**

Add new imports at the top of `FlowProperties.tsx`:

```tsx
import { useState, useCallback } from "react";
import { FileText, Paperclip, Plus, X } from "lucide-react";
import type { DocumentMeta } from "../../document/types";
import { CreateAttachDocModal } from "../components/CreateAttachDocModal";
import { DetachDocModal } from "../components/DetachDocModal";
```

Add new props to the interface:

```ts
attachedDocs?: DocumentMeta[];
onAttach?: () => void;
onDetach?: (docPath: string) => void;
onPreview?: (docPath: string) => void;
getDocumentReferences?: (
  docPath: string,
  exclude?: { entityType: string; entityId: string }
) => { attachments: Array<{ entityType: string; entityId: string }>; wikiBacklinks: string[] };
deleteDocumentWithCleanup?: (path: string) => Promise<void>;
onOpenInPane?: (path: string) => void;
readOnly?: boolean;
```

Add state for modal management inside the component (before the `if (!flow) return ...` check):

```tsx
const [showCreateModal, setShowCreateModal] = useState(false);
const [detachTarget, setDetachTarget] = useState<string | null>(null);

const detachRefs = detachTarget
  ? (getDocumentReferences?.(detachTarget, { entityType: "flow", entityId: id }) ?? { attachments: [], wikiBacklinks: [] })
  : null;

const handleCreateAndAttach = useCallback(async (filename: string, editNow: boolean) => {
  setShowCreateModal(false);
  // The actual create + attach is handled by the parent via onCreateAndAttach if needed.
  // Here we just call onAttach with the pre-created filename if a higher-order flow is set up.
  // For simplicity, expose a separate prop or handle inline with onCreateAndAttach.
}, []);
```

_Note: `CreateAttachDocModal` calls back with `(filename, editNow)`. The `FlowProperties` component needs an `onCreateAndAttach` prop to handle the actual file creation. Add this to the interface:_

```ts
onCreateAndAttach?: (filename: string, editNow: boolean) => Promise<void>;
```

Insert the Documents section between "Elements" and "Danger" sections in the JSX:

```tsx
<Section title="Documents">
  {(attachedDocs?.length ?? 0) > 0 ? (
    <div className="flex flex-col gap-1">
      {attachedDocs!.map(doc => (
        <div key={doc.filename} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-50 border border-slate-200 text-xs">
          <FileText size={12} className="text-indigo-400 flex-shrink-0" />
          <button
            onClick={() => onPreview?.(doc.filename)}
            className="text-blue-600 hover:underline truncate flex-1 text-left"
          >
            {doc.filename.split("/").pop()}
          </button>
          {!readOnly && (
            <button
              aria-label={`detach ${doc.filename}`}
              onClick={() => setDetachTarget(doc.filename)}
              className="ml-auto text-slate-400 hover:text-red-500 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="text-[11px] text-slate-400">No documents attached.</p>
  )}

  {!readOnly && (
    <div className="flex gap-1.5 mt-2">
      <button
        onClick={() => onAttach?.()}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
      >
        <Paperclip size={11} />
        Attach existing…
      </button>
      <button
        onClick={() => setShowCreateModal(true)}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
      >
        <Plus size={11} />
        Create &amp; attach new…
      </button>
    </div>
  )}
</Section>

{showCreateModal && (
  <CreateAttachDocModal
    defaultFilename={`${flow.name.toLowerCase().replace(/\s+/g, "-")}-notes.md`}
    onConfirm={async (filename, editNow) => {
      setShowCreateModal(false);
      await onCreateAndAttach?.(filename, editNow);
    }}
    onCancel={() => setShowCreateModal(false)}
  />
)}

{detachTarget && detachRefs && (
  <DetachDocModal
    docPath={detachTarget}
    attachments={detachRefs.attachments}
    wikiBacklinks={detachRefs.wikiBacklinks}
    onCancel={() => setDetachTarget(null)}
    onConfirm={async (alsoDelete) => {
      const target = detachTarget;
      setDetachTarget(null);
      onDetach?.(target);
      if (alsoDelete) await deleteDocumentWithCleanup?.(target);
    }}
  />
)}
```

- [ ] **Step 8.4: Run tests to confirm passing**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx
```

Expected: all tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx
git commit -m "feat(diagram): add Documents section to FlowProperties"
```

---

## Task 9: Prop threading — `PropertiesPanel` → `DiagramProperties` → `FlowProperties`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx`
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 9.1: Add new props to `PropertiesPanel`**

In `PropertiesPanel.tsx`, add to the `PropertiesPanelProps` interface:

```ts
documents?: import("../../document/types").DocumentMeta[];
onPreviewDocument?: (path: string, entityName?: string) => void;
onOpenDocPicker?: (entityType: string, entityId: string) => void;
onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
getDocumentReferences?: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
  attachments: Array<{ entityType: string; entityId: string }>;
  wikiBacklinks: string[];
};
deleteDocumentWithCleanup?: (path: string) => Promise<void>;
onCreateAndAttach?: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
```

In the render function, when `DiagramProperties` is rendered (where `selection.type === "flow"` or no selection), pass the new props:

```tsx
<DiagramProperties
  {/* existing props */}
  documents={documents}
  onPreviewDocument={onPreviewDocument}
  onOpenDocPicker={onOpenDocPicker}
  onDetachDocument={onDetachDocument}
  getDocumentReferences={getDocumentReferences}
  deleteDocumentWithCleanup={deleteDocumentWithCleanup}
  onCreateAndAttach={onCreateAndAttach}
  activeFlowId={selection?.type === "flow" ? selection.id : undefined}
/>
```

- [ ] **Step 9.2: Thread props through `DiagramProperties` to `FlowProperties`**

In `DiagramProperties.tsx`, add to the props interface:

```ts
documents?: import("../../document/types").DocumentMeta[];
onPreviewDocument?: (path: string, entityName?: string) => void;
onOpenDocPicker?: (entityType: string, entityId: string) => void;
onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
getDocumentReferences?: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
  attachments: Array<{ entityType: string; entityId: string }>;
  wikiBacklinks: string[];
};
deleteDocumentWithCleanup?: (path: string) => Promise<void>;
onCreateAndAttach?: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
```

Find where `FlowProperties` is rendered within `DiagramProperties` (in the flows expandable list / FlowItem component). Pass:

```tsx
<FlowProperties
  {/* existing props */}
  attachedDocs={documents?.filter(d => d.attachedTo?.some(a => a.type === "flow" && a.id === flow.id)) ?? []}
  onAttach={() => onOpenDocPicker?.("flow", flow.id)}
  onDetach={(docPath) => onDetachDocument?.(docPath, "flow", flow.id)}
  onPreview={(docPath) => onPreviewDocument?.(docPath, flow.name)}
  getDocumentReferences={getDocumentReferences}
  deleteDocumentWithCleanup={deleteDocumentWithCleanup}
  onCreateAndAttach={(filename, editNow) => onCreateAndAttach?.(flow.id, filename, editNow)}
/>
```

- [ ] **Step 9.3: Add new props to `DiagramOverlays` and wire to `PropertiesPanel`**

In `DiagramOverlays.tsx`, add to the props interface and destructure (alongside the existing props):

```ts
onDetachDocument: (docPath: string, entityType: string, entityId: string) => void;
documents: import("../../document/types").DocumentMeta[];
onCreateAndAttach: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
```

Wire these into the `<PropertiesPanel>` render call alongside the existing `onAttachDocument` / `onOpenDocument` props:

```tsx
<PropertiesPanel
  {/* existing props */}
  documents={documents}
  onPreviewDocument={(path, entityName) => {
    setPreviewDocPath(path);
    setPreviewEntityName(entityName);
  }}
  onOpenDocPicker={(type, id) => setPickerTarget({ type, id })}
  onDetachDocument={onDetachDocument}
  getDocumentReferences={getDocumentReferences}
  deleteDocumentWithCleanup={deleteDocumentWithCleanup}
  onCreateAndAttach={onCreateAndAttach}
/>
```

- [ ] **Step 9.4: Add `onDetachDocument` and `onCreateAndAttach` to `DiagramView`**

In `DiagramView.tsx`, add `onDetachDocument` and `onCreateAndAttach` to the props interface:

```ts
onDetachDocument: (docPath: string, entityType: string, entityId: string) => void;
onCreateAndAttach: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
```

Pass them into `<DiagramOverlays>`.

- [ ] **Step 9.5: Wire `onDetachDocument` and `onCreateAndAttach` in `knowledgeBase.tsx`**

In `knowledgeBase.tsx`, add the `onCreateAndAttach` callback:

```ts
const handleCreateAndAttach = useCallback(async (flowId: string, filename: string, editNow: boolean) => {
  const rootHandle = fileExplorer.dirHandleRef.current;
  if (!rootHandle) return;
  const activeDiagramPath = panes.activeEntry?.filePath;
  if (!activeDiagramPath) return;

  // Determine the doc path relative to the vault root
  const diagramDir = activeDiagramPath.split("/").slice(0, -1).join("/");
  const docPath = diagramDir ? `${diagramDir}/${filename}` : filename;

  await docManager.createDocument(rootHandle, docPath); // initialContent defaults to ""
  docManager.attachDocument(docPath, "flow" as const, flowId);
  if (editNow) handleOpenDocument(docPath);
}, [fileExplorer.dirHandleRef, panes.activeEntry, docManager, handleOpenDocument]);
```

Pass into `<DiagramView>`:
```tsx
<DiagramView
  {/* existing */}
  onDetachDocument={(docPath, entityType, entityId) =>
    docManager.detachDocument(docPath, entityType, entityId)
  }
  onCreateAndAttach={handleCreateAndAttach}
/>
```

- [ ] **Step 9.6: Build check**

```bash
npm run build 2>&1 | head -60
```

Fix any TypeScript errors.

- [ ] **Step 9.7: Run full test suite**

```bash
npm run test:run
```

Expected: all existing tests still pass plus new tests.

- [ ] **Step 9.8: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx \
        src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx \
        src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx \
        src/app/knowledge_base/features/diagram/DiagramView.tsx \
        src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(diagram): thread flow document attachment props through component tree"
```

---

## Task 10: `DocumentsSection` prop rename — universal preview modal

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/DocumentsSection.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx`

- [ ] **Step 10.1: Rename `onOpenDocument` → `onPreviewDocument` in `DocumentsSection`**

In `DocumentsSection.tsx`, change the interface:

```ts
// Before
interface DocumentsSectionProps {
  backlinks: { sourcePath: string; section?: string }[];
  onOpenDocument?: (path: string) => void;
}

// After
interface DocumentsSectionProps {
  backlinks: { sourcePath: string; section?: string }[];
  onPreviewDocument?: (path: string) => void;
}
```

Change the usage inside the component:
```tsx
// Before
onClick={() => onOpenDocument?.(bl.sourcePath)}

// After
onClick={() => onPreviewDocument?.(bl.sourcePath)}
```

- [ ] **Step 10.2: Update all call sites**

In each of the files below, find `onOpenDocument={onOpenDocument}` passed to `<DocumentsSection>` and rename to `onPreviewDocument`:

**`NodeProperties.tsx`:**
```tsx
<DocumentsSection
  backlinks={backlinks}
  onPreviewDocument={onPreviewDocument}    {/* was onOpenDocument */}
/>
```
Also rename the prop in `NodeProperties`'s own interface: `onPreviewDocument?: (path: string) => void` (was `onOpenDocument`).

**`LineProperties.tsx`:** Same pattern.

**`LayerProperties.tsx`:** Same pattern.

**`DiagramProperties.tsx`:** Same pattern for its `DocumentsSection` usage. Also update the `FlowProperties` call if `onOpenDocument` was passed there.

- [ ] **Step 10.3: Update `PropertiesPanel` to use `onPreviewDocument`**

`PropertiesPanel` passes `onOpenDocument` down to entity panels. Change all those pass-throughs to use `onPreviewDocument`. The `PropertiesPanel` itself no longer needs `onOpenDocument` in its interface for the entity panels — it now passes `onPreviewDocument` instead.

Keep `onOpenDocument` prop on `PropertiesPanel` only for its usage in wiring the `DocPreviewModal`'s "Open in pane" action inside `DiagramOverlays`.

- [ ] **Step 10.4: Build check + full test run**

```bash
npm run build 2>&1 | head -60
npm run test:run
```

Expected: no regressions. All tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/DocumentsSection.tsx \
        src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/LineProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx
git commit -m "feat(diagram): rename onOpenDocument→onPreviewDocument for universal preview modal"
```

---

## Task 11: Update `Features.md` and `test-cases/03-diagram.md`

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/03-diagram.md`

- [ ] **Step 11.1: Update `Features.md`**

Under **section 3.10 Flows**, add after the existing bullets:

```
- ✅ **Document attachment** — attach existing docs to a flow from FlowProperties; create & attach a new blank doc (with optional "Edit now" to open in pane); detach with optional cascade delete that strips wiki-links from referencing docs and shows a deduplicated reference list before confirming.
```

Update the **Attach-to-entity modal** entry (search for it in section 3.x) to read:

```
- ✅ **Attach-to-entity modal** — attaches Markdown docs to diagram entities (root, node, connection, flow, type). `'flow'` entity type now fully wired with UI.
```

Add a new section for the modal (find the appropriate section, e.g., after section 3.11 or wherever modal-level UI is documented):

```markdown
### 3.x Doc Preview Modal
`diagram/components/DocPreviewModal.tsx`
- ✅ **DocPreviewModal** — universal read-only document preview triggered by clicking any attached doc or wiki-link backlink in any entity panel. Blurs the diagram canvas (`blur-sm pointer-events-none`) and disables interactions while open. Header shows filename, "Read only" chip, optional entity name badge, "Open in pane" button, and close ✕. Body renders document content via `markdownToHtml()` in `.markdown-editor .ProseMirror` — pixel-identical to the doc pane. Rendered via `ReactDOM.createPortal` at `document.body`, unaffected by ancestor `filter`/`transform`. Closes on Escape or backdrop click.
```

- [ ] **Step 11.2: Update `test-cases/03-diagram.md`**

Find the section for flows (3.10) and add a sub-section at the end with the next available IDs (check the file for the last used number in section 3.10, then continue):

```markdown
#### 3.10.x — Flow Document Attachment

| ID | Status | Scenario |
|----|--------|----------|
| DIAG-3.10-[N+1] | ❌ | Attach existing doc to flow — appears in Documents section of FlowProperties |
| DIAG-3.10-[N+2] | ❌ | Attach same doc twice — second attach is a no-op (no duplicate in list) |
| DIAG-3.10-[N+3] | ❌ | Create & attach new — file created, attached, "Edit now" checked opens pane |
| DIAG-3.10-[N+4] | ❌ | Create & attach new — "Edit now" unchecked, pane not opened |
| DIAG-3.10-[N+5] | ❌ | Detach doc — disappears from Documents section |
| DIAG-3.10-[N+6] | ❌ | Detach doc with no other refs — "Also referenced by" section absent |
| DIAG-3.10-[N+7] | ❌ | Detach doc with other attachments — lists them deduplicated |
| DIAG-3.10-[N+8] | ❌ | Detach doc with wiki-link backlinks — lists them deduplicated |
| DIAG-3.10-[N+9] | ❌ | Detach + delete — file removed from vault |
| DIAG-3.10-[N+10] | ❌ | Detach + delete — wiki-links removed from referencing docs |
| DIAG-3.10-[N+11] | ❌ | Danger warning shown when "Also delete" checked, hidden when unchecked |
| DIAG-3.10-[N+12] | ❌ | Documents section hidden in readOnly mode — no attach/detach buttons |
```

Add a new section for the Doc Preview Modal (find the appropriate place, e.g., after 3.x or as a new top-level section):

```markdown
#### 3.x — Doc Preview Modal

| ID | Status | Scenario |
|----|--------|----------|
| DIAG-3.x-01 | ❌ | Click attached flow doc — DocPreviewModal opens |
| DIAG-3.x-02 | ❌ | Click wiki-link backlink in any entity panel — DocPreviewModal opens |
| DIAG-3.x-03 | ❌ | Preview modal renders markdown matching doc pane styles |
| DIAG-3.x-04 | ❌ | Escape key closes preview modal |
| DIAG-3.x-05 | ❌ | Backdrop click closes preview modal |
| DIAG-3.x-06 | ❌ | "Open in pane" opens doc pane and closes modal |
| DIAG-3.x-07 | ❌ | Diagram canvas is blurred and non-interactive while modal is open |
| DIAG-3.x-08 | ❌ | Error state shown when document cannot be read |
| DIAG-3.x-09 | ❌ | Entity name badge shown in header when context is known (flow name) |
```

- [ ] **Step 11.3: Commit**

```bash
git add Features.md test-cases/03-diagram.md
git commit -m "docs: update Features.md and test-cases for flow doc attachment + preview modal"
```

---

## Final verification

- [ ] **Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass. Count should be higher than before this feature.

- [ ] **Build check**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Manual smoke test checklist**
  - Open a diagram with at least one flow
  - Select the flow → FlowProperties panel shows a Documents section
  - Click "Attach existing…" → document picker modal opens
  - Attach a doc → it appears in the Documents section
  - Click the doc filename → DocPreviewModal opens with blurred canvas
  - Press Escape → modal closes, blur removed
  - Click "Open in pane" → doc opens in pane, modal closes
  - Click "Create & attach new…" → CreateAttachDocModal opens with pre-filled filename
  - Check "Edit now", click Create & Attach → doc created, pane opens
  - Click detach (×) on an attached doc → DetachDocModal opens with cancel/detach
  - Check "Also delete" → danger warning appears with referencing docs
  - Confirm detach + delete → doc removed from panel + file deleted
  - Click a wiki-link backlink in NodeProperties → DocPreviewModal opens (no entity badge)
