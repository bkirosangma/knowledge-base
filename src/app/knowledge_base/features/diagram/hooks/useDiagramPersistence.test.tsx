import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { useDiagramPersistence } from "./useDiagramPersistence";
import { StubShellErrorProvider } from "../../../shell/ShellErrorContext";
import type { LayerDef, NodeData, Connection, FlowDef, LineCurveAlgorithm } from "../types";

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
