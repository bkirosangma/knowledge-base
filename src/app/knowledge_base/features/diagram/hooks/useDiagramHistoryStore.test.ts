// src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock history persistence so tests don't hit real FS APIs.
vi.mock("../../../shared/utils/historyPersistence", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../shared/utils/historyPersistence")>();
  return {
    ...real,
    readHistoryFile: vi.fn().mockResolvedValue(null),
    writeHistoryFile: vi.fn(),
  };
});

import { useDiagramHistoryStore } from "./useDiagramHistoryStore";
import type { AttachmentLink } from "../../../domain/attachmentLinks";
import type { DiagramDoc, DiagramDocDispatch } from "./useDiagramDocument";
import type { Selection } from "../types";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Minimal stub helpers ────────────────────────────────────────────────────

function makeDoc(overrides: Partial<DiagramDoc> = {}): DiagramDoc {
  return {
    title: "Test",
    layers: [],
    nodes: [],
    connections: [],
    lineCurve: "bezier",
    flows: [],
    sources: [],
    ...overrides,
  };
}

function makeDispatch(): DiagramDocDispatch {
  return {
    loadDoc: vi.fn(),
    setTitle: vi.fn(),
    setLayers: vi.fn(),
    setNodes: vi.fn(),
    setConnections: vi.fn(),
    setLineCurve: vi.fn(),
    setFlows: vi.fn(),
    setSources: vi.fn(),
  };
}

// ─── Cross-diagram safety test ───────────────────────────────────────────────

describe("useDiagramHistoryStore — attachmentSubset snapshot isolation", () => {
  it("DIAG-3.10-45: diagram-undo only affects this diagram's attachment subset, not tab-scoped or other-diagram rows", async () => {
    // Rows representing three distinct concerns:
    //  - n1: a node attachment for diagram A (the diagram under test)
    //  - tab-track: a workspace-scoped tab track row (must be untouched by diagram undo)
    //  - nB: a node attachment that belongs to some other diagram B loaded earlier
    const rowN1: AttachmentLink = { docPath: "auth.md", entityType: "node", entityId: "n1" };
    const rowTabTrack: AttachmentLink = { docPath: "tab.md", entityType: "tab-track", entityId: "t.alpha#track:u" };
    const rowNB: AttachmentLink = { docPath: "other.md", entityType: "node", entityId: "nB" };

    // Starting state: n1 is attached. Tab-track and nB are unrelated.
    let rows: AttachmentLink[] = [rowN1, rowTabTrack, rowNB];
    const setRows = vi.fn((updater: AttachmentLink[] | ((prev: AttachmentLink[]) => AttachmentLink[])) => {
      rows = typeof updater === "function" ? updater(rows) : updater;
    });

    // Doc has node n1 — so n1 is in this diagram's entity ids.
    // Cast to avoid supplying the full NodeData shape (icon ComponentType, etc.) in the test.
    // Only `id` is needed for the entity-id set used by DIAGRAM_ENTITY_TYPES filtering.
    const doc = makeDoc({ nodes: [{ id: "n1" } as never] });
    const dispatch = makeDispatch();
    const setLayerManualSizes = vi.fn();
    const setMeasuredSizes = vi.fn();
    const setPatches = vi.fn();
    const setSelection = vi.fn<(s: Selection | null) => void>();
    const setLoadSnapshot = vi.fn();

    const { result, rerender } = renderHook(() => {
      return useDiagramHistoryStore({
        doc,
        dispatch,
        layerManualSizes: {},
        setLayerManualSizes,
        setMeasuredSizes,
        setPatches,
        setSelection,
        rows,
        setRows,
        setLoadSnapshot,
      });
    });

    // Step 1: Initialise history with n1 ALREADY attached in the init snapshot.
    // This represents: "File loaded with n1 attachment present."
    await act(async () => {
      await result.current.history.initHistory(
        JSON.stringify({ title: "Test", nodes: [], connections: [], flows: [] }),
        {
          title: "Test", layerDefs: [], nodes: [{ id: "n1" } as never], connections: [],
          layerManualSizes: {}, lineCurve: "bezier", flows: [],
          attachmentSubset: [rowN1],
        },
        null,
        null,
      );
    });

    // Step 2: User detaches n1 — rows loses rowN1.
    rows = [rowTabTrack, rowNB];

    // Step 3: Schedule a record capturing the post-detach state (attachmentSubset=[]).
    act(() => {
      result.current.scheduleRecord("Detach document from node");
    });

    // Flush the pending-record effect (dependency-less useEffect fires on next render).
    act(() => { rerender(); });

    // History should have 2 entries: "File loaded" + "Detach document from node".
    expect(result.current.history.entries).toHaveLength(2);
    const detachEntry = result.current.history.entries[1];

    // Post-detach snapshot captures an empty subset for this diagram (n1 gone).
    expect(detachEntry.snapshot.attachmentSubset).toEqual([]);
    // Tab-track and nB rows are NOT in the snapshot either way.
    expect(detachEntry.snapshot.attachmentSubset?.find((r) => r.entityType === "tab-track")).toBeUndefined();
    expect(detachEntry.snapshot.attachmentSubset?.find((r) => r.entityId === "nB")).toBeUndefined();

    // Step 4: Undo — should restore n1 from the init snapshot's attachmentSubset.
    // The undo target is entry[0] which has attachmentSubset=[rowN1].
    // rows is currently [rowTabTrack, rowNB].
    setRows.mockClear();

    act(() => {
      result.current.handleUndo();
    });

    // setRows must have been called via replaceSubset.
    expect(setRows).toHaveBeenCalled();

    // Invariant: after undo, n1 is restored; tab-track and nB remain untouched.
    expect(rows.find((r) => r.entityId === "n1")).toBeDefined();
    expect(rows.find((r) => r.entityType === "tab-track")).toBeDefined();
    expect(rows.find((r) => r.entityId === "nB")).toBeDefined();
  });
});

// ─── Top-level sources history wiring ────────────────────────────────────────

describe("useDiagramHistoryStore — top-level sources history", () => {
  it("DIAG-3.19-23: top-level diagram `sources` are captured in history snapshots and restored on undo", async () => {
    const s1 = { url: "https://example.com/a", title: "A" };
    const s2 = { url: "https://example.com/b", title: "B" };

    let doc = makeDoc({ sources: [s1] });
    const dispatch = makeDispatch();
    const setRows = vi.fn();
    const setLayerManualSizes = vi.fn();
    const setMeasuredSizes = vi.fn();
    const setPatches = vi.fn();
    const setSelection = vi.fn<(s: Selection | null) => void>();
    const setLoadSnapshot = vi.fn();

    const { result, rerender } = renderHook(() =>
      useDiagramHistoryStore({
        doc,
        dispatch,
        layerManualSizes: {},
        setLayerManualSizes,
        setMeasuredSizes,
        setPatches,
        setSelection,
        rows: [],
        setRows,
        setLoadSnapshot,
      }),
    );

    // Step 1: Initialise history at the single-source state.
    await act(async () => {
      await result.current.history.initHistory(
        JSON.stringify({ title: "Test", nodes: [], connections: [], flows: [], sources: [s1] }),
        {
          title: "Test", layerDefs: [], nodes: [], connections: [],
          layerManualSizes: {}, lineCurve: "bezier", flows: [],
          sources: [s1],
          attachmentSubset: [],
        },
        null,
        null,
      );
    });

    // Step 2: User adds s2 — `doc.sources` updates to [s1, s2].
    doc = makeDoc({ sources: [s1, s2] });
    rerender();

    // Step 3: Schedule a record capturing the post-add state.
    act(() => {
      result.current.scheduleRecord("Add source link");
    });

    // Flush the pending-record effect.
    act(() => { rerender(); });

    // History should have 2 entries: init + Add.
    expect(result.current.history.entries).toHaveLength(2);
    const addEntry = result.current.history.entries[1];

    // The snapshot captures both sources.
    expect(addEntry.snapshot.sources).toEqual([s1, s2]);

    // Step 4: Undo — should restore the single-source state via dispatch.loadDoc.
    (dispatch.loadDoc as ReturnType<typeof vi.fn>).mockClear();
    act(() => {
      result.current.handleUndo();
    });

    expect(dispatch.loadDoc).toHaveBeenCalledTimes(1);
    const restored = (dispatch.loadDoc as ReturnType<typeof vi.fn>).mock.calls[0][0] as { sources?: typeof addEntry.snapshot.sources };
    expect(restored.sources).toEqual([s1]);
  });
});
