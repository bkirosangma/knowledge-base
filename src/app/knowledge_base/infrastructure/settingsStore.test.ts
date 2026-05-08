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
          ui: { claudeChat: { height: 320 } },
          claude: {},
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
  setClaudeChatHeight,
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
      ui: { claudeChat: { height: 320 } },
      claude: {},
    });
    expect(invokeMock).toHaveBeenCalledWith("settings_read", {});
  });

  it("returns persisted state once it's been written", async () => {
    state.storeState = {
      vault: { lastPath: "/Users/x/v", recents: ["/Users/x/v"] },
      ui: { claudeChat: { height: 480 } },
      claude: {},
    };
    const s = await getSettings();
    expect(s.vault.lastPath).toBe("/Users/x/v");
    expect(s.ui.claudeChat.height).toBe(480);
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
      ui: { claudeChat: { height: 320 } },
      claude: {},
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

  it("setClaudeChatHeight writes ui.claudeChat.height", async () => {
    await setClaudeChatHeight(456);
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          ui: expect.objectContaining({ claudeChat: { height: 456 } }),
        }),
      }),
    );
  });
});
