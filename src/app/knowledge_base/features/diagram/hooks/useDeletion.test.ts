import { renderHook, act } from "@testing-library/react";
import { useRef } from "react";
import { describe, it, expect, vi } from "vitest";
import { useDeletion } from "./useDeletion";
import type { NodeData, Connection, FlowDef, LayerDef } from "../types";
import type { AttachmentLink } from "../../../domain/attachmentLinks";

// ─── Minimal stub factories ───────────────────────────────────────────────────

function node(id: string, layer = "layer-1"): NodeData {
  return {
    id, label: id, layer, x: 0, y: 0, w: 120,
    icon: (() => null) as never,
  };
}

function conn(id: string, from: string, to: string): Connection {
  return {
    id, from, to,
    fromAnchor: "right-0", toAnchor: "left-0",
    color: "#000", label: "",
  };
}

function flow(id: string, connectionIds: string[]): FlowDef {
  return { id, name: id, connectionIds };
}

function row(entityType: AttachmentLink["entityType"], entityId: string): AttachmentLink {
  return { entityType, entityId, docPath: `${entityId}.md` };
}

// ─── Shared harness ──────────────────────────────────────────────────────────

interface HarnessOpts {
  nodes?: NodeData[];
  connections?: Connection[];
  flows?: FlowDef[];
}

function setup(opts: HarnessOpts = {}) {
  const detachAttachmentsFor = vi.fn(() => ({ detached: 0 }));
  const withBatch = vi.fn(async (fn: () => unknown) => fn()) as never;

  const setNodes = vi.fn();
  const setConnections = vi.fn();
  const setLayerDefs = vi.fn();
  const setLayerManualSizes = vi.fn();
  const setMeasuredSizes = vi.fn();
  const setSelection = vi.fn();
  const setFlows = vi.fn();
  const onActionComplete = vi.fn();

  const initialNodes = opts.nodes ?? [];
  const initialConnections = opts.connections ?? [];
  const initialFlows = opts.flows ?? [];

  const { result } = renderHook(() => {
    const nodesRef = useRef<NodeData[]>(initialNodes);
    const connectionsRef = useRef<Connection[]>(initialConnections);
    const flowsRef = useRef<FlowDef[]>(initialFlows);
    return useDeletion(
      nodesRef, connectionsRef, flowsRef,
      {
        setNodes, setConnections, setLayerDefs, setLayerManualSizes,
        setMeasuredSizes, setSelection, setFlows,
        detachAttachmentsFor, withBatch,
      },
      onActionComplete,
    );
  });

  return {
    result,
    detachAttachmentsFor,
    withBatch,
    setNodes, setConnections, setLayerDefs, setLayerManualSizes,
    setMeasuredSizes, setSelection, setFlows, onActionComplete,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("useDeletion cleanup integration", () => {
  it("DIAG-3.10-46: deletes node + detaches attachment rows for that node", async () => {
    const { result, detachAttachmentsFor } = setup({
      nodes: [node("n1"), node("n2")],
      connections: [],
    });

    await act(async () => {
      result.current.deleteSelection({ type: "node", id: "n1" });
    });

    // detachAttachmentsFor called exactly once
    expect(detachAttachmentsFor).toHaveBeenCalledTimes(1);

    const matcher = (detachAttachmentsFor.mock.calls as unknown as [[(r: AttachmentLink) => boolean]])[0][0];

    // Matches the deleted node
    expect(matcher(row("node", "n1"))).toBe(true);
    // Does NOT match an unrelated node
    expect(matcher(row("node", "n2"))).toBe(false);
    // Does NOT match tab rows
    expect(matcher(row("tab-track", "n1"))).toBe(false);
    expect(matcher(row("tab-section", "n1"))).toBe(false);
  });

  it("DIAG-3.10-47: cascading delete includes connections referencing the node", async () => {
    const { result, detachAttachmentsFor } = setup({
      nodes: [node("n1"), node("n2")],
      connections: [conn("c1", "n1", "n2"), conn("c2", "n2", "n2")],
    });

    await act(async () => {
      result.current.deleteSelection({ type: "node", id: "n1" });
    });

    expect(detachAttachmentsFor).toHaveBeenCalledTimes(1);

    const matcher = (detachAttachmentsFor.mock.calls as unknown as [[(r: AttachmentLink) => boolean]])[0][0];

    // Matches the deleted node
    expect(matcher(row("node", "n1"))).toBe(true);
    // Matches the cascading connection (n1 → n2)
    expect(matcher(row("connection", "c1"))).toBe(true);
    // Does NOT match a connection not touching n1
    expect(matcher(row("connection", "c2"))).toBe(false);
    // Does NOT match n2 (not deleted)
    expect(matcher(row("node", "n2"))).toBe(false);
  });

  it("DIAG-3.10-48: confirmDeletion path detaches broken-flow rows", async () => {
    // Setup: a 3-connection flow c1→c2→c3. Deleting the middle connection c2
    // leaves c1 and c3 non-contiguous → findBrokenFlows marks f1 broken.
    const connections = [conn("c1", "A", "B"), conn("c2", "B", "C"), conn("c3", "C", "D")];
    const flows = [flow("f1", ["c1", "c2", "c3"])];

    const { result, detachAttachmentsFor } = setup({ connections, flows });

    let pending: import("./useDeletion").PendingDeletion | null = null;

    act(() => {
      pending = result.current.tryDeletion([], [], ["c2"]);
    });

    // tryDeletion should return a pending deletion (broken flow)
    expect(pending).not.toBeNull();
    expect(pending!.brokenFlows).toHaveLength(1);
    expect(pending!.brokenFlows[0].id).toBe("f1");

    await act(async () => {
      await result.current.confirmDeletion(pending!);
    });

    expect(detachAttachmentsFor).toHaveBeenCalledTimes(1);

    const matcher = (detachAttachmentsFor.mock.calls as unknown as [[(r: AttachmentLink) => boolean]])[0][0];

    // Matches the directly deleted connection (the middle one that was removed)
    expect(matcher(row("connection", "c2"))).toBe(true);
    // Matches the broken flow
    expect(matcher(row("flow", "f1"))).toBe(true);
    // Does NOT match unrelated flow
    expect(matcher(row("flow", "f2"))).toBe(false);
    // Does NOT match tab rows
    expect(matcher(row("tab-track", "f1"))).toBe(false);
  });

  it("DIAG-3.10-49: flow direct delete detaches matching flow rows", async () => {
    const flows = [flow("f1", []), flow("f2", [])];
    const { result, detachAttachmentsFor } = setup({ flows });

    await act(async () => {
      result.current.deleteSelection({ type: "flow", id: "f1" });
    });

    expect(detachAttachmentsFor).toHaveBeenCalledTimes(1);

    const matcher = (detachAttachmentsFor.mock.calls as unknown as [[(r: AttachmentLink) => boolean]])[0][0];

    // Matches the deleted flow
    expect(matcher(row("flow", "f1"))).toBe(true);
    // Does NOT match a different flow
    expect(matcher(row("flow", "f2"))).toBe(false);
    // Does NOT match node rows even with the same id
    expect(matcher(row("node", "f1"))).toBe(false);
    // Does NOT match tab rows
    expect(matcher(row("tab-track", "f1"))).toBe(false);
  });
});
