import { describe, it, expect } from "vitest";
import { reconcileSidecarForSetSection, reconcileSidecarByName } from "./sidecarReconcile";
import type { TabRefsPayload } from "../../domain/tabRefs";

function makePayload(sections: TabRefsPayload["sections"]): TabRefsPayload {
  return { version: 1, sections };
}

describe("reconcileSidecarForSetSection (C2 — rename-aware)", () => {
  it("C2: renames an existing entry in-place, preserving the stableId", () => {
    const current = makePayload({
      "stable-1": { currentName: "Verse 1", createdAt: 1 },
    });
    const next = reconcileSidecarForSetSection(current, "Verse 1", "Verse One");
    expect(next.sections["stable-1"]).toBeDefined();
    expect(next.sections["stable-1"].currentName).toBe("Verse One");
    // Old slug-based key should NOT be present.
    expect(next.sections["verse-1"]).toBeUndefined();
  });

  it("creates a new slug entry when oldName has no sidecar match", () => {
    const current = makePayload({});
    const next = reconcileSidecarForSetSection(current, "Chorus", "Chorus");
    expect(next.sections["chorus"]).toBeDefined();
    expect(next.sections["chorus"].currentName).toBe("Chorus");
  });

  it("creates a new entry when oldName is null (section added fresh)", () => {
    const current = makePayload({});
    const next = reconcileSidecarForSetSection(current, null, "Intro");
    expect(next.sections["intro"]).toBeDefined();
  });

  it("removes the entry when newName is null (section deleted)", () => {
    const current = makePayload({
      "stable-2": { currentName: "Outro", createdAt: 1 },
    });
    const next = reconcileSidecarForSetSection(current, "Outro", null);
    expect(next.sections["stable-2"]).toBeUndefined();
  });

  it("does nothing when both oldName and newName are null", () => {
    const current = makePayload({
      "stable-3": { currentName: "Bridge", createdAt: 1 },
    });
    const next = reconcileSidecarForSetSection(current, null, null);
    // Unchanged.
    expect(next.sections["stable-3"]).toBeDefined();
  });

  it("C2: undo of rename restores old stableId (round-trip: rename then undo)", () => {
    // Simulates: rename "Verse 1" → "Verse One", then undo back to "Verse 1"
    const original = makePayload({
      "stable-1": { currentName: "Verse 1", createdAt: 1 },
    });
    const afterRename = reconcileSidecarForSetSection(original, "Verse 1", "Verse One");
    const afterUndo = reconcileSidecarForSetSection(afterRename, "Verse One", "Verse 1");
    // stableId must be preserved through both ops.
    expect(afterUndo.sections["stable-1"]).toBeDefined();
    expect(afterUndo.sections["stable-1"].currentName).toBe("Verse 1");
  });
});

describe("reconcileSidecarByName (C2 — add-bar / remove-bar reconciliation)", () => {
  it("keeps existing entries that match by name", () => {
    const current = makePayload({
      "stable-a": { currentName: "Intro", createdAt: 1 },
    });
    const next = reconcileSidecarByName(current, [{ name: "Intro" }, { name: "Verse" }]);
    expect(next.sections["stable-a"]).toBeDefined();
    expect(next.sections["verse"]).toBeDefined();
  });

  it("drops entries for sections no longer present", () => {
    const current = makePayload({
      "stable-a": { currentName: "Intro", createdAt: 1 },
      "stable-b": { currentName: "Bridge", createdAt: 1 },
    });
    // Bridge removed.
    const next = reconcileSidecarByName(current, [{ name: "Intro" }]);
    expect(next.sections["stable-a"]).toBeDefined();
    expect(next.sections["stable-b"]).toBeUndefined();
  });

  it("returns empty sections for empty input", () => {
    const next = reconcileSidecarByName(makePayload({}), []);
    expect(Object.keys(next.sections)).toHaveLength(0);
  });
});
