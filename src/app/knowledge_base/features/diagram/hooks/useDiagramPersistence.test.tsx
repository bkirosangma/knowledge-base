import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock saveDraft so we can assert it fires with the latest sources without
// needing real localStorage.
vi.mock("../../../shared/utils/persistence", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../shared/utils/persistence")>();
  return { ...real, saveDraft: vi.fn() };
});

import { useDiagramPersistence } from "./useDiagramPersistence";
import { saveDraft } from "../../../shared/utils/persistence";
import { StubShellErrorProvider } from "../../../shell/ShellErrorContext";
import type { LayerDef, NodeData, Connection, FlowDef, LineCurveAlgorithm } from "../types";
import type { SourceLink } from "../../../shared/types/sources";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      {children}
    </StubShellErrorProvider>
  );
}

interface Args {
  title: string;
  layerDefs: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
  sources?: SourceLink[];
  activeFile: string | null;
}

function callHook(initial: Args) {
  return renderHook(
    (a: Args) =>
      useDiagramPersistence(
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        a.title,
        a.layerDefs,
        a.nodes,
        a.connections,
        a.layerManualSizes,
        a.lineCurve,
        a.flows,
        a.sources ?? [],
        a.activeFile,
      ),
    { wrapper, initialProps: initial },
  );
}

describe("useDiagramPersistence — workspace attachments do not mark diagram dirty", () => {
  // Regression: opening a diagram with a non-empty workspace attachment list
  // (`.kb/attachment-links.json`) immediately marked the diagram dirty.
  // Attachments live at the workspace level now; they are not part of the
  // diagram document and must not feed the diagram's dirty fingerprint.
  it("stays clean after a load that updates diagram state", () => {
    const before: Args = {
      title: "Untitled",
      layerDefs: [],
      nodes: [],
      connections: [],
      layerManualSizes: {},
      lineCurve: "orthogonal",
      flows: [],
      activeFile: "diagram.json",
    };

    const { result, rerender } = callHook(before);

    // Simulate file load: applyDiagramToState dispatches state changes AND
    // calls setLoadSnapshot with the loaded data. In production these are
    // batched into one render; we model that by calling setLoadSnapshot then
    // rerendering with the loaded state.
    const loadedTitle = "Roadmap";
    const loadedLayers: LayerDef[] = [
      { id: "ly-1", title: "L1", bg: "#fff", border: "#000" },
    ];

    act(() => {
      result.current.setLoadSnapshot(
        loadedTitle,
        loadedLayers,
        [],
        [],
        {},
        "bezier",
        [],
      );
    });

    rerender({
      ...before,
      title: loadedTitle,
      layerDefs: loadedLayers,
      lineCurve: "bezier",
    });

    expect(result.current.isDirty).toBe(false);
  });
});

describe("useDiagramPersistence — top-level sources are persisted on debounced autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("DIAG-3.19-23: editing top-level `sources` writes a draft with the new sources after the 500 ms debounce", () => {
    const s1: SourceLink = { url: "https://example.com/a", title: "A" };
    const s2: SourceLink = { url: "https://example.com/b", title: "B" };

    const before: Args = {
      title: "Roadmap",
      layerDefs: [],
      nodes: [],
      connections: [],
      layerManualSizes: {},
      lineCurve: "orthogonal",
      flows: [],
      sources: [s1],
      activeFile: "diagram.json",
    };

    const { result, rerender } = callHook(before);

    act(() => {
      result.current.setLoadSnapshot(
        before.title,
        before.layerDefs,
        before.nodes,
        before.connections,
        before.layerManualSizes,
        before.lineCurve,
        before.flows,
        before.sources,
      );
    });
    rerender(before);

    (saveDraft as ReturnType<typeof vi.fn>).mockClear();

    // Edit: add s2 to sources.
    rerender({ ...before, sources: [s1, s2] });

    // Debounce hasn't fired yet — saveDraft should not have been called.
    expect(saveDraft).not.toHaveBeenCalled();

    // Flush the 500 ms debounce.
    act(() => { vi.advanceTimersByTime(500); });

    expect(saveDraft).toHaveBeenCalledTimes(1);
    const lastCall = (saveDraft as ReturnType<typeof vi.fn>).mock.calls[0];
    // saveDraft signature: (fileName, title, layers, nodes, connections,
    // layerManualSizes, lineCurve, flows, sources). sources is at index 8.
    expect(lastCall[0]).toBe("diagram.json");
    expect(lastCall[8]).toEqual([s1, s2]);
  });
});

describe("useDiagramPersistence — top-level sources participate in dirty fingerprint", () => {
  it("DIAG-3.19-23: editing top-level `sources` flips the dirty bit", () => {
    const s1: SourceLink = { url: "https://example.com/a", title: "A" };
    const s2: SourceLink = { url: "https://example.com/b", title: "B" };

    const before: Args = {
      title: "Roadmap",
      layerDefs: [],
      nodes: [],
      connections: [],
      layerManualSizes: {},
      lineCurve: "orthogonal",
      flows: [],
      sources: [s1],
      activeFile: "diagram.json",
    };

    const { result, rerender } = callHook(before);

    // File-load semantics: setLoadSnapshot pins the on-disk fingerprint at
    // sources=[s1].
    act(() => {
      result.current.setLoadSnapshot(
        before.title,
        before.layerDefs,
        before.nodes,
        before.connections,
        before.layerManualSizes,
        before.lineCurve,
        before.flows,
        before.sources,
      );
    });

    rerender(before);
    expect(result.current.isDirty).toBe(false);

    // User adds s2 — fingerprint must diverge from the on-disk snapshot.
    rerender({ ...before, sources: [s1, s2] });
    expect(result.current.isDirty).toBe(true);

    // User reverts to [s1] — fingerprint matches snapshot again, so clean.
    rerender({ ...before, sources: [s1] });
    expect(result.current.isDirty).toBe(false);
  });
});
