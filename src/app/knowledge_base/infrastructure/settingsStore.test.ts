import { describe, it, expect, vi, beforeEach } from "vitest";

// `state.storeState` simulates the Rust-side persisted Settings JSON.
// Wrapped in vi.hoisted() so the vi.mock() factory below (also hoisted) can
// close over it without hitting a TDZ ReferenceError. Same pattern as
// tauriBridge.test.ts in this project.
const state = vi.hoisted(() => ({ storeState: null as unknown }));

const invokeMock = vi.hoisted(() =>
  vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "settings_read") {
      if (state.storeState === null) {
        return {
          vault: { lastPath: null, recents: [] },
          ui: { claudeDrawer: { height: 320 } },
          claude: { permissionMode: "acceptEdits", surface: "terminal" },
        };
      }
      return state.storeState;
    }
    if (cmd === "settings_write") {
      state.storeState = args?.settings;
      return undefined;
    }
    throw new Error(`unexpected command: ${cmd}`);
  }),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import {
  getSettings,
  setLastPath,
  clearLastPath,
  pushRecent,
  getRecents,
  setClaudeDrawerHeight,
  getClaudeDrawerHeight,
  getClaudeSurface,
  getClaudePermissionMode,
  setClaudePermissionMode,
  RECENTS_MAX,
} from "./settingsStore";

describe("settingsStore.getSettings", () => {
  beforeEach(() => {
    state.storeState = null;
    invokeMock.mockClear();
  });

  it("returns the Rust default when the store is fresh", async () => {
    const s = await getSettings();
    expect(s).toEqual({
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 320 } },
      claude: { permissionMode: "acceptEdits", surface: "terminal" },
    });
    expect(invokeMock).toHaveBeenCalledWith("settings_read", {});
  });

  it("returns persisted state once it's been written", async () => {
    state.storeState = {
      vault: { lastPath: "/Users/x/v", recents: ["/Users/x/v"] },
      ui: { claudeDrawer: { height: 480 } },
      claude: { permissionMode: "acceptEdits", surface: "terminal" },
    };
    const s = await getSettings();
    expect(s.vault.lastPath).toBe("/Users/x/v");
    expect(s.ui.claudeDrawer.height).toBe(480);
  });
});

describe("settingsStore mutations", () => {
  beforeEach(() => {
    state.storeState = null;
    invokeMock.mockClear();
  });

  it("setLastPath writes a settings object with vault.lastPath set", async () => {
    await setLastPath("/Users/x/v");
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          vault: expect.objectContaining({ lastPath: "/Users/x/v" }),
        }),
      }),
    );
  });

  it("clearLastPath nulls vault.lastPath", async () => {
    state.storeState = {
      vault: { lastPath: "/old", recents: [] },
      ui: { claudeDrawer: { height: 320 } },
      claude: { permissionMode: "acceptEdits", surface: "terminal" },
    };
    await clearLastPath();
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          vault: expect.objectContaining({ lastPath: null }),
        }),
      }),
    );
  });

  it("pushRecent prepends, dedups, and caps at RECENTS_MAX", async () => {
    await pushRecent("/a");
    await pushRecent("/b");
    await pushRecent("/c");
    await pushRecent("/a"); // dedup → moves to front
    let recents = await getRecents();
    expect(recents).toEqual(["/a", "/c", "/b"]);

    for (let i = 0; i < RECENTS_MAX + 2; i++) {
      await pushRecent(`/p${i}`);
    }
    recents = await getRecents();
    expect(recents).toHaveLength(RECENTS_MAX);
    // Most-recent (highest index) at the front.
    expect(recents[0]).toBe(`/p${RECENTS_MAX + 1}`);
    expect(recents).not.toContain("/a"); // pushed out by the cap
  });

  it("setClaudeDrawerHeight writes ui.claudeDrawer.height", async () => {
    await setClaudeDrawerHeight(456);
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          ui: expect.objectContaining({ claudeDrawer: { height: 456 } }),
        }),
      }),
    );
  });

  // SETTINGS-8-01
  it("getClaudeDrawerHeight returns 320 by default", async () => {
    const h = await getClaudeDrawerHeight();
    expect(h).toBe(320);
  });

  // SETTINGS-8-02
  it("getClaudeDrawerHeight returns the stored value when present", async () => {
    state.storeState = {
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 500 } },
      claude: { permissionMode: "acceptEdits", surface: "terminal" },
    };
    const h = await getClaudeDrawerHeight();
    expect(h).toBe(500);
  });

  // SETTINGS-9-01
  it("getClaudeSurface defaults to terminal when surface is absent", async () => {
    state.storeState = {
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 320 } },
      claude: { permissionMode: "acceptEdits" },
    };
    const surface = await getClaudeSurface();
    expect(surface).toBe("terminal");
  });

  // SETTINGS-9-02
  it("getClaudeDrawerHeight returns new claudeDrawer key when present", async () => {
    state.storeState = {
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 400 } },
      claude: { permissionMode: "acceptEdits", surface: "terminal" },
    };
    const h = await getClaudeDrawerHeight();
    expect(h).toBe(400);
  });

  // SETTINGS-9-03
  it("getClaudeDrawerHeight defaults to 320 when claudeDrawer height is absent", async () => {
    state.storeState = {
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 0 } },
      claude: { permissionMode: "acceptEdits", surface: "terminal" },
    };
    const h = await getClaudeDrawerHeight();
    expect(h).toBe(320);
  });

  // SETTINGS-8-03
  it("getClaudePermissionMode returns acceptEdits by default", async () => {
    const mode = await getClaudePermissionMode();
    expect(mode).toBe("acceptEdits");
  });

  // SETTINGS-8-04
  it("getClaudePermissionMode returns default when stored as default", async () => {
    state.storeState = {
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 320 } },
      claude: { permissionMode: "default" },
    };
    const mode = await getClaudePermissionMode();
    expect(mode).toBe("default");
  });

  // SETTINGS-8-05
  it("setClaudePermissionMode(default) writes the value to settings", async () => {
    await setClaudePermissionMode("default");
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          claude: expect.objectContaining({ permissionMode: "default" }),
        }),
      }),
    );
  });

  // SETTINGS-8-06
  it("setClaudePermissionMode(acceptEdits) writes the value to settings", async () => {
    state.storeState = {
      vault: { lastPath: null, recents: [] },
      ui: { claudeDrawer: { height: 320 } },
      claude: { permissionMode: "default" },
    };
    await setClaudePermissionMode("acceptEdits");
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          claude: expect.objectContaining({ permissionMode: "acceptEdits" }),
        }),
      }),
    );
  });
});
