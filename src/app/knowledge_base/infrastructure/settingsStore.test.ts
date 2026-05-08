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

import { getSettings } from "./settingsStore";

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
