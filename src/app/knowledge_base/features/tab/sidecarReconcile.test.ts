import { describe, it, expect } from "vitest";
import {
  reconcileSidecarForSetSection,
  reconcileSidecarByName,
  updateSidecarOnEdit,
} from "./sidecarReconcile";
import type { TabRefsPayload } from "../../domain/tabRefs";
import type { TabEditOp } from "../../domain/tabEngine";

function makePayload(sectionRefs: TabRefsPayload["sectionRefs"]): TabRefsPayload {
  return { version: 2, sectionRefs, trackRefs: [] };
}

describe("reconcileSidecarForSetSection (C2 — rename-aware)", () => {
  it("C2: renames an existing entry in-place, preserving the stableId", () => {
    const current = makePayload({
      "stable-1": "Verse 1",
    });
    const next = reconcileSidecarForSetSection(current, "Verse 1", "Verse One");
    expect(next.sectionRefs["stable-1"]).toBeDefined();
    expect(next.sectionRefs["stable-1"]).toBe("Verse One");
    // Old slug-based key should NOT be present.
    expect(next.sectionRefs["verse-1"]).toBeUndefined();
  });

  it("creates a new slug entry when oldName has no sidecar match", () => {
    const current = makePayload({});
    const next = reconcileSidecarForSetSection(current, "Chorus", "Chorus");
    expect(next.sectionRefs["chorus"]).toBeDefined();
    expect(next.sectionRefs["chorus"]).toBe("Chorus");
  });

  it("creates a new entry when oldName is null (section added fresh)", () => {
    const current = makePayload({});
    const next = reconcileSidecarForSetSection(current, null, "Intro");
    expect(next.sectionRefs["intro"]).toBeDefined();
  });

  it("removes the entry when newName is null (section deleted)", () => {
    const current = makePayload({
      "stable-2": "Outro",
    });
    const next = reconcileSidecarForSetSection(current, "Outro", null);
    expect(next.sectionRefs["stable-2"]).toBeUndefined();
  });

  it("does nothing when both oldName and newName are null", () => {
    const current = makePayload({
      "stable-3": "Bridge",
    });
    const next = reconcileSidecarForSetSection(current, null, null);
    // Unchanged.
    expect(next.sectionRefs["stable-3"]).toBeDefined();
  });

  it("C2: undo of rename restores old stableId (round-trip: rename then undo)", () => {
    // Simulates: rename "Verse 1" → "Verse One", then undo back to "Verse 1"
    const original = makePayload({
      "stable-1": "Verse 1",
    });
    const afterRename = reconcileSidecarForSetSection(original, "Verse 1", "Verse One");
    const afterUndo = reconcileSidecarForSetSection(afterRename, "Verse One", "Verse 1");
    // stableId must be preserved through both ops.
    expect(afterUndo.sectionRefs["stable-1"]).toBeDefined();
    expect(afterUndo.sectionRefs["stable-1"]).toBe("Verse 1");
  });

  it("preserves existing trackRefs when reconciling sections", () => {
    const current: TabRefsPayload = {
      version: 2,
      sectionRefs: { "stable-1": "Verse 1" },
      trackRefs: [{ id: "tk-lead-uuid", name: "Lead" }],
    };
    const next = reconcileSidecarForSetSection(current, "Verse 1", "Verse One");
    expect(next.trackRefs).toEqual([{ id: "tk-lead-uuid", name: "Lead" }]);
  });
});

describe("reconcileSidecarByName (C2 — add-bar / remove-bar reconciliation)", () => {
  it("keeps existing entries that match by name", () => {
    const current = makePayload({
      "stable-a": "Intro",
    });
    const next = reconcileSidecarByName(current, [{ name: "Intro" }, { name: "Verse" }]);
    expect(next.sectionRefs["stable-a"]).toBeDefined();
    expect(next.sectionRefs["verse"]).toBeDefined();
  });

  it("drops entries for sections no longer present", () => {
    const current = makePayload({
      "stable-a": "Intro",
      "stable-b": "Bridge",
    });
    // Bridge removed.
    const next = reconcileSidecarByName(current, [{ name: "Intro" }]);
    expect(next.sectionRefs["stable-a"]).toBeDefined();
    expect(next.sectionRefs["stable-b"]).toBeUndefined();
  });

  it("returns empty sectionRefs for empty input", () => {
    const next = reconcileSidecarByName(makePayload({}), []);
    expect(Object.keys(next.sectionRefs)).toHaveLength(0);
  });

  it("preserves existing trackRefs when reconciling by name", () => {
    const current: TabRefsPayload = {
      version: 2,
      sectionRefs: { "stable-a": "Intro" },
      trackRefs: [{ id: "tk-bass-uuid", name: "Bass" }],
    };
    const next = reconcileSidecarByName(current, [{ name: "Intro" }]);
    expect(next.trackRefs).toEqual([{ id: "tk-bass-uuid", name: "Bass" }]);
  });
});

describe("updateSidecarOnEdit — unified entry point", () => {
  it("add-track appends { id, name } to trackRefs", () => {
    const prev: TabRefsPayload = {
      version: 2,
      sectionRefs: {},
      trackRefs: [{ id: "tk-lead-uuid", name: "Lead" }],
    };
    const op: TabEditOp = {
      type: "add-track",
      name: "Drums",
      instrument: "guitar",
      tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
      capo: 0,
    };
    const next = updateSidecarOnEdit(prev, op, { newTrackId: "tk-drums-uuid" });
    expect(next.trackRefs).toEqual([
      { id: "tk-lead-uuid", name: "Lead" },
      { id: "tk-drums-uuid", name: "Drums" },
    ]);
  });

  it("remove-track splices at removedPosition; surviving entries shift down", () => {
    const prev: TabRefsPayload = {
      version: 2,
      sectionRefs: {},
      trackRefs: [
        { id: "tk-a", name: "Lead" },
        { id: "tk-b", name: "Bass" },
        { id: "tk-c", name: "Drums" },
      ],
    };
    const next = updateSidecarOnEdit(
      prev,
      { type: "remove-track", trackId: "1" },
      { removedPosition: 1 },
    );
    expect(next.trackRefs).toEqual([
      { id: "tk-a", name: "Lead" },
      { id: "tk-c", name: "Drums" },
    ]);
  });

  it("add-track without newTrackId throws", () => {
    const prev: TabRefsPayload = { version: 2, sectionRefs: {}, trackRefs: [] };
    expect(() =>
      updateSidecarOnEdit(prev, {
        type: "add-track",
        name: "Bass",
        instrument: "bass",
        tuning: ["E1", "A1", "D2", "G2"],
        capo: 0,
      }),
    ).toThrow("requires ctx.newTrackId");
  });

  it("remove-track without removedPosition throws", () => {
    const prev: TabRefsPayload = {
      version: 2,
      sectionRefs: {},
      trackRefs: [{ id: "tk-a", name: "Lead" }],
    };
    expect(() =>
      updateSidecarOnEdit(prev, { type: "remove-track", trackId: "tk-a" }),
    ).toThrow("requires ctx.removedPosition");
  });

  it("set-section delegates to reconcileSidecarForSetSection", () => {
    const prev: TabRefsPayload = {
      version: 2,
      sectionRefs: { "stable-x": "Old Name" },
      trackRefs: [],
    };
    const next = updateSidecarOnEdit(
      prev,
      { type: "set-section", beat: 0, name: "New Name" },
      { oldSectionName: "Old Name" },
    );
    expect(next.sectionRefs["stable-x"]).toBe("New Name");
  });

  it("add-bar without currentSections throws", () => {
    const prev: TabRefsPayload = { version: 2, sectionRefs: {}, trackRefs: [] };
    expect(() =>
      updateSidecarOnEdit(prev, { type: "add-bar", afterBeat: 0 }),
    ).toThrow("requires ctx.currentSections");
  });

  it("remove-bar without currentSections throws", () => {
    const prev: TabRefsPayload = { version: 2, sectionRefs: {}, trackRefs: [] };
    expect(() =>
      updateSidecarOnEdit(prev, { type: "remove-bar", beat: 0 }),
    ).toThrow("requires ctx.currentSections");
  });

  it("ops that don't touch sidecar return prev unchanged", () => {
    const prev: TabRefsPayload = {
      version: 2,
      sectionRefs: { "stable-x": "Intro" },
      trackRefs: [{ id: "tk-a", name: "Lead" }],
    };
    const next = updateSidecarOnEdit(prev, {
      type: "set-fret",
      beat: 0,
      string: 1,
      fret: 5,
    });
    expect(next).toBe(prev);
  });

  it("add-bar delegates to reconcileSidecarByName", () => {
    const prev: TabRefsPayload = {
      version: 2,
      sectionRefs: { "intro": "Intro" },
      trackRefs: [],
    };
    const next = updateSidecarOnEdit(
      prev,
      { type: "add-bar", afterBeat: 4 },
      { currentSections: [{ name: "Intro" }, { name: "Verse" }] },
    );
    expect(next.sectionRefs["intro"]).toBe("Intro");
    expect(next.sectionRefs["verse"]).toBe("Verse");
  });
});
