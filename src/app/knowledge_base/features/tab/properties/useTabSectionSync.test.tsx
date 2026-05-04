import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { TabMetadata } from "../../../domain/tabEngine";
import { StubRepositoryProvider, type Repositories } from "../../../shell/RepositoryContext";
import { useTabSectionSync } from "./useTabSectionSync";

const meta = (sections: { name: string; startBeat: number }[]): TabMetadata => ({
  title: "T",
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  capo: 0,
  tuning: [],
  tracks: [],
  sections,
  totalBeats: 0,
  durationSeconds: 0,
});

/**
 * Build a StubRepositoryProvider wrapper with the given tabRefs repo stub
 * (default: tabRefs=null simulates no rootHandle / pre-picker).
 */
function makeWrapper(tabRefs: Repositories["tabRefs"] = null) {
  const stub: Repositories = {
    attachment: null, document: null, diagram: null,
    linkIndex: null, svg: null, vaultConfig: null,
    tab: null, tabRefs,
  };
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StubRepositoryProvider, { value: stub, children });
  Wrapper.displayName = "StubRepositoryProviderWrapper";
  return Wrapper;
}

describe("useTabSectionSync", () => {
  it("emits no migrations on first run (no prior snapshot)", () => {
    const onMigrate = vi.fn();
    renderHook(
      () => useTabSectionSync("tabs/song.alphatex", meta([
        { name: "Verse 1", startBeat: 0 },
      ]), onMigrate),
      { wrapper: makeWrapper() },
    );
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("emits a position-aligned migration when a section is renamed in place", async () => {
    const onMigrate = vi.fn();
    const tabRefs = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(tabRefs),
        initialProps: { sections: [{ name: "Verse 1", startBeat: 0 }] },
      },
    );
    expect(onMigrate).not.toHaveBeenCalled();

    rerender({ sections: [{ name: "Verse One", startBeat: 0 }] });

    expect(onMigrate).toHaveBeenCalledWith(
      "tabs/song.alphatex",
      [{ from: "verse-1", to: "verse-one" }],
    );
  });

  it("does not emit when ids are unchanged", () => {
    const onMigrate = vi.fn();
    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(),
        initialProps: { sections: [{ name: "Intro", startBeat: 0 }] },
      },
    );
    rerender({ sections: [{ name: "Intro", startBeat: 100 }] });
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("emits no migration for trailing deletions (orphan-by-design)", () => {
    const onMigrate = vi.fn();
    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(),
        initialProps: {
          sections: [
            { name: "Intro", startBeat: 0 },
            { name: "Verse", startBeat: 100 },
          ],
        },
      },
    );
    rerender({ sections: [{ name: "Intro", startBeat: 0 }] });
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("emits migrations only for indices where ids actually differ", () => {
    const onMigrate = vi.fn();
    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(),
        initialProps: {
          sections: [
            { name: "Intro", startBeat: 0 },
            { name: "Verse", startBeat: 100 },
            { name: "Chorus", startBeat: 200 },
          ],
        },
      },
    );

    rerender({
      sections: [
        { name: "Intro", startBeat: 0 },
        { name: "Verse One", startBeat: 100 },
        { name: "Chorus", startBeat: 200 },
      ],
    });

    expect(onMigrate).toHaveBeenCalledTimes(1);
    expect(onMigrate).toHaveBeenCalledWith(
      "tabs/song.alphatex",
      [{ from: "verse", to: "verse-one" }],
    );
  });

  it("resets cache when filePath changes (new file → no migrations on first run)", () => {
    const onMigrate = vi.fn();
    const { rerender } = renderHook(
      ({ filePath, sections }: { filePath: string; sections: { name: string; startBeat: number }[] }) =>
        useTabSectionSync(filePath, meta(sections), onMigrate),
      {
        wrapper: makeWrapper(),
        initialProps: {
          filePath: "tabs/a.alphatex",
          sections: [{ name: "Intro", startBeat: 0 }],
        },
      },
    );
    rerender({
      filePath: "tabs/b.alphatex",
      sections: [{ name: "Different", startBeat: 0 }],
    });
    expect(onMigrate).not.toHaveBeenCalled();
  });
});

describe("useTabSectionSync (sidecar branch)", () => {
  it("does not emit migrations when sidecar exists", async () => {
    const onMigrate = vi.fn();
    // tabRefs.read returns a non-empty payload — sidecar is present.
    const tabRefs = {
      read: vi.fn(async () => ({
        version: 1 as const,
        sections: { "verse-1": { currentName: "Verse 1", createdAt: 1000 } },
      })),
      write: vi.fn(async () => {}),
    };

    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(tabRefs),
        initialProps: { sections: [{ name: "Verse 1", startBeat: 0 }] },
      },
    );

    // Wait for the async tabRefs.read to resolve and set hasSidecar=true.
    await waitFor(() => expect(tabRefs.read).toHaveBeenCalled());

    // A rename that would normally emit a migration must be suppressed.
    rerender({ sections: [{ name: "Verse One", startBeat: 0 }] });
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("falls back to position-based reconciliation when sidecar is null", async () => {
    const onMigrate = vi.fn();
    // tabRefs.read returns null — no sidecar file.
    const tabRefs = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
    };

    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(tabRefs),
        initialProps: { sections: [{ name: "Verse 1", startBeat: 0 }] },
      },
    );

    // Wait for the async tabRefs.read to complete (resolves null → hasSidecar=false).
    await waitFor(() => expect(tabRefs.read).toHaveBeenCalled());

    rerender({ sections: [{ name: "Verse One", startBeat: 0 }] });
    expect(onMigrate).toHaveBeenCalledWith(
      "tabs/song.alphatex",
      [{ from: "verse-1", to: "verse-one" }],
    );
  });

  it("falls back to position-based reconciliation when tabRefs is null", () => {
    const onMigrate = vi.fn();
    // No tabRefs in the repository context (no rootHandle).
    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      {
        wrapper: makeWrapper(null),
        initialProps: { sections: [{ name: "Verse 1", startBeat: 0 }] },
      },
    );

    rerender({ sections: [{ name: "Verse One", startBeat: 0 }] });
    expect(onMigrate).toHaveBeenCalledWith(
      "tabs/song.alphatex",
      [{ from: "verse-1", to: "verse-one" }],
    );
  });
});
