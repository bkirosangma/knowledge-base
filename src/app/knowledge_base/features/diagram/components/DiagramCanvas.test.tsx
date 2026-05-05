import React, { useRef, act } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiagramCanvas from "./DiagramCanvas";
import {
  DiagramInteractionProvider,
  useLockedFlow,
} from "../state/DiagramInteractionContext";

// Covers DIAG-11-01, DIAG-11-02: canvas-empty mousedown deselect guard.

/**
 * Minimal props for DiagramCanvas. We pass activeFile=null so the
 * component renders only the "No file open" empty state — this avoids
 * mounting the full node/line sub-tree while still exercising the
 * onMouseDown handler on the canvas root.
 */
function makeProps(
  overrides: Partial<React.ComponentProps<typeof DiagramCanvas>> = {},
): React.ComponentProps<typeof DiagramCanvas> {
  return {
    canvasRef: { current: null },
    activeFile: null,
    patches: [],
    world: { x: 0, y: 0, w: 800, h: 600 },
    zoom: 1,
    isZooming: false,
    zoomRef: { current: 1 },
    worldRef: { current: { x: 0, y: 0, w: 800, h: 600 } },
    layerDefs: [],
    regions: [],
    displayNodes: [],
    connections: [],
    flows: [],
    lineCurve: "bezier",
    lines: [],
    sortedLines: [],
    ghostLine: null,
    draggingId: null,
    draggingLayerId: null,
    draggingLayerIds: [],
    layerDragDelta: null,
    layerDragRawDelta: null,
    resizingLayer: null,
    isMultiDrag: false,
    multiDragIds: [],
    multiDragDelta: null,
    multiDragRawDelta: null,
    elementDragPos: null,
    elementDragRawPos: null,
    draggingEndpoint: null,
    creatingLine: null,
    selection: { type: "flow", id: "f1" }, // so the existing condition would fire
    selectionRect: null,
    hoveredNodeId: null,
    hoveredLine: null,
    setHoveredLine: vi.fn(),
    setSelection: vi.fn(),
    setContextMenu: vi.fn(),
    setEditingLabel: vi.fn(),
    setEditingLabelValue: vi.fn(),
    editingLabelBeforeRef: { current: "" },
    editingLabel: null,
    editingLabelValue: "",
    readOnly: false,
    isLive: false,
    showLabels: true,
    flowDimSets: null,
    typeDimSets: null,
    flowOrderData: null,
    toCanvasCoords: (x, y) => ({ x, y }),
    setNodes: vi.fn(),
    setConnections: vi.fn(),
    setLayerDefs: vi.fn(),
    scheduleRecord: vi.fn(),
    pendingSelection: { current: null },
    layerShiftsRef: { current: {} },
    labelDragStartT: { current: null },
    handleSelectionRectStart: vi.fn(),
    handleLayerDragStart: vi.fn(),
    handleLayerResizeStart: vi.fn(),
    handleCanvasMouseDown: vi.fn(),
    handleSegmentDragStart: vi.fn(),
    handleLineClick: vi.fn(),
    startEdgeHandleDrag: vi.fn(),
    handleAnchorDragStart: vi.fn(),
    handleAnchorHover: vi.fn(),
    handleAnchorHoverEnd: vi.fn(),
    handleElementResize: vi.fn(),
    handleNodeMouseEnter: vi.fn(),
    handleNodeMouseLeave: vi.fn(),
    handleNodeDoubleClick: vi.fn(),
    handleNodeDragStart: vi.fn(),
    handleRotationDragStart: vi.fn(),
    commitLabel: vi.fn(),
    hasDocuments: vi.fn(() => false),
    getDocumentsForEntity: vi.fn(() => []),
    onOpenDocument: vi.fn(),
    getNodeDimensions: vi.fn(() => ({ w: 120, h: 60 })),
    nodes: [],
    previewDocPath: null,
    ...overrides,
  };
}

/** Helper that locks a flow via context after mount. */
function LockHelper({ flowId }: { flowId: string }) {
  const { setLockedFlowId } = useLockedFlow();
  React.useEffect(() => {
    setLockedFlowId(flowId);
  }, [flowId, setLockedFlowId]);
  return null;
}

describe("DiagramCanvas — onMouseDown deselect guard", () => {
  it("DIAG-11-01: calls setSelection(null) on canvas click when NOT locked", () => {
    const setSelection = vi.fn();
    render(
      <DiagramInteractionProvider>
        <DiagramCanvas {...makeProps({ setSelection })} />
      </DiagramInteractionProvider>,
    );
    const canvas = screen.getByTestId("diagram-canvas-root");
    fireEvent.mouseDown(canvas, { button: 0 });
    expect(setSelection).toHaveBeenCalledWith(null);
  });

  it("DIAG-11-02: does NOT call setSelection when a flow is locked", async () => {
    const setSelection = vi.fn();
    render(
      <DiagramInteractionProvider>
        <LockHelper flowId="flow-x" />
        <DiagramCanvas {...makeProps({ setSelection })} />
      </DiagramInteractionProvider>,
    );
    // Wait for the LockHelper effect to fire.
    await act(async () => {});
    const canvas = screen.getByTestId("diagram-canvas-root");
    fireEvent.mouseDown(canvas, { button: 0 });
    expect(setSelection).not.toHaveBeenCalled();
  });
});
