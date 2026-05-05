import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDiagramFlowFocus } from "./useDiagramFlowFocus";
import type { Connection, FlowDef, NodeData, Selection } from "../types";

const NODES: NodeData[] = [
  { id: "a", label: "A", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "b", label: "B", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "c", label: "C", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
];
const CONNS: Connection[] = [
  { id: "c1", from: "a", to: "b", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
  { id: "c2", from: "b", to: "c", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
];

function makeFlow(over: Partial<FlowDef> = {}): FlowDef {
  return { id: "f", name: "F", connectionIds: ["c1", "c2"], ...over };
}

function setup(flow: FlowDef, sel: Selection = { type: "flow", id: "f" }) {
  return renderHook(() =>
    useDiagramFlowFocus({
      nodes: NODES,
      connections: CONNS,
      flows: [flow],
      selection: sel,
      setSelection: () => {},
    }),
  );
}

describe("useDiagramFlowFocus.flowOrderData (manual fields)", () => {
  it("returns null when no flow is selected/hovered", () => {
    const { result } = setup(makeFlow(), null);
    expect(result.current.flowOrderData).toBeNull();
  });

  it("returns roles 'middle' for every member when startNodeIds/endNodeIds are absent", () => {
    const { result } = setup(makeFlow());
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.role).toBe("middle");
    expect(map.get("b")?.role).toBe("middle");
    expect(map.get("c")?.role).toBe("middle");
  });

  it("uses startNodeIds for 'start' role and endNodeIds for 'end' role", () => {
    const { result } = setup(makeFlow({ startNodeIds: ["a"], endNodeIds: ["c"] }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.role).toBe("start");
    expect(map.get("b")?.role).toBe("middle");
    expect(map.get("c")?.role).toBe("end");
  });

  it("supports multiple starts and multiple ends", () => {
    const { result } = setup(makeFlow({ startNodeIds: ["a", "b"], endNodeIds: ["c", "b"] }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.role).toBe("start");
    // b is in both — last write wins; design is "start takes precedence over end"
    expect(map.get("b")?.role).toBe("start");
    expect(map.get("c")?.role).toBe("end");
  });

  it("emits order numbers from nodeOrders", () => {
    const { result } = setup(makeFlow({ nodeOrders: { a: 1, b: 2, c: 2 } }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.order).toBe(1);
    expect(map.get("b")?.order).toBe(2);
    expect(map.get("c")?.order).toBe(2);
  });

  it("leaves order undefined for nodes without an entry", () => {
    const { result } = setup(makeFlow({ nodeOrders: { a: 1 } }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.order).toBe(1);
    expect(map.get("b")?.order).toBeUndefined();
  });
});
