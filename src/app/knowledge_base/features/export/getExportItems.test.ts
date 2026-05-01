import { describe, it, expect } from "vitest";
import { getExportItems } from "./getExportItems";

describe("getExportItems (EXPORT-9.4-02)", () => {
  it("diagram → svg, png", () => {
    expect(getExportItems("diagram")).toEqual(["svg", "png"]);
  });
  it("svgEditor → svg, png", () => {
    expect(getExportItems("svgEditor")).toEqual(["svg", "png"]);
  });
  it("document → print", () => {
    expect(getExportItems("document")).toEqual(["print"]);
  });
  it("graph / graphify / search → no items", () => {
    expect(getExportItems("graph")).toEqual([]);
    expect(getExportItems("graphify")).toEqual([]);
    expect(getExportItems("search")).toEqual([]);
  });
  it("null / undefined → no items", () => {
    expect(getExportItems(null)).toEqual([]);
    expect(getExportItems(undefined)).toEqual([]);
  });
});
