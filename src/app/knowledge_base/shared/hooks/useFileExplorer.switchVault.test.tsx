// Covers MVP-1c switchVault path: clean-switch happy path + dirty-confirm abort.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useFileExplorer } from "./useFileExplorer";
import { ShellErrorProvider } from "../../shell/ShellErrorContext";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { MockDir } from "../testUtils/fsMock";
import * as tauriBridgeModule from "../../infrastructure/tauriBridge";
import * as settingsStore from "../../infrastructure/settingsStore";

vi.mock("../../infrastructure/settingsStore", () => ({
  getSettings: vi.fn(async () => ({
    vault: { lastPath: null, recents: [] },
    ui: { claudeChat: { height: 320 } },
    claude: {},
  })),
  setLastPath: vi.fn(async () => undefined),
  pushRecent: vi.fn(async () => undefined),
  clearLastPath: vi.fn(async () => undefined),
  getRecents: vi.fn(async () => []),
  setClaudeChatHeight: vi.fn(async () => undefined),
}));

vi.spyOn(tauriBridgeModule.tauriBridge, "setRoot").mockResolvedValue();

function mockReposFor(_root: MockDir) {
  return {
    attachment: null,
    attachmentLinks: null,
    linkIndex: null,
    svgRefs: null,
    tabRefs: null,
    vaultConfig: null,
    vaultIndex: { scan: async () => [] },
  } as unknown as Parameters<typeof StubRepositoryProvider>[0]["value"];
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    StubRepositoryProvider,
    {
      value: mockReposFor(new MockDir("/")),
      children: createElement(ShellErrorProvider, null, children),
    },
  );
}

describe("useFileExplorer.switchVault", () => {
  beforeEach(() => {
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockClear();
    vi.mocked(settingsStore.setLastPath).mockClear();
    vi.mocked(settingsStore.pushRecent).mockClear();
  });

  it("performs a clean switch when no files are dirty", async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    await act(async () => {
      await result.current.switchVault("/Users/x/other");
    });
    expect(tauriBridgeModule.tauriBridge.setRoot).toHaveBeenCalledWith("/Users/x/other");
    expect(result.current.vaultPath).toBe("/Users/x/other");
    expect(settingsStore.setLastPath).toHaveBeenCalledWith("/Users/x/other");
    expect(settingsStore.pushRecent).toHaveBeenCalledWith("/Users/x/other");
  });

  it("aborts when dirty and confirm returns false", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    // Mark a file dirty via the public surface (`markDirty` is exposed on the
    // hook's return object and forwards to useDrafts; signature is
    // `(filePath, dirty: boolean)`).
    await act(async () => {
      result.current.markDirty("doc.md", true);
    });
    await waitFor(() => expect(result.current.dirtyFiles.size).toBe(1));
    await act(async () => {
      await result.current.switchVault("/Users/x/other");
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(tauriBridgeModule.tauriBridge.setRoot).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
