# Guitar Tabs — Properties Panel Implementation Plan (TAB-007)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only side panel to the tab pane that surfaces the metadata `useTabEngine().metadata` already exposes — title, artist, subtitle, tempo, key, time signature, capo, tuning, tracks, sections — with the same collapse-toggle UX as the document and diagram properties panels.

**Architecture:** New `TabProperties` component renders a slide-out panel (280px expanded / 36px collapsed) read-only over the metadata. `TabView` owns `[propertiesCollapsed, setPropertiesCollapsed]` state, hydrated from `localStorage["properties-collapsed"]` (the existing key shared with document/diagram panels — tabs participate in the same user preference). The panel mounts to the right of the canvas via flexbox layout.

**Tech Stack:** TypeScript, React, Vitest. No new deps. Uses the same Tailwind tokens (`bg-surface`, `border-line`, `text-mute`) as the rest of the project.

**Spec:** [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](../specs/2026-05-02-guitar-tabs-design.md) — see the boundary sketch's `features/tab/TabProperties.tsx` line and the `TabMetadata` shape in `domain/tabEngine.ts`.
**Builds on:** TAB-005 (engine emits `"loaded"` events with `TabMetadata`; `useTabEngine` exposes `metadata`).

**Out of scope for this plan:**
- **Attachments / DocumentsSection integration.** The "[📎 Attach doc]" UI for whole-file and per-section anchors is **TAB-007a** — kept separate so the read-only metadata view can ship and get user feedback before the wiki-link mechanics land.
- **Editing.** No fields are editable. TAB-008's editor will introduce the `applyEdit` paths.
- **Multi-track UI.** TAB-007 shows track names from `metadata.tracks`, but mute/solo, per-track tuning, etc. are TAB-009.
- **Wiki-link backlinks display.** Requires `useLinkIndex` to parse `.alphatex` (TAB-011); not part of this slice.
- **H1 title-derivation pane-header behaviour** (TAB-11.2-12) — handled in a separate ticket; the title field shown here just reads `metadata.title`.

---

## File Structure

```
src/app/knowledge_base/
  features/tab/
    properties/
      TabProperties.tsx              ← NEW (panel chrome + metadata fields, read-only)
      TabProperties.test.tsx         ← NEW
    TabView.tsx                      ← MODIFIED (flex layout, owns collapse state, mounts panel)
    TabView.test.tsx                 ← MODIFIED (panel-render cases)
test-cases/11-tabs.md                ← MODIFIED (add §11.5 Properties; 8 cases)
Features.md                          ← MODIFIED (replace §11.4 Pending with §11.4 Properties + new §11.5 Pending)
docs/superpowers/handoffs/2026-05-03-guitar-tabs.md  ← MODIFIED (TAB-007 status flip + Next Action update; per the doc-update protocol)
```

The `properties/` subfolder mirrors `features/diagram/properties/` and `features/document/properties/`.

---

## Task 1: `TabProperties` component (TDD)

**Files:**
- Create: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx`
- Test: `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx`

The panel takes `metadata: TabMetadata | null`, `collapsed: boolean`, and `onToggleCollapse: () => void`. Renders nothing user-meaningful when `metadata` is null (just an "Unloaded" placeholder so the chrome doesn't jump when metadata arrives).

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TabMetadata } from "../../../domain/tabEngine";
import { TabProperties } from "./TabProperties";

function makeMetadata(overrides: Partial<TabMetadata> = {}): TabMetadata {
  return {
    title: "Intro Riff",
    artist: "Demo",
    subtitle: "Practice",
    tempo: 120,
    key: "Gmaj",
    timeSignature: { numerator: 4, denominator: 4 },
    capo: 2,
    tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
    tracks: [{ id: "0", name: "Guitar", instrument: "guitar" }],
    sections: [
      { name: "Intro", startBeat: 0 },
      { name: "Verse 1", startBeat: 1920 },
    ],
    totalBeats: 7680,
    durationSeconds: 30,
    ...overrides,
  };
}

describe("TabProperties", () => {
  it("renders the title, artist, and subtitle from metadata", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("Intro Riff")).toBeInTheDocument();
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Practice")).toBeInTheDocument();
  });

  it("renders tempo, key, time signature, capo, and tuning", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("120 BPM")).toBeInTheDocument();
    expect(screen.getByText("Gmaj")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
    expect(screen.getByText("Capo 2")).toBeInTheDocument();
    expect(screen.getByText("E2 A2 D3 G3 B3 E4")).toBeInTheDocument();
  });

  it("renders the section list with names and start beats", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("Verse 1")).toBeInTheDocument();
    // Start beat shown alongside the section name (visually small).
    expect(screen.getByText(/beat 0/i)).toBeInTheDocument();
    expect(screen.getByText(/beat 1920/i)).toBeInTheDocument();
  });

  it("renders the track names", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText("Guitar")).toBeInTheDocument();
  });

  it("hides full content and shows the collapsed chrome when collapsed=true", () => {
    render(
      <TabProperties metadata={makeMetadata()} collapsed={true} onToggleCollapse={vi.fn()} />,
    );
    // The panel is still mounted (for slide animation); just narrowed.
    expect(screen.getByTestId("tab-properties")).toBeInTheDocument();
    expect(screen.getByTestId("tab-properties")).toHaveAttribute("data-collapsed", "true");
    // Content fields should NOT be visible.
    expect(screen.queryByText("120 BPM")).not.toBeInTheDocument();
  });

  it("toggle button calls onToggleCollapse when clicked", async () => {
    const onToggleCollapse = vi.fn();
    render(
      <TabProperties metadata={makeMetadata()} collapsed={false} onToggleCollapse={onToggleCollapse} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /collapse properties|expand properties/i }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });

  it("renders a placeholder when metadata is null (pre-load state)", () => {
    render(
      <TabProperties metadata={null} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.getByText(/loading score/i)).toBeInTheDocument();
  });

  it("omits optional fields when absent (artist, subtitle, key)", () => {
    const md = makeMetadata({ artist: undefined, subtitle: undefined, key: undefined });
    render(
      <TabProperties metadata={md} collapsed={false} onToggleCollapse={vi.fn()} />,
    );
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Practice")).not.toBeInTheDocument();
    expect(screen.queryByText("Gmaj")).not.toBeInTheDocument();
    // Title still renders.
    expect(screen.getByText("Intro Riff")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npm run test:run -- TabProperties`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/app/knowledge_base/features/tab/properties/TabProperties.tsx`:

```tsx
"use client";

import type { ReactElement } from "react";
import type { TabMetadata } from "../../../domain/tabEngine";

export interface TabPropertiesProps {
  metadata: TabMetadata | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/**
 * Read-only side panel for an open tab — surfaces the metadata
 * `useTabEngine().metadata` already emits via the engine's "loaded"
 * event. No editing in TAB-007. Attachments + section-level docs land
 * in TAB-007a (`DocumentsSection` reuse + wiki-link backlinks).
 *
 * Layout: 280px expanded, 36px collapsed (icon-only chrome). Always
 * mounted so the slide transition animates instead of unmounting.
 */
export function TabProperties(props: TabPropertiesProps): ReactElement {
  const { metadata, collapsed, onToggleCollapse } = props;
  const widthClass = collapsed ? "w-9" : "w-72";
  return (
    <aside
      data-testid="tab-properties"
      data-collapsed={collapsed ? "true" : "false"}
      className={`flex h-full flex-col border-l border-line bg-surface text-sm transition-[width] duration-200 ${widthClass}`}
    >
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        {!collapsed && <span className="text-xs font-medium text-mute">Properties</span>}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand properties" : "Collapse properties"}
          className="rounded px-1 hover:bg-line/20"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {!collapsed && (
        <div className="flex-1 overflow-auto px-3 py-2 space-y-4">
          {metadata === null ? (
            <p className="text-mute">Loading score…</p>
          ) : (
            <>
              <Header metadata={metadata} />
              <General metadata={metadata} />
              <Tuning metadata={metadata} />
              <Tracks metadata={metadata} />
              <Sections metadata={metadata} />
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Header({ metadata }: { metadata: TabMetadata }): ReactElement {
  return (
    <section>
      <h2 className="text-base font-semibold">{metadata.title}</h2>
      {metadata.artist && <p className="text-mute">{metadata.artist}</p>}
      {metadata.subtitle && <p className="text-xs text-mute">{metadata.subtitle}</p>}
    </section>
  );
}

function General({ metadata }: { metadata: TabMetadata }): ReactElement {
  const ts = `${metadata.timeSignature.numerator}/${metadata.timeSignature.denominator}`;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">General</h3>
      <dl className="space-y-1">
        <Row label="Tempo">{`${metadata.tempo} BPM`}</Row>
        {metadata.key && <Row label="Key">{metadata.key}</Row>}
        <Row label="Time">{ts}</Row>
        <Row label="Capo">{`Capo ${metadata.capo}`}</Row>
      </dl>
    </section>
  );
}

function Tuning({ metadata }: { metadata: TabMetadata }): ReactElement | null {
  if (metadata.tuning.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">Tuning</h3>
      <p className="font-mono text-xs">{metadata.tuning.join(" ")}</p>
    </section>
  );
}

function Tracks({ metadata }: { metadata: TabMetadata }): ReactElement | null {
  if (metadata.tracks.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Tracks ({metadata.tracks.length})
      </h3>
      <ul className="space-y-1">
        {metadata.tracks.map((track) => (
          <li key={track.id} className="rounded border border-line/50 px-2 py-1">
            <span>{track.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sections({ metadata }: { metadata: TabMetadata }): ReactElement | null {
  if (metadata.sections.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Sections ({metadata.sections.length})
      </h3>
      <ul className="space-y-1">
        {metadata.sections.map((section) => (
          <li key={section.name} className="flex items-center justify-between rounded border border-line/50 px-2 py-1">
            <span>{section.name}</span>
            <span className="text-xs text-mute">beat {section.startBeat}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="text-xs">{children}</dd>
    </div>
  );
}
```

- [ ] **Step 4: Iterate until 8/8 pass**

Run: `npm run test:run -- TabProperties`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/properties/TabProperties.tsx \
        src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
git commit -m "feat(tabs): add TabProperties read-only panel (TAB-007)"
```

---

## Task 2: Wire `TabProperties` into `TabView` (split layout + collapse state)

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.test.tsx`

`TabView` currently renders the canvas full-width. After this task it renders a flex-row: canvas (flex-1) + `TabProperties` (fixed width per collapsed state). The collapse state lives in `useState` hydrated from `localStorage["properties-collapsed"]` — same key the document and diagram views already use, so toggling on one pane carries over.

- [ ] **Step 1: Add failing tests**

Append these cases to `TabView.test.tsx` inside the existing `describe("TabView", () => { ... })`:

```ts
it("mounts the properties panel alongside the canvas when status is 'ready'", async () => {
  mockStatus = "ready";
  mockMetadata = { title: "hi" } as never;
  render(
    <Wrap>
      <TabView filePath="x.alphatex" />
    </Wrap>,
  );
  expect(screen.getByTestId("tab-properties")).toBeInTheDocument();
});

it("does not mount the properties panel in engine-load-error state", async () => {
  mockStatus = "engine-load-error";
  mockError = new Error("chunk failed");
  render(
    <Wrap>
      <TabView filePath="x.alphatex" />
    </Wrap>,
  );
  expect(screen.queryByTestId("tab-properties")).not.toBeInTheDocument();
});

it("hydrates the collapsed state from localStorage on mount", async () => {
  localStorage.setItem("properties-collapsed", "true");
  mockStatus = "ready";
  mockMetadata = { title: "hi" } as never;
  render(
    <Wrap>
      <TabView filePath="x.alphatex" />
    </Wrap>,
  );
  expect(screen.getByTestId("tab-properties")).toHaveAttribute("data-collapsed", "true");
  localStorage.removeItem("properties-collapsed");
});
```

(The third test relies on JSDOM's `localStorage` polyfill — already provided by the project's `src/test/setup.ts`.)

- [ ] **Step 2: Confirm fail**

Run: `npm run test:run -- TabView`
Expected: 3 new failures (panel testid not found in any state).

- [ ] **Step 3: Update `TabView.tsx`**

Read the current `TabView.tsx` first to anchor the edit. Then:

(a) Add the import alongside the existing tab-feature imports:

```tsx
import { TabProperties } from "./properties/TabProperties";
```

(b) Add the `react` imports as needed — the file already imports `useEffect`, `useRef`. Add `useCallback, useState`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
```

(c) Inside the component body, after the existing `useTabPlayback(...)` call, add the collapse-state state + toggle:

```tsx
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("properties-collapsed") === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("properties-collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Get metadata from the engine (already exposed; nothing new to surface).
  const { metadata } = useTabEngine();
```

Wait — `metadata` is already destructured from `useTabEngine`. Find the existing destructure (`const { status, error: engineError, mountInto } = useTabEngine();`) and add `metadata` to it:

```tsx
  const { status, error: engineError, mountInto, metadata } = useTabEngine();
```

(Don't double-call `useTabEngine()` — that violates Rules of Hooks and creates two engine instances.)

(d) Update the main return tree. The current structure:

```tsx
return (
  <div className="relative flex h-full w-full flex-col">
    {status === "mounting" && (...)}
    <TabCanvas ref={canvasRef} />
  </div>
);
```

Change to a flex-row that stacks canvas + properties side by side:

```tsx
return (
  <div className="flex h-full w-full">
    <div className="relative flex flex-1 flex-col">
      <TabToolbar
        playerStatus={playback.playerStatus}
        isAudioReady={isAudioReady}
        audioBlocked={playback.audioBlocked}
        onToggle={playback.toggle}
        onStop={playback.stop}
        onSetTempoFactor={playback.setTempoFactor}
        onSetLoop={playback.setLoop}
      />
      {status === "mounting" && (
        <div
          data-testid="tab-view-loading"
          className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 text-mute"
        >
          Loading score…
        </div>
      )}
      <TabCanvas ref={canvasRef} />
    </div>
    <TabProperties
      metadata={metadata}
      collapsed={propertiesCollapsed}
      onToggleCollapse={toggleProperties}
    />
  </div>
);
```

The toolbar moves INSIDE the canvas-side flex column (it was at the top before; structure is the same just nested one level so the properties panel sits to the right of toolbar+canvas).

(e) The `engine-load-error` early return is unchanged — no toolbar, no properties panel, just the inline error message. The tests assert that.

- [ ] **Step 4: Run TabView tests, iterate until green**

Run: `npm run test:run -- TabView`
Expected: 11/11 PASS (8 original + 3 new).

If `useTabEngine` mock at the top of the test file now needs to surface `metadata`, update the inline mock object to include it:

```ts
vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockStatus,
    metadata: mockMetadata,
    error: mockError,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: true,
    session: null,
    mountInto: mountIntoMock,
  }),
}));
```

(`metadata` already exists in the mock per TAB-005's wiring — verify and don't duplicate.)

- [ ] **Step 5: Run full suite + lint**

Run in parallel:
- `npm run typecheck` → 0 errors
- `npm run test:run` → all pass (TabView 11/11, full suite green)
- `npm run lint` → 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/tab/TabView.tsx \
        src/app/knowledge_base/features/tab/TabView.test.tsx
git commit -m "feat(tabs): mount TabProperties beside canvas with collapse persistence (TAB-007)"
```

---

## Task 3: Update `test-cases/11-tabs.md` and `Features.md` + handoff doc

**Files:**
- Modify: `test-cases/11-tabs.md`
- Modify: `Features.md`
- Modify: `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md` (per the doc-update protocol)

### 1. Add §11.5 Properties to test-cases/11-tabs.md

Insert AFTER the existing §11.4 .gp import section. Use these 8 cases:

```markdown
## 11.5 Properties panel (TAB-007)

Read-only side panel surfacing `useTabEngine().metadata` (title, artist, tempo, key, time signature, capo, tuning, tracks, sections). Slide-out chrome with collapse-state persisted to `localStorage["properties-collapsed"]` (shared with document + diagram panels). Shipped 2026-05-03.

- **TAB-11.5-01** ✅ **`TabProperties` renders title, artist, subtitle from metadata** — top-of-panel header. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-02** ✅ **General fields rendered: tempo / key / time signature / capo** — `120 BPM`, `Gmaj`, `4/4`, `Capo 2`. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-03** ✅ **Tuning rendered as scientific-pitch low-to-high** — `E2 A2 D3 G3 B3 E4`. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-04** ✅ **Track names rendered with track count in the header** — single-track or multi-track readout. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-05** ✅ **Section list shows name + start beat** — kebab-case section IDs are computed for TAB-007a but not displayed. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-06** ✅ **Optional fields (artist / subtitle / key) omitted when absent** — _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-07** ✅ **Collapse toggle: data-collapsed attribute flips and content hides** — chrome stays mounted for slide animation. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-08** ✅ **`TabView` mounts panel beside canvas in 'ready' state; absent in 'engine-load-error'; collapse hydrates from localStorage** — three integration cases. _(unit: TabView.test.tsx.)_
```

### 2. Update Features.md §11

Replace the existing `### 11.4 Pending` block with:

```markdown
### 11.4 Properties panel (TAB-007)
- ✅ **`TabProperties`** (`src/app/knowledge_base/features/tab/properties/TabProperties.tsx`) — read-only side panel, 280px expanded / 36px collapsed; reads from `useTabEngine().metadata`. Renders title / artist / subtitle / tempo / key / time signature / capo / tuning / tracks / sections.
- ⚙️ **Collapse persistence** — `localStorage["properties-collapsed"]` shared with document + diagram panels so toggling state crosses pane types.
- ⚙️ **`TabView` flex layout** — canvas (flex-1) + properties panel (fixed) — toolbar moves into the canvas column.

### 11.5 Pending
- ? **Tab attachments** (whole-file + section anchors via `DocumentsSection`; wiki-link parsing of the `// references:` block) — TAB-007a.
- ? **Vault search** (titles / artist / key / tuning indexed) — TAB-011.
- ? **Mobile gating** (read-only + playback only) — TAB-012.
- ? **Editor (M2)** — TAB-008+.
```

### 3. Update the handoff doc

Per the **Doc-update protocol** at the top of `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`, after this PR merges:

- Bump **Last updated** date.
- Flip TAB-007 in the **Where we are** table to ✅ Merged with the PR number.
- Remove TAB-007 from the **Remaining tickets** M1 table.
- Add `TabProperties.tsx` to the **Reference architecture** map.
- Replace the **Next Action** body with TAB-007a (cross-references) — spec section "Inbound: doc attachments to tab entities" + the entity-type table.

This handoff update is best done in a follow-up doc commit BEFORE starting TAB-007a, OR folded into TAB-007a's branch (per the protocol). For TAB-007's PR, it's enough to just keep the doc accurate to "TAB-007 in-flight on this branch" — which it already is from the post-#102 update.

### 4. Verify

```bash
grep -c '^- \*\*TAB-' test-cases/11-tabs.md   # was 54, expect 62 (+8)
grep -n '^### 11\.' Features.md                # expect §11.1, §11.2, §11.3, §11.4 (Properties), §11.5 (Pending)
npm run test:run                                # full suite passes
```

### 5. Commit

```bash
git add test-cases/11-tabs.md Features.md
git commit -m "docs: register TAB-007 properties panel in test-cases + Features.md"
```

---

## Wrap-up

After Task 3 lands:
- Opening any `.alphatex` shows the score with toolbar above and a 280px properties panel to the right.
- Title / artist / tempo / key / time signature / capo / tuning / tracks / sections all visible.
- Collapse arrow narrows the panel to 36px (icon only); the state persists in localStorage and is shared with document + diagram panels.
- No editing UI yet (TAB-008); no attachments UI yet (TAB-007a); no wiki-link backlinks yet (TAB-011).

**Branch:** `plan/guitar-tabs-properties-panel`. Per `feedback_no_worktrees.md`: don't push, don't worktree. Per `project_branch_protection.md`: open a PR via `gh pr create` when ready.

**Next plan after this ships:** TAB-007a — DocumentsSection integration for whole-file + section attachments + wiki-link parsing.

---

_End of TAB-007 plan._
