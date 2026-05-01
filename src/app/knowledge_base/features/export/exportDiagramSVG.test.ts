import { describe, it, expect } from "vitest";
import { exportDiagramSVG } from "./exportDiagramSVG";
import type { DiagramData } from "../../shared/utils/types";

const FIXTURE: DiagramData = {
  title: "Topology",
  layers: [
    { id: "l1", title: "Frontend", bg: "#fef3c7", border: "#f59e0b" },
    { id: "l2", title: "Backend", bg: "#dbeafe", border: "#3b82f6" },
  ],
  nodes: [
    {
      id: "n-alpha",
      label: "Alpha",
      sub: "service",
      icon: "default",
      x: 100,
      y: 100,
      w: 200,
      layer: "l1",
      bgColor: "#ffffff",
      borderColor: "#94a3b8",
      textColor: "#1e293b",
    },
    {
      id: "n-beta",
      label: "Beta",
      icon: "default",
      x: 100,
      y: 300,
      w: 200,
      layer: "l2",
    },
  ],
  connections: [
    {
      id: "c-1",
      from: "n-alpha",
      to: "n-beta",
      fromAnchor: "bottom-1",
      toAnchor: "top-1",
      color: "#3b82f6",
      label: "calls",
    },
  ],
  flows: [],
  layerManualSizes: {},
  lineCurve: "bezier",
};

describe("exportDiagramSVG", () => {
  it("EXPORT-9.1-01: returns a single root <svg> with xml declaration", () => {
    const out = exportDiagramSVG(FIXTURE);
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out).toMatch(/<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(out).toMatch(/<\/svg>\s*$/);
  });

  it("EXPORT-9.1-02: viewBox covers all geometry", () => {
    const out = exportDiagramSVG(FIXTURE);
    const m = /viewBox="(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)"/.exec(out);
    expect(m).not.toBeNull();
    if (!m) return;
    const [, , , w, h] = m;
    expect(parseFloat(w)).toBeGreaterThan(0);
    expect(parseFloat(h)).toBeGreaterThan(0);
  });

  it("EXPORT-9.1-03: rectangle nodes render as <rect> + <text> with inlined colours", () => {
    const out = exportDiagramSVG(FIXTURE);
    expect(out).toContain('fill="#ffffff"');
    expect(out).toContain('stroke="#94a3b8"');
    expect(out).toContain(">Alpha<");
    expect(out).toContain(">service<");
  });

  it("EXPORT-9.1-04: condition nodes render as <path>", () => {
    const conditionDoc: DiagramData = {
      ...FIXTURE,
      nodes: [
        {
          id: "n-cond",
          label: "Condition?",
          icon: "default",
          x: 200,
          y: 200,
          w: 140,
          layer: "l1",
          shape: "condition",
          conditionOutCount: 2,
          conditionSize: 1,
        },
      ],
      connections: [],
    };
    const out = exportDiagramSVG(conditionDoc);
    expect(out).toMatch(/<path d="[^"]+"/);
    expect(out).toContain(">Condition?<");
  });

  it("EXPORT-9.1-05: layer regions render as back-layer <rect>", () => {
    const out = exportDiagramSVG(FIXTURE);
    expect(out).toContain('fill="#fef3c7"');
    expect(out).toContain('stroke="#f59e0b"');
    expect(out).toContain('fill="#dbeafe"');
  });

  it("EXPORT-9.1-06: connections render as <path> with inlined colour", () => {
    const out = exportDiagramSVG(FIXTURE);
    expect(out).toMatch(/<path d="[^"]+" fill="none" stroke="#3b82f6"/);
  });

  it("EXPORT-9.1-07: connection labels appear at midpoint", () => {
    const out = exportDiagramSVG(FIXTURE);
    expect(out).toContain(">calls<");
  });

  it("EXPORT-9.1-08: diagram title and layer titles render", () => {
    const out = exportDiagramSVG(FIXTURE);
    expect(out).toContain(">Topology<");
    expect(out).toContain(">FRONTEND<");
    expect(out).toContain(">BACKEND<");
  });

  it("EXPORT-9.1-09: empty diagram is well-formed", () => {
    const empty: DiagramData = {
      title: "Empty",
      layers: [],
      nodes: [],
      connections: [],
    };
    const out = exportDiagramSVG(empty);
    expect(out).toContain('<svg ');
    expect(out).toContain(">Empty<");
    expect(out).toMatch(/<\/svg>\s*$/);
  });

  it("EXPORT-9.1-10: snapshot stability — same input produces identical bytes", () => {
    const a = exportDiagramSVG(FIXTURE);
    const b = exportDiagramSVG({
      ...FIXTURE,
      // Reverse iteration order — exporter should sort and produce
      // identical output.
      nodes: [...FIXTURE.nodes].reverse(),
      connections: [...FIXTURE.connections].reverse(),
      layers: [...FIXTURE.layers].reverse(),
    });
    expect(a).toBe(b);
  });

  it("escapes special characters in labels", () => {
    const xss: DiagramData = {
      ...FIXTURE,
      nodes: [
        {
          id: "n",
          label: "<script>alert('x')</script>",
          icon: "default",
          x: 0,
          y: 0,
          w: 200,
          layer: "l1",
        },
      ],
      connections: [],
    };
    const out = exportDiagramSVG(xss);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
