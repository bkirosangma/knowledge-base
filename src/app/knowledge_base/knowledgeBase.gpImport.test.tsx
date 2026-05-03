import { describe, it, expect, vi } from "vitest";
import { buildImportGpCommands } from "./knowledgeBase";

// TAB-012 T2 — `tabs.import-gp` palette command must hide on mobile.
// Extracted as a pure helper (mirroring `updateDirtySet`) so the gating
// rule can be unit-tested without spinning up KnowledgeBaseInner.

describe("buildImportGpCommands (TAB-012 T2)", () => {
  const stubGpImport = { pickFile: vi.fn() };

  it("returns the import-gp command with id, title, and group", () => {
    const [cmd] = buildImportGpCommands({
      gpImport: stubGpImport,
      directoryName: "vault",
      isMobile: false,
    });
    expect(cmd.id).toBe("tabs.import-gp");
    expect(cmd.title).toMatch(/Import Guitar Pro/i);
    expect(cmd.group).toBe("File");
  });

  it("TAB-11.8-04: when() returns true on desktop with a directory open", () => {
    const [cmd] = buildImportGpCommands({
      gpImport: stubGpImport,
      directoryName: "vault",
      isMobile: false,
    });
    expect(cmd.when?.()).toBe(true);
  });

  it("TAB-11.8-03: when() returns false on mobile even with a directory open (KB-040)", () => {
    const [cmd] = buildImportGpCommands({
      gpImport: stubGpImport,
      directoryName: "vault",
      isMobile: true,
    });
    expect(cmd.when?.()).toBe(false);
  });

  it("TAB-11.8-05: when() returns false on desktop without a directory open", () => {
    const [cmd] = buildImportGpCommands({
      gpImport: stubGpImport,
      directoryName: null,
      isMobile: false,
    });
    expect(cmd.when?.()).toBe(false);
  });

  it("TAB-11.8-05: when() returns false on mobile without a directory open", () => {
    const [cmd] = buildImportGpCommands({
      gpImport: stubGpImport,
      directoryName: null,
      isMobile: true,
    });
    expect(cmd.when?.()).toBe(false);
  });

  it("run() delegates to gpImport.pickFile()", () => {
    const gpImport = { pickFile: vi.fn() };
    const [cmd] = buildImportGpCommands({
      gpImport,
      directoryName: "vault",
      isMobile: false,
    });
    cmd.run();
    expect(gpImport.pickFile).toHaveBeenCalledTimes(1);
  });
});
