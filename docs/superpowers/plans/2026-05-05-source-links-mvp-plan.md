# Source Links MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `sources?: SourceLink[]` field to every primary entity (diagram top-level, node, connection, layer, flow, document, SVG, tab) plus a "Sources" section in every Properties panel that lets the author add / edit / remove canonical online URLs the entity is grounded in.

**Architecture:** A single shared `SourceLink` type and a single `<SourcesSection>` component. Each entity-meta interface gains `sources?: SourceLink[]`. Persistence: passed through verbatim for diagrams (already JSON), via YAML frontmatter for documents and tabs, via a `.meta.json` sidecar for SVGs. The skill contract (sources mandatory at generation time) lives in Plan 5; this plan ships the data model + UX so manual entry works today.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, Vitest + RTL, gray-matter (or the existing frontmatter parser; locate via `grep -rn "frontmatter\|gray-matter"`).

**Spec:** `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` (slice 10 in §14)

**Depends on:** None functionally — independent of Plans 1–3. Plan 5 will populate `sources` automatically at skill-generation time but does not block this plan.

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/shared/types/sources.ts` | **New** — `SourceLink` type. |
| `src/app/knowledge_base/features/diagram/types.ts` | Modify — `DiagramData`, `LayerDef`, `NodeIdentity`, `Connection`, `FlowDef`, `SerializedNodeData` gain `sources?`. |
| `src/app/knowledge_base/features/document/types.ts` | Modify — `DocumentMeta` gains `sources?`. |
| `src/app/knowledge_base/features/svgEditor/types.ts` | Modify — `SvgMeta` gains `sources?`. |
| `src/app/knowledge_base/features/tab/types.ts` | Modify — `TabMeta` gains `sources?`. |
| `src/app/knowledge_base/shared/utils/persistence.ts` | Modify — round-trip `sources` through diagram serialization. |
| `src/app/knowledge_base/features/document/utils/frontmatter.ts` | Modify — round-trip `sources` through YAML frontmatter (locate with grep). |
| `src/app/knowledge_base/features/svgEditor/utils/svgMetaSidecar.ts` | **New** — load / save `<filename>.meta.json` sidecar. |
| `src/app/knowledge_base/features/tab/utils/tabHeader.ts` | Modify — parse / emit `\sources` AlphaTex header (or trailing comment fallback). |
| `src/app/knowledge_base/shared/components/SourcesSection.tsx` | **New** — list + add / edit / remove rows. |
| `src/app/knowledge_base/shared/components/SourcesSection.test.tsx` | **New**. |
| `src/app/knowledge_base/features/diagram/properties/{Diagram,Node,Line,Layer,Flow}Properties.tsx` | Modify — wire `<SourcesSection>` and update handlers. |
| `src/app/knowledge_base/features/document/properties/DocumentProperties.tsx` | Modify — wire `<SourcesSection>`. |
| `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx` | Modify — wire `<SourcesSection>`. |
| `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` | Modify — wire `<SourcesSection>`. |
| `Features.md` | Modify — new entry per entity type. |
| `test-cases/03-diagram.md`, `test-cases/04-document.md`, `test-cases/0?-svg.md`, `test-cases/11-tabs.md` | New `SRC-XX-NN` test IDs. |

---

## Task 1: `SourceLink` type

**Files:**
- Create: `src/app/knowledge_base/shared/types/sources.ts`

- [ ] **Step 1.1: Define + a URL validator**

```ts
export interface SourceLink {
  /** http(s):// URL only — other schemes rejected. */
  url: string;
  /** Optional display label; falls back to URL host when blank. */
  title?: string;
}

export function isValidSourceUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Returns the host of a URL, or the raw string if parsing fails. */
export function sourceDisplayLabel(s: SourceLink): string {
  if (s.title && s.title.trim() !== "") return s.title;
  try { return new URL(s.url).host; } catch { return s.url; }
}
```

- [ ] **Step 1.2: Tests**

```ts
import { describe, it, expect } from "vitest";
import { isValidSourceUrl, sourceDisplayLabel } from "./sources";

describe("isValidSourceUrl", () => {
  it("accepts http and https", () => {
    expect(isValidSourceUrl("https://datatracker.ietf.org/doc/html/rfc6749")).toBe(true);
    expect(isValidSourceUrl("http://example.com")).toBe(true);
  });
  it("rejects javascript: data: file:", () => {
    expect(isValidSourceUrl("javascript:alert(1)")).toBe(false);
    expect(isValidSourceUrl("data:text/html,<x>")).toBe(false);
    expect(isValidSourceUrl("file:///etc/passwd")).toBe(false);
  });
  it("rejects garbage", () => {
    expect(isValidSourceUrl("not-a-url")).toBe(false);
    expect(isValidSourceUrl("")).toBe(false);
  });
});

describe("sourceDisplayLabel", () => {
  it("returns title when present and non-empty", () => {
    expect(sourceDisplayLabel({ url: "https://x.com", title: "X" })).toBe("X");
  });
  it("falls back to host when title blank", () => {
    expect(sourceDisplayLabel({ url: "https://datatracker.ietf.org/foo" })).toBe("datatracker.ietf.org");
  });
});
```

- [ ] **Step 1.3: Commit**

```bash
git add src/app/knowledge_base/shared/types/sources.ts \
        src/app/knowledge_base/shared/types/sources.test.ts
git commit -m "feat(sources): SourceLink type + URL validator + display helper"
```

---

## Task 2: Add `sources?` to every entity-meta interface

**Files:**
- Modify the five `types.ts` files listed in the File Map.

- [ ] **Step 2.1: Diagram types**

In `features/diagram/types.ts`, import the new type:

```ts
import type { SourceLink } from "../../shared/types/sources";
```

Add `sources?: SourceLink[]` to:
- `NodeIdentity` (so it lives at runtime on `NodeData`)
- `SerializedNodeData` (so it persists)
- `Connection`
- `LayerDef`
- `FlowDef`

For `DiagramData` (top-level), find the interface (or type alias for the JSON shape) and add `sources?: SourceLink[]`.

- [ ] **Step 2.2: Document, SVG, tab**

Add `sources?: SourceLink[]` to `DocumentMeta`, `SvgMeta`, `TabMeta`.

- [ ] **Step 2.3: Typecheck**

```bash
npm run typecheck
```

Expected: clean. Existing call sites are unaffected because the field is optional.

- [ ] **Step 2.4: Commit**

```bash
git add -A
git commit -m "feat(sources): sources?: SourceLink[] on every primary entity type"
```

---

## Task 3: Persist `sources` through diagram JSON

**Files:**
- Modify: `src/app/knowledge_base/shared/utils/persistence.ts`
- Modify: `src/app/knowledge_base/shared/utils/persistence.test.ts`

Diagram JSON is already pass-through for unknown fields, but we make it explicit so `serializeNodes` strips the runtime `icon: ComponentType` correctly while preserving `sources`.

- [ ] **Step 3.1: Update `serializeNodes`**

In the existing serializer's spread, append:

```ts
...(n.sources && n.sources.length > 0 ? { sources: n.sources } : {}),
```

In `deserializeNodes`, pass through `n.sources` verbatim (no transform needed).

- [ ] **Step 3.2: Top-level diagram + connections + layers + flows**

`Connection`, `LayerDef`, `FlowDef`, top-level diagram object — all are already pass-through. Add explicit round-trip tests.

- [ ] **Step 3.3: Tests**

```ts
it("round-trips diagram top-level sources", () => {
  const data = { title: "T", layers: [], nodes: [], connections: [], flows: [], sources: [{ url: "https://x.com" }] };
  expect(loadDiagramFromData(data as never).sources).toEqual([{ url: "https://x.com" }]);
});

it("round-trips per-node sources via serializeNodes", () => {
  const node: NodeData = { id: "n", label: "N", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never, sources: [{ url: "https://rfc.example/oauth" }] };
  const ser = serializeNodes([node])[0];
  expect(ser.sources).toEqual([{ url: "https://rfc.example/oauth" }]);
});

it("round-trips FlowDef sources", () => { /* similar */ });
it("round-trips LayerDef sources", () => { /* similar */ });
it("round-trips Connection sources", () => { /* similar */ });
```

- [ ] **Step 3.4: Commit**

```bash
git add -A
git commit -m "feat(sources): persist sources through diagram serialization"
```

---

## Task 4: Frontmatter round-trip for documents and tabs

**Files:**
- Modify: the existing frontmatter parser (locate via grep — likely `features/document/utils/frontmatter.ts` or similar).
- Modify: tab header parser.

- [ ] **Step 4.1: Locate the frontmatter parser**

```bash
grep -rn "gray-matter\|---\\n\\|frontmatter" src/app/knowledge_base/ | head -20
```

- [ ] **Step 4.2: Verify YAML round-trip handles arrays of objects**

Frontmatter parsers normally do — but write a dedicated test:

```ts
it("frontmatter round-trips sources array", () => {
  const md = "---\nsources:\n  - url: https://example.com\n    title: Example\n  - url: https://x.com\n---\n# Body";
  const parsed = parseFrontmatter(md);
  expect(parsed.frontmatter.sources).toEqual([
    { url: "https://example.com", title: "Example" },
    { url: "https://x.com" },
  ]);
});
```

If the existing parser doesn't preserve nested objects, fall back to a structured comment block (e.g. `<!-- sources: [...] -->` JSON line) — but check first.

- [ ] **Step 4.3: Tab header**

For `.alphatex` files, AlphaTex supports custom `\meta` keys. Add a `\sources` macro:

```ts
// Parse `\sources <JSON-array>` from the AlphaTex header; emit it back on save.
```

Or, fallback: a leading comment block `// sources: [...]` parsed before the AlphaTex source.

- [ ] **Step 4.4: Tests**

Round-trip tests for both document and tab formats.

- [ ] **Step 4.5: Commit**

```bash
git add -A
git commit -m "feat(sources): frontmatter round-trip for documents + tabs"
```

---

## Task 5: SVG sidecar `.meta.json`

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/utils/svgMetaSidecar.ts`
- Modify: SVG load/save pipeline.

- [ ] **Step 5.1: Implement load + save**

```ts
import type { FileSystemFileHandle } from "../../../infrastructure/fileSystemTypes";
import type { SourceLink } from "../../../shared/types/sources";

export interface SvgSidecar {
  sources?: SourceLink[];
  attachedTo?: import("../../document/types").EntityAttachment[]; // already-existing field from Plan 2
}

export async function readSvgSidecar(parent: FileSystemDirectoryHandle, svgFilename: string): Promise<SvgSidecar | null> {
  try {
    const handle = await parent.getFileHandle(`${svgFilename}.meta.json`);
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as SvgSidecar;
  } catch {
    return null; // sidecar absent is normal
  }
}

export async function writeSvgSidecar(parent: FileSystemDirectoryHandle, svgFilename: string, meta: SvgSidecar): Promise<void> {
  if (!meta.sources?.length && !meta.attachedTo?.length) {
    // Nothing to persist — delete sidecar if it exists.
    try { await parent.removeEntry(`${svgFilename}.meta.json`); } catch { /* not present */ }
    return;
  }
  const handle = await parent.getFileHandle(`${svgFilename}.meta.json`, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(meta, null, 2));
  await writable.close();
}
```

- [ ] **Step 5.2: Hook into the existing SVG repository / hook**

Find where SVGs are read / written and call `readSvgSidecar` / `writeSvgSidecar` alongside the SVG file. Merge the sidecar into the in-memory `SvgMeta`.

- [ ] **Step 5.3: Tests + commit**

```bash
git add -A
git commit -m "feat(sources): SVG .meta.json sidecar for sources + attachments"
```

---

## Task 6: `SourcesSection` shared component

**Files:**
- Create: `src/app/knowledge_base/shared/components/SourcesSection.tsx`
- Create: `SourcesSection.test.tsx`

- [ ] **Step 6.1: Tests**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcesSection } from "./SourcesSection";

describe("SourcesSection", () => {
  it("renders 'No sources recorded.' when list is empty in read-only", () => {
    render(<SourcesSection sources={[]} onChange={() => {}} readOnly />);
    expect(screen.getByText("No sources recorded.")).toBeInTheDocument();
    expect(screen.queryByTestId("sources-add")).toBeNull();
  });

  it("renders Add button when not readOnly", () => {
    render(<SourcesSection sources={[]} onChange={() => {}} />);
    expect(screen.getByTestId("sources-add")).toBeInTheDocument();
  });

  it("renders one row per source with display label", () => {
    render(
      <SourcesSection
        sources={[
          { url: "https://datatracker.ietf.org/doc/html/rfc6749", title: "RFC 6749 — OAuth 2.0" },
          { url: "https://example.com" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("RFC 6749 — OAuth 2.0")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("calls onChange with new array when adding a source", () => {
    const onChange = vi.fn();
    render(<SourcesSection sources={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("sources-add"));
    fireEvent.change(screen.getByTestId("sources-url-input-0"), { target: { value: "https://x.com" } });
    fireEvent.blur(screen.getByTestId("sources-url-input-0"));
    expect(onChange).toHaveBeenLastCalledWith([{ url: "https://x.com", title: "" }]);
  });

  it("rejects invalid URLs on blur (does not add)", () => {
    const onChange = vi.fn();
    render(<SourcesSection sources={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("sources-add"));
    fireEvent.change(screen.getByTestId("sources-url-input-0"), { target: { value: "javascript:bad" } });
    fireEvent.blur(screen.getByTestId("sources-url-input-0"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("sources-error-0")).toHaveTextContent(/invalid/i);
  });

  it("calls onChange with the row removed when 'Remove' clicked", () => {
    const onChange = vi.fn();
    render(<SourcesSection sources={[{ url: "https://a.com" }, { url: "https://b.com" }]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("sources-remove-0"));
    expect(onChange).toHaveBeenLastCalledWith([{ url: "https://b.com" }]);
  });

  it("Open button has target=_blank and rel=noopener noreferrer", () => {
    render(<SourcesSection sources={[{ url: "https://a.com" }]} onChange={() => {}} />);
    const link = screen.getByTestId("sources-open-0") as HTMLAnchorElement;
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
    expect(link.rel).toContain("noreferrer");
  });

  it("hides edit affordances when readOnly", () => {
    render(<SourcesSection sources={[{ url: "https://a.com" }]} onChange={() => {}} readOnly />);
    expect(screen.queryByTestId("sources-add")).toBeNull();
    expect(screen.queryByTestId("sources-remove-0")).toBeNull();
  });
});
```

- [ ] **Step 6.2: Implement**

```tsx
import { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { isValidSourceUrl, sourceDisplayLabel, type SourceLink } from "../types/sources";

interface Props {
  sources: SourceLink[];
  onChange: (next: SourceLink[]) => void;
  readOnly?: boolean;
}

export function SourcesSection({ sources, onChange, readOnly }: Props) {
  const [draftErrors, setDraftErrors] = useState<Record<number, string>>({});

  const setRow = (i: number, patch: Partial<SourceLink>) => {
    const next = sources.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange(next);
  };
  const removeRow = (i: number) => onChange(sources.filter((_, idx) => idx !== i));
  const addRow = () => onChange([...sources, { url: "", title: "" }]);

  return (
    <div className="space-y-1">
      <h4 className="text-[10px] uppercase text-slate-500 tracking-wide">Sources</h4>
      {sources.length === 0 && (
        <p className="text-xs text-mute">{readOnly ? "No sources recorded." : "No sources recorded — add one below."}</p>
      )}
      {sources.map((s, i) => (
        <div key={i} className="flex items-center gap-1 text-xs" data-testid={`sources-row-${i}`}>
          <input
            data-testid={`sources-title-input-${i}`}
            placeholder={s.url ? sourceDisplayLabel({ url: s.url }) : "Title (optional)"}
            value={s.title ?? ""}
            disabled={readOnly}
            className="flex-1 px-1 py-0.5 border rounded"
            onChange={(e) => setRow(i, { title: e.target.value })}
          />
          <input
            data-testid={`sources-url-input-${i}`}
            placeholder="https://…"
            value={s.url}
            disabled={readOnly}
            className={"flex-2 px-1 py-0.5 border rounded " + (draftErrors[i] ? "border-red-500" : "")}
            onChange={(e) => setRow(i, { url: e.target.value })}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === "") return; // empty is fine (still a draft row)
              if (!isValidSourceUrl(v)) {
                setDraftErrors((p) => ({ ...p, [i]: "invalid URL" }));
                // Roll back to previous valid value: we already mutated via onChange, so undo.
                setRow(i, { url: sources[i]?.url ?? "" });
              } else {
                setDraftErrors((p) => { const c = { ...p }; delete c[i]; return c; });
              }
            }}
          />
          {draftErrors[i] && <span data-testid={`sources-error-${i}`} className="text-red-600">{draftErrors[i]}</span>}
          <a
            data-testid={`sources-open-${i}`}
            href={s.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={"px-1 " + (s.url ? "text-blue-600 hover:underline" : "text-slate-300 pointer-events-none")}
            aria-label="Open source URL"
          >
            <ExternalLink size={12} />
          </a>
          {!readOnly && (
            <button
              type="button"
              data-testid={`sources-remove-${i}`}
              onClick={() => removeRow(i)}
              className="text-red-600 hover:bg-red-50 px-1"
              aria-label="Remove source"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          data-testid="sources-add"
          onClick={addRow}
          className="text-xs text-blue-700 hover:underline mt-1"
        >
          + Add source
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 6.3: Run tests + commit**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/SourcesSection.test.tsx
git add -A
git commit -m "feat(sources): SourcesSection shared component"
```

---

## Task 7: Wire `<SourcesSection>` into every Properties panel

**Files:**
- Modify: every Properties panel listed in the File Map.

For each panel, add the section just before or after the existing Attachments section. Wire to update the corresponding entity's `sources` field via the existing update callback (e.g. `onUpdateNode`, `onUpdateConnection`, `onUpdateFlow`, `onUpdateLayer`, `onUpdateDocument`, `onUpdateSvg`, `onUpdateTab`).

- [ ] **Step 7.1: Pattern (apply to each panel)**

Inside the panel:

```tsx
import { SourcesSection } from "../../../shared/components/SourcesSection";

// inside the JSX:
<Section title="Sources">
  <SourcesSection
    sources={entity.sources ?? []}
    readOnly={readOnly}
    onChange={(next) => onUpdate?.(entity.id, { sources: next })}
  />
</Section>
```

Repeat for `NodeProperties` (uses `onUpdateNode`), `LineProperties` (uses `onUpdateConnection`), `FlowProperties` (uses `onUpdateFlow`), `LayerProperties` (uses `onUpdateLayer`), `DiagramProperties` (uses `onUpdateDiagram` for top-level — confirm or add this callback), `DocumentProperties`, `SvgProperties`, `TabProperties`.

For each `onUpdate?` prop type, widen to include `sources: SourceLink[]` in the partial.

- [ ] **Step 7.2: Tests**

For each panel, add a single test that asserts the section renders and `onChange` propagates upstream.

- [ ] **Step 7.3: Commit**

```bash
git add -A
git commit -m "feat(sources): SourcesSection wired into every Properties panel"
```

---

## Task 8: `Features.md` and test-cases

- [ ] **Step 8.1: Update Features.md**

Add a top-level "Source links" mention to the relevant entity sections (§3.1 Diagram data model, §3.13 Properties panel, §4.x Document, §X.x SVG, §11.x Tab) — one line each linking to the `SourcesSection` component.

- [ ] **Step 8.2: Add SRC-XX-NN test cases**

Distribute across the entity-type test-case files. Sample:

```markdown
- SRC-3.1-XX ❌: DiagramData top-level sources round-trip through save/load.
- SRC-3.5-XX ❌: NodeData sources round-trip through serialization.
- SRC-3.10-XX ❌: FlowDef sources round-trip.
- SRC-3.13-XX ❌: SourcesSection in NodeProperties supports add/edit/remove.
- SRC-3.13-XX ❌: SourcesSection rejects invalid URLs on blur.
- SRC-3.13-XX ❌: SourcesSection in read-only hides Add and Remove.
- SRC-4.x-XX ❌: DocumentMeta sources persisted via frontmatter round-trip.
- SRC-x.x-XX ❌: SvgMeta sources persisted via .meta.json sidecar.
- SRC-11.x-XX ❌: TabMeta sources persisted via AlphaTex \sources header (or comment fallback).
```

- [ ] **Step 8.3: Commit + PR**

```bash
git add Features.md test-cases/
git commit -m "docs(sources): Features.md + test-cases for source links MVP"
git push
gh pr create --title "feat(sources): Source Links MVP — sources field on every primary entity"
```

---

## Self-review

1. **Spec coverage** — §9 (Source links) is fully covered: data model on every entity, UX in every Properties panel, validation accepting empty list, schemes whitelisted to http(s).
2. **Read-only handling** — `SourcesSection` hides Add and Remove when `readOnly`; URL `Open` link still works.
3. **No skill enforcement here** — the spec's "mandatory at generation time" rule is a Plan 5 concern. This plan ships the data + UX so manual entry works today.
4. **Naming consistency** — `sources` everywhere. `SourceLink` everywhere. `isValidSourceUrl`, `sourceDisplayLabel` co-located in `shared/types/sources.ts`.
5. **No placeholders** — every step has runnable code or a clear grep target.
