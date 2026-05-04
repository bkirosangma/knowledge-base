import { describe, it, expect } from "vitest";
import { collectDiagramEntityIds } from "./diagramEntityIds";
import type { DiagramData, SerializedNodeData, Connection, FlowDef } from "../../../shared/utils/types";

const empty: DiagramData = {
  title: "T",
  layers: [],
  nodes: [],
  connections: [],
};

describe("collectDiagramEntityIds", () => {
  it("returns empty Set for empty diagram", () => {
    expect(collectDiagramEntityIds(empty).size).toBe(0);
  });

  it("collects nodes, connections, and flows", () => {
    const data: DiagramData = {
      ...empty,
      nodes: [
        { id: "n1", label: "x", x: 0, y: 0, layer: "L1", type: "Db" } as unknown as SerializedNodeData,
        { id: "n2", label: "y", x: 0, y: 0, layer: "L1", type: "Api" } as unknown as SerializedNodeData,
      ],
      connections: [
        { id: "c1", from: "n1", to: "n2", label: "" } as unknown as Connection,
      ],
      flows: [{ id: "f1", name: "main", path: ["c1"] } as unknown as FlowDef],
    };
    const ids = collectDiagramEntityIds(data);
    expect(ids.has("n1")).toBe(true);
    expect(ids.has("n2")).toBe(true);
    expect(ids.has("c1")).toBe(true);
    expect(ids.has("f1")).toBe(true);
    expect(ids.size).toBe(4);
  });
});
