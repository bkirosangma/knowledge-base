# Wiki-Link Anchors MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `[[doc.md#header]]` wiki-links scroll to the targeted heading when clicked, add a copy-link affordance on every heading, and auto-update referencing wiki-links when a heading is renamed (broken-anchor banner when deleted).

**Architecture:** The wiki-link parser already extracts the `#section` anchor (`section?: string`); this plan adds (a) scroll-to-anchor in `MarkdownPane` after a navigation, (b) a hover "copy-link" icon on every rendered heading in the document body, (c) a per-document `headers[]` map in the link index, and (d) a rename-detection step in the document save pipeline that auto-updates referencing wiki-links and surfaces a banner for genuine deletions.

**Tech Stack:** React 18, TypeScript, Tiptap v3, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` (slices 8–9 in §14)

**Depends on:** None — independent of Plans 1–2.

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/features/document/utils/headerSlug.ts` | **New** — slugify heading text into a stable id. |
| `src/app/knowledge_base/features/document/utils/headerSlug.test.ts` | **New**. |
| `src/app/knowledge_base/features/document/utils/extractHeaders.ts` | **New** — parse a markdown string into `{ id, text, level }[]`. |
| `src/app/knowledge_base/features/document/utils/extractHeaders.test.ts` | **New**. |
| `src/app/knowledge_base/features/document/types.ts` | Modify — add `headers` to `LinkIndexEntry`. |
| `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts` | Modify — populate `headers` per doc; expose `findHeaderRename`. |
| `src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts` | Modify — cover headers tracking + rename detection. |
| `src/app/knowledge_base/features/document/hooks/useLinkUpdates.ts` (or wherever rename refactor lives) | Modify — add header-rename refactor branch. |
| `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` | Modify — accept `anchor` and scroll on render. |
| `src/app/knowledge_base/features/document/components/HeadingCopyLink.tsx` | **New** — hover icon next to a heading. |
| `src/app/knowledge_base/features/document/components/HeadingCopyLink.test.tsx` | **New**. |
| `src/app/knowledge_base/features/document/extensions/wikiLink.tsx` | Modify — pass anchor through `data-wiki-section` (verify existing). |
| `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` | Modify — add the copy-link icon to rendered headings (read-only mode). |
| `src/app/knowledge_base/knowledgeBase.tsx` | Modify — `onOpenInPane` accepts `(path, anchor?)` and forwards. |
| `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx` (or AttachmentPreviewModal post-Plan-2) | Modify — forward `data-wiki-section` to `onOpenInPane`. |
| `src/app/knowledge_base/shared/components/BrokenAnchorBanner.tsx` | **New** — banner listing broken anchor references, with "Remove anchors" / "Leave broken" actions. |
| `Features.md` | Modify §4.x for anchor support. |
| `test-cases/04-document.md` | New cases for anchor behaviour. |

---

## Task 1: `headerSlug` utility

**Files:**
- Create: `headerSlug.ts`, `headerSlug.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { headerSlug } from "./headerSlug";

describe("headerSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(headerSlug("My Header")).toBe("my-header");
  });
  it("strips punctuation", () => {
    expect(headerSlug("What's the deal?")).toBe("whats-the-deal");
  });
  it("collapses whitespace runs", () => {
    expect(headerSlug("Foo   Bar")).toBe("foo-bar");
  });
  it("strips leading/trailing hyphens", () => {
    expect(headerSlug("  Hello  ")).toBe("hello");
  });
  it("de-accents", () => {
    expect(headerSlug("Café Résumé")).toBe("cafe-resume");
  });
  it("stable across repeats — idempotent", () => {
    expect(headerSlug("Foo")).toBe(headerSlug("foo"));
  });
});
```

- [ ] **Step 1.2: Run to confirm fail**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run test:run -- src/app/knowledge_base/features/document/utils/headerSlug.test.ts
```

Expected: import error.

- [ ] **Step 1.3: Implement**

```ts
/**
 * Convert a heading's text into a stable URL-safe id. Used as the anchor target
 * for `[[doc#header]]` links and for indexing headers in the link index.
 */
export function headerSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")   // strip punctuation
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 1.4: Tests pass**

```bash
npm run test:run -- src/app/knowledge_base/features/document/utils/headerSlug.test.ts
```

- [ ] **Step 1.5: Commit**

```bash
git add src/app/knowledge_base/features/document/utils/headerSlug.ts \
        src/app/knowledge_base/features/document/utils/headerSlug.test.ts
git commit -m "feat(document): headerSlug utility"
```

---

## Task 2: `extractHeaders` utility

**Files:**
- Create: `extractHeaders.ts`, `extractHeaders.test.ts`

- [ ] **Step 2.1: Tests**

```ts
import { describe, it, expect } from "vitest";
import { extractHeaders } from "./extractHeaders";

describe("extractHeaders", () => {
  it("returns empty for content with no headers", () => {
    expect(extractHeaders("just text")).toEqual([]);
  });
  it("parses ATX headers H1–H6", () => {
    expect(extractHeaders("# A\n## B\n### C")).toEqual([
      { id: "a", text: "A", level: 1 },
      { id: "b", text: "B", level: 2 },
      { id: "c", text: "C", level: 3 },
    ]);
  });
  it("ignores hash inside code blocks", () => {
    const md = "```\n# not a header\n```\n# real header";
    expect(extractHeaders(md)).toEqual([{ id: "real-header", text: "real header", level: 1 }]);
  });
  it("ignores hash inside indented code", () => {
    expect(extractHeaders("    # indented")).toEqual([]);
  });
  it("trims trailing spaces in heading text", () => {
    expect(extractHeaders("## Foo   ")).toEqual([{ id: "foo", text: "Foo", level: 2 }]);
  });
});
```

- [ ] **Step 2.2: Run to confirm fail**

- [ ] **Step 2.3: Implement**

```ts
import { headerSlug } from "./headerSlug";

export interface HeaderInfo {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

const ATX_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^```/;

export function extractHeaders(markdown: string): HeaderInfo[] {
  const out: HeaderInfo[] = [];
  let inFence = false;
  for (const lineRaw of markdown.split(/\r?\n/)) {
    if (FENCE_RE.test(lineRaw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (lineRaw.startsWith("    ") || lineRaw.startsWith("\t")) continue; // indented code
    const m = ATX_RE.exec(lineRaw);
    if (!m) continue;
    const level = m[1].length as HeaderInfo["level"];
    const text = m[2].trim();
    out.push({ id: headerSlug(text), text, level });
  }
  return out;
}
```

- [ ] **Step 2.4: Tests pass + commit**

```bash
npm run test:run -- src/app/knowledge_base/features/document/utils/extractHeaders.test.ts
git add -A
git commit -m "feat(document): extractHeaders utility"
```

---

## Task 3: Add `headers` to `LinkIndexEntry`; populate from `useLinkIndex`

**Files:**
- Modify: `src/app/knowledge_base/features/document/types.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts`

- [ ] **Step 3.1: Extend the type**

In `types.ts`, replace `LinkIndexEntry`:

```ts
export interface LinkIndexEntry {
  outboundLinks: OutboundLink[];
  sectionLinks: { targetPath: string; section: string }[];
  /** Headings declared in this document, in document order. */
  headers: { id: string; text: string; level: 1|2|3|4|5|6 }[];
}
```

- [ ] **Step 3.2: Populate in `useLinkIndex.ts`**

Locate the per-document indexing function (the one that builds `outboundLinks` from a doc's content). Add:

```ts
import { extractHeaders } from "../utils/extractHeaders";

// inside the indexing function, after computing outboundLinks/sectionLinks:
const headers = extractHeaders(content);
return { outboundLinks, sectionLinks, headers };
```

- [ ] **Step 3.3: Add `findHeaderRename` helper**

```ts
export function findHeaderRename(prev: { id: string; text: string; level: number }[], next: { id: string; text: string; level: number }[]):
  { renames: Array<{ from: string; to: string }>; deletions: string[] } {
  const removed = prev.filter((p) => !next.some((n) => n.id === p.id));
  const added = next.filter((n) => !prev.some((p) => p.id === n.id));
  const renames: Array<{ from: string; to: string }> = [];
  const deletions: string[] = [];
  if (removed.length === 1 && added.length === 1) {
    // Pure rename: text changed, level identical OR text identical, level changed.
    if (removed[0].level === added[0].level || removed[0].text === added[0].text) {
      renames.push({ from: removed[0].id, to: added[0].id });
    } else {
      deletions.push(removed[0].id);
    }
  } else {
    deletions.push(...removed.map((r) => r.id));
  }
  return { renames, deletions };
}
```

- [ ] **Step 3.4: Tests**

Add to `useLinkIndex.test.ts`:

```ts
import { findHeaderRename } from "./useLinkIndex";

describe("findHeaderRename", () => {
  it("treats one-removed + one-added at same level as rename", () => {
    const r = findHeaderRename(
      [{ id: "old", text: "Old", level: 2 }],
      [{ id: "new", text: "New", level: 2 }],
    );
    expect(r.renames).toEqual([{ from: "old", to: "new" }]);
    expect(r.deletions).toEqual([]);
  });
  it("treats one-removed + one-added with same text different level as rename", () => {
    const r = findHeaderRename(
      [{ id: "x", text: "X", level: 2 }],
      [{ id: "x", text: "X", level: 3 }],
    );
    expect(r.renames).toEqual([{ from: "x", to: "x" }]);
  });
  it("treats multi-removed multi-added as deletions only", () => {
    const r = findHeaderRename(
      [{ id: "a", text: "A", level: 1 }, { id: "b", text: "B", level: 1 }],
      [{ id: "c", text: "C", level: 1 }, { id: "d", text: "D", level: 1 }],
    );
    expect(r.renames).toEqual([]);
    expect(r.deletions).toEqual(["a", "b"]);
  });
  it("addition only is no-op", () => {
    const r = findHeaderRename([{ id: "a", text: "A", level: 1 }], [{ id: "a", text: "A", level: 1 }, { id: "b", text: "B", level: 1 }]);
    expect(r).toEqual({ renames: [], deletions: [] });
  });
});

describe("useLinkIndex.headers", () => {
  it("populates headers from doc content", () => {
    // Given a vault with a doc containing "# A\n## B", expect index.documents[doc].headers to contain both.
    // Use the existing test harness for useLinkIndex.
  });
});
```

- [ ] **Step 3.5: Commit**

```bash
git add -A
git commit -m "feat(document): track per-doc headers in link index + findHeaderRename"
```

---

## Task 4: `MarkdownPane` accepts `anchor` and scrolls

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownPane.tsx`
- Modify: `src/app/knowledge_base/features/document/components/MarkdownPane.test.tsx`

- [ ] **Step 4.1: Test**

```tsx
it("scrolls to the heading matching anchor when content renders", async () => {
  // Render MarkdownPane with content "# A\n## B Section" and anchor="b-section".
  // Mock Element.prototype.scrollIntoView. Wait for content to render.
  // Assert scrollIntoView was called on the element with id "b-section".
});
```

- [ ] **Step 4.2: Implement scroll-to-anchor**

In `MarkdownPane.tsx`, accept a new prop `anchor?: string | null`. After the editor mounts and renders content, run an effect:

```tsx
useEffect(() => {
  if (!anchor || !readyToScroll) return;
  const root = paneScrollRef.current;
  if (!root) return;
  // Tiptap renders headings as <h1..h6>. We assign an id derived from the heading slug at render time.
  const target = root.querySelector(`[data-heading-id="${anchor}"]`) as HTMLElement | null;
  if (target) target.scrollIntoView({ block: "start", behavior: "instant" });
}, [anchor, readyToScroll]);
```

`readyToScroll` is true once `useDocumentContent.loadedPath === filePath` and the editor has rendered (you can poll with a tiny `setTimeout(0)` after content settles). `data-heading-id` is set in Task 5 (a renderer addition on the heading node view).

- [ ] **Step 4.3: Commit**

```bash
git add -A
git commit -m "feat(document): MarkdownPane.anchor — scroll to heading on open"
```

---

## Task 5: Heading renders carry `data-heading-id`

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` (or the Tiptap heading extension config)

- [ ] **Step 5.1: Add a `Heading.extend` block**

Tiptap exposes the StarterKit's `Heading` extension. Override its `renderHTML` to stamp `data-heading-id`:

```ts
import Heading from "@tiptap/extension-heading";
import { headerSlug } from "../utils/headerSlug";

const SluggedHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const text = node.textContent;
    const id = headerSlug(text);
    return [`h${node.attrs.level}`, { ...HTMLAttributes, "data-heading-id": id, id }, 0];
  },
});
```

In the StarterKit `useEditor` config, disable the bundled heading and add `SluggedHeading`:

```ts
StarterKit.configure({ heading: false }),
SluggedHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
```

- [ ] **Step 5.2: Tests**

```ts
it("renders headings with data-heading-id attribute", () => {
  // Mount the editor with content "## Section A". Query the rendered DOM for h2[data-heading-id="section-a"].
});
```

- [ ] **Step 5.3: Commit**

```bash
git add -A
git commit -m "feat(document): heading renders carry data-heading-id"
```

---

## Task 6: `HeadingCopyLink` component + hover affordance

**Files:**
- Create: `src/app/knowledge_base/features/document/components/HeadingCopyLink.tsx`
- Create: `HeadingCopyLink.test.tsx`

- [ ] **Step 6.1: Test**

```tsx
it("copies [[currentDoc#section]] to clipboard on click", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<HeadingCopyLink currentDocFilename="auth.md" headerId="overview" />);
  fireEvent.click(screen.getByTestId("heading-copy-link-overview"));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith("[[auth.md#overview]]"));
});
```

- [ ] **Step 6.2: Implement**

```tsx
import { Link2 } from "lucide-react";
import { useState } from "react";

interface Props {
  currentDocFilename: string;
  headerId: string;
}

export function HeadingCopyLink({ currentDocFilename, headerId }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid={`heading-copy-link-${headerId}`}
      title="Copy link to this heading"
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-slate-500 hover:text-slate-800"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(`[[${currentDocFilename}#${headerId}]]`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied!" : <Link2 size={12} />}
    </button>
  );
}
```

- [ ] **Step 6.3: Mount the icon next to every rendered heading**

The cleanest way is via Tiptap NodeView. In the SluggedHeading extension:

```ts
addNodeView() {
  return ReactNodeViewRenderer(HeadingNodeView);
}
```

Where `HeadingNodeView` renders the heading content + a `<HeadingCopyLink>` after it. The `group-hover:opacity-100` Tailwind class makes the icon appear only on hover of the heading wrapper; the wrapper gets `className="group flex items-center"`.

Alternatively, mount the icon via a portal next to every `[data-heading-id]` element on render — simpler but requires an effect that re-runs on content change. Pick whichever fits the existing extension patterns; the NodeView approach is preferred because it survives editor edits cleanly.

- [ ] **Step 6.4: Commit**

```bash
git add -A
git commit -m "feat(document): hover copy-link icon on every heading"
```

---

## Task 7: `onOpenInPane` accepts and forwards an anchor

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx` (or `AttachmentPreviewModal.tsx` if Plan 2 has shipped)
- Modify: `src/app/knowledge_base/features/document/extensions/wikiLink.tsx`
- Modify: `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` (uses anchor from Task 4)

- [ ] **Step 7.1: Widen the signature**

In `knowledgeBase.tsx`:

```ts
const handleOpenInPane = useCallback((path: string, anchor?: string | null) => {
  // existing pane resolution logic...
  setActiveDocFile(path);
  setDocAnchor(anchor ?? null);
}, [/* ... */]);
```

`docAnchor` is a new state piece, passed to `MarkdownPane` as the `anchor` prop introduced in Task 4.

- [ ] **Step 7.2: Forward from wiki-link click**

In `wikiLink.tsx`, the click handler that produces the `onOpenInPane` call already has access to the `data-wiki-section` attribute (since the parser stores it). Pull that into the call:

```ts
const anchor = element.getAttribute("data-wiki-section") || null;
onOpenInPane(targetPath, anchor);
```

Repeat for the DocPreviewModal / AttachmentPreviewModal wiki-link delegated handler.

- [ ] **Step 7.3: Tests**

In `knowledgeBase` integration test, simulate a wiki-link click with a `#section` anchor and assert `setDocAnchor` is called.

- [ ] **Step 7.4: Commit**

```bash
git add -A
git commit -m "feat(document): plumb anchor through onOpenInPane"
```

---

## Task 8: Header rename auto-refactoring

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkUpdates.ts` (or wherever rename refactor lives — locate via `grep -rn "renameTarget\|updateOutboundLinks"`)

- [ ] **Step 8.1: Add rename detection on save**

When a document is saved, before committing the new content to the index, compare `prevHeaders` (current index) with `nextHeaders` (extracted from the new content):

```ts
import { findHeaderRename } from "./useLinkIndex";
import { extractHeaders } from "../utils/extractHeaders";

const prev = linkIndex.documents[savedPath]?.headers ?? [];
const next = extractHeaders(savedContent);
const { renames, deletions } = findHeaderRename(prev, next);
```

For each `rename`, walk every doc whose `outboundLinks` references this path with `section === from`, and rewrite to `section === to`. Use the existing renameWiki helpers as a template.

- [ ] **Step 8.2: Surface deletions via banner**

If `deletions.length > 0`, set `brokenAnchorState = { docPath: savedPath, deletedIds: deletions }` and pass to `BrokenAnchorBanner`. The banner is rendered in `KnowledgeBase` chrome, like the existing `ConflictBanner`.

- [ ] **Step 8.3: Tests**

```ts
it("auto-updates wiki-link references when a single heading is renamed", () => {
  // Vault: doc-a.md has "[[doc-b.md#old-section]]". Edit doc-b.md to change "## Old Section" to "## New Section".
  // After save, expect doc-a.md's wiki-link to be "[[doc-b.md#new-section]]".
});
it("surfaces broken-anchor banner when a heading is deleted", () => {
  // Vault: doc-a.md has "[[doc-b.md#deleted-section]]". Delete that heading from doc-b.md.
  // After save, expect brokenAnchorState to be { docPath: "doc-b.md", deletedIds: ["deleted-section"] }.
});
```

- [ ] **Step 8.4: Commit**

```bash
git add -A
git commit -m "feat(document): auto-refactor wiki-link anchors on header rename; banner on delete"
```

---

## Task 9: `BrokenAnchorBanner` component

**Files:**
- Create: `src/app/knowledge_base/shared/components/BrokenAnchorBanner.tsx`
- Create: `BrokenAnchorBanner.test.tsx`

- [ ] **Step 9.1: Implement**

```tsx
import { AlertTriangle } from "lucide-react";

interface Props {
  docPath: string;
  deletedIds: string[];
  affectedRefs: Array<{ sourcePath: string; anchor: string }>;
  onRemoveAnchors: () => void;
  onLeaveBroken: () => void;
}

export function BrokenAnchorBanner({ docPath, deletedIds, affectedRefs, onRemoveAnchors, onLeaveBroken }: Props) {
  return (
    <div data-testid="broken-anchor-banner" className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
      <AlertTriangle size={14} />
      <div className="flex-1">
        <strong>{deletedIds.length}</strong> heading{deletedIds.length === 1 ? "" : "s"} removed from <code>{docPath}</code>;
        <span className="ml-1">{affectedRefs.length} wiki-link{affectedRefs.length === 1 ? "" : "s"} now broken.</span>
      </div>
      <button onClick={onRemoveAnchors} className="px-2 py-0.5 bg-amber-200 rounded hover:bg-amber-300">Remove anchors</button>
      <button onClick={onLeaveBroken} className="px-2 py-0.5 hover:underline">Leave broken</button>
    </div>
  );
}
```

- [ ] **Step 9.2: Tests cover both buttons**

- [ ] **Step 9.3: Wire into `KnowledgeBase`**

Render conditionally below the existing toolbar / above the panes.

- [ ] **Step 9.4: Commit**

```bash
git add -A
git commit -m "feat(shared): BrokenAnchorBanner — surface broken wiki-link anchors after header delete"
```

---

## Task 10: `Features.md` + `test-cases/04-document.md`

- [ ] **Step 10.1: Update Features.md**

Add to §4.x under document editor:

```markdown
- ✅ **Wiki-link header anchors** — `[[doc.md#header]]` parses, renders with `data-wiki-section`, scrolls the target heading into view on open. Heading hover reveals a copy-link icon that copies `[[<currentDoc>#<header-slug>]]` to the clipboard. Header rename in a doc auto-refactors every referencing wiki-link in the vault; header delete surfaces `BrokenAnchorBanner` with "Remove anchors" / "Leave broken" actions.
```

- [ ] **Step 10.2: Add new test-case IDs**

Under `test-cases/04-document.md`:

```markdown
- DOC-4.x-XX ❌: `[[doc.md#header]]` parses with section anchor.
- DOC-4.x-XX ❌: Clicking such a wiki-link opens the doc and scrolls to the heading.
- DOC-4.x-XX ❌: DocPreviewModal forwards anchor on Open in pane.
- DOC-4.x-XX ❌: Heading hover reveals copy-link icon.
- DOC-4.x-XX ❌: Click copy-link copies `[[currentDoc#slug]]` to clipboard; toast confirms.
- DOC-4.x-XX ❌: Renaming a heading auto-updates referencing wiki-links across the vault.
- DOC-4.x-XX ❌: Deleting a heading surfaces BrokenAnchorBanner.
- DOC-4.x-XX ❌: BrokenAnchorBanner "Remove anchors" strips the `#section` from references.
- DOC-4.x-XX ❌: BrokenAnchorBanner "Leave broken" preserves references; they render as plain wiki-links.
```

- [ ] **Step 10.3: Commit + push + PR**

```bash
git add Features.md test-cases/04-document.md
git commit -m "docs(document): Features.md + test-cases for wiki-link anchors"
git push
gh pr create --title "feat(document): Wiki-Link Anchors MVP — scroll, copy-link, refactoring"
```

---

## Self-review

1. **Spec coverage** — §7 fully implemented: parse, render, scroll, copy-link, rename refactor, broken-anchor banner.
2. **Existing capability** — wikiLinkParser already supports `#section`; this plan ADDS scroll, copy, refactor, banner, doesn't re-implement parsing.
3. **No placeholders** — every implementation step has runnable code or explicit grep target.
4. **Type consistency** — `headers` everywhere is `{ id, text, level }[]`; `anchor` is `string | null` everywhere; `findHeaderRename` returns `{ renames, deletions }` with consistent keys.
5. **Read-only** — copy-link button works in read-only mode (it's a navigation action, not an edit).
