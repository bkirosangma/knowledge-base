import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { TabMetadata } from "../../../domain/tabEngine";
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

describe("useTabSectionSync", () => {
  it("emits no migrations on first run (no prior snapshot)", () => {
    const onMigrate = vi.fn();
    renderHook(() =>
      useTabSectionSync("tabs/song.alphatex", meta([
        { name: "Verse 1", startBeat: 0 },
      ]), onMigrate),
    );
    expect(onMigrate).not.toHaveBeenCalled();
  });

  it("emits a position-aligned migration when a section is renamed in place", () => {
    const onMigrate = vi.fn();
    const { rerender } = renderHook(
      ({ sections }) =>
        useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
      { initialProps: { sections: [{ name: "Verse 1", startBeat: 0 }] } },
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
      { initialProps: { sections: [{ name: "Intro", startBeat: 0 }] } },
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
