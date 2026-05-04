import { describe, it, expect, vi } from "vitest";
import { buildExportTabCommands } from "./knowledgeBase";
import type { TabExportHandle } from "./knowledgeBase.tabRouting.helper";

const makeHandle = (paneReadOnly = false): TabExportHandle => ({
  exportMidi: vi.fn().mockResolvedValue(undefined),
  exportWav: vi.fn().mockResolvedValue(undefined),
  exportPdf: vi.fn(),
  paneReadOnly,
});

describe("buildExportTabCommands", () => {
  it("returns three commands with stable ids", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => makeHandle(), isMobile: false });
    expect(cmds.map((c) => c.id)).toEqual([
      "tabs.export-midi",
      "tabs.export-wav",
      "tabs.export-pdf",
    ]);
  });

  it("when() is false on mobile", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => makeHandle(), isMobile: true });
    for (const c of cmds) expect(c.when?.()).toBe(false);
  });

  it("when() is false if no active handle", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => null, isMobile: false });
    for (const c of cmds) expect(c.when?.()).toBe(false);
  });

  it("when() is false if active handle has paneReadOnly = true", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => makeHandle(true), isMobile: false });
    for (const c of cmds) expect(c.when?.()).toBe(false);
  });

  it("run() dispatches to the right handle method", () => {
    const handle = makeHandle();
    const cmds = buildExportTabCommands({ getActiveExport: () => handle, isMobile: false });
    cmds[0]!.run();
    cmds[1]!.run();
    cmds[2]!.run();
    expect(handle.exportMidi).toHaveBeenCalledOnce();
    expect(handle.exportWav).toHaveBeenCalledOnce();
    expect(handle.exportPdf).toHaveBeenCalledOnce();
  });

  it("getActiveExport is re-evaluated per invocation (split-pane focus changes)", () => {
    const left = makeHandle();
    const right = makeHandle();
    let active: TabExportHandle = left;
    const cmds = buildExportTabCommands({ getActiveExport: () => active, isMobile: false });
    cmds[0]!.run();
    expect(left.exportMidi).toHaveBeenCalledOnce();
    expect(right.exportMidi).not.toHaveBeenCalled();
    active = right;
    cmds[0]!.run();
    expect(right.exportMidi).toHaveBeenCalledOnce();
  });
});
