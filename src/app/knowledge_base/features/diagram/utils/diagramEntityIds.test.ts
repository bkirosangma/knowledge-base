import { describe, it, expect } from "vitest";
import { collectDiagramEntityIds } from "./diagramEntityIds";
import type { DiagramData } from "../../../shared/utils/types";

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
        { id: "n1", label: "x", x: 0, y: 0, layer: "L1", type: "Db" } as any,
        { id: "n2", label: "y", x: 0, y: 0, layer: "L1", type: "Api" } as any,
      ],
      connections: [
        { id: "c1", from: "n1", to: "n2", label: "" } as any,
      ],
      flows: [{ id: "f1", name: "main", path: ["c1"] } as any],
    };
    const ids = collectDiagramEntityIds(data);
    expect(ids.has("n1")).toBe(true);
    expect(ids.has("n2")).toBe(true);
    expect(ids.has("c1")).toBe(true);
    expect(ids.has("f1")).toBe(true);
    expect(ids.size).toBe(4);
  });
});
