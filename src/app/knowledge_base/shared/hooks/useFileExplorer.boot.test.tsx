// Covers MVP-1c boot path: settingsStore-backed restore of lastPath on mount,
// plus openFolder write-through (setLastPath + pushRecent).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useFileExplorer } from "./useFileExplorer";
import { ShellErrorProvider } from "../../shell/ShellErrorContext";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { MockDir } from "../testUtils/fsMock";
import * as tauriBridgeModule from "../../infrastructure/tauriBridge";
import * as settingsStore from "../../infrastructure/settingsStore";

vi.mock("../../infrastructure/settingsStore", () => ({
  getSettings: vi.fn(),
  setLastPath: vi.fn(async () => undefined),
  pushRecent: vi.fn(async () => undefined),
  clearLastPath: vi.fn(async () => undefined),
  getRecents: vi.fn(async () => []),
  setClaudeChatHeight: vi.fn(async () => undefined),
}));

vi.spyOn(tauriBridgeModule.tauriBridge, "setRoot").mockResolvedValue();
vi.spyOn(tauriBridgeModule.tauriBridge, "pick").mockResolvedValue(null);

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    StubRepositoryProvider,
    {
      value: mockReposFor(new MockDir("/")),
      children: createElement(ShellErrorProvider, null, children),
    },
  );
}

// Lightweight stub — boot tests do not exercise real FS ops, so a minimal
// Repositories shape with vaultIndex.scan() returning [] is enough.
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

describe("useFileExplorer boot — settingsStore restore", () => {
  beforeEach(() => {
    vi.mocked(settingsStore.getSettings).mockReset();
    vi.mocked(settingsStore.setLastPath).mockClear();
    vi.mocked(settingsStore.pushRecent).mockClear();
    vi.mocked(settingsStore.clearLastPath).mockClear();
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockClear();
    vi.mocked(tauriBridgeModule.tauriBridge.pick).mockClear();
  });

  it("restores lastPath and calls setRoot when the path is reachable", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: "/Users/x/v", recents: ["/Users/x/v"] },
      ui: { claudeChat: { height: 320 } },
      claude: { permissionMode: "acceptEdits" as const },
    });
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(result.current.vaultPath).toBe("/Users/x/v"));
    expect(tauriBridgeModule.tauriBridge.setRoot).toHaveBeenCalledWith("/Users/x/v");
  });

  it("leaves vaultPath null when the store has no lastPath", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: null, recents: [] },
      ui: { claudeChat: { height: 320 } },
      claude: { permissionMode: "acceptEdits" as const },
    });
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(settingsStore.getSettings).toHaveBeenCalled());
    expect(result.current.vaultPath).toBeNull();
    expect(tauriBridgeModule.tauriBridge.setRoot).not.toHaveBeenCalled();
  });

  it("clears lastPath when setRoot rejects (canonicalize NotFound)", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: "/gone", recents: ["/gone"] },
      ui: { claudeChat: { height: 320 } },
      claude: { permissionMode: "acceptEdits" as const },
    });
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockRejectedValueOnce(
      new Error("canonicalize: NotFound"),
    );
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(settingsStore.clearLastPath).toHaveBeenCalled());
    expect(result.current.vaultPath).toBeNull();
  });

  it("openFolder writes lastPath and pushes a recent on success", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: null, recents: [] },
      ui: { claudeChat: { height: 320 } },
      claude: { permissionMode: "acceptEdits" as const },
    });
    vi.mocked(tauriBridgeModule.tauriBridge.pick).mockResolvedValueOnce("/Users/x/new");
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockResolvedValueOnce();
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(settingsStore.getSettings).toHaveBeenCalled());
    await act(async () => {
      await result.current.openFolder();
    });
    expect(settingsStore.setLastPath).toHaveBeenCalledWith("/Users/x/new");
    expect(settingsStore.pushRecent).toHaveBeenCalledWith("/Users/x/new");
  });
});
