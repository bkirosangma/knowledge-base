import { describe, it, expect } from "vitest";
import type { AttachedToEntry, AttachedToScope } from "./attachments";

describe("AttachedToEntry", () => {
  it("accepts every documented scope", () => {
    const scopes: AttachedToScope[] = [
      "root", "node", "connection", "flow", "type",
      "tab", "tab-section", "tab-track",
      "svg",
    ];
    for (const type of scopes) {
      const e: AttachedToEntry = { type, documentPath: "doc.md" };
      expect(e.type).toBe(type);
    }
  });

  it("permits an `id` field on non-root scopes", () => {
    const e: AttachedToEntry = { type: "node", id: "n-1", documentPath: "x.md" };
    expect(e.id).toBe("n-1");
  });
});
