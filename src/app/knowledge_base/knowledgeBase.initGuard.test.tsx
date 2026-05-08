import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the Tauri-repo factories so vaultConfig.read() is the only knob the
// test cares about. tauriBridge.setRoot drives the boot path
// (settingsStore.getSettings → setRoot → setVaultPath); readJson drives
// vaultConfig.read() — pointed via the path arg at .archdesigner/config.json.
const bridge = vi.hoisted(() => ({
  setRoot: vi.fn().mockResolvedValue(undefined),
  pick: vi.fn().mockResolvedValue(null),
  list: vi.fn().mockResolvedValue([]),
  exists: vi.fn().mockResolvedValue(true),
  readJson: vi.fn(),
  writeJson: vi.fn().mockResolvedValue(undefined),
  readText: vi.fn().mockResolvedValue(""),
  writeText: vi.fn().mockResolvedValue(undefined),
  readBytes: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
  writeBytes: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  watchStart: vi.fn().mockResolvedValue(undefined),
  watchStop: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./infrastructure/tauriBridge", () => ({ tauriBridge: bridge }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

// Web Worker stub — jsdom has no Worker constructor; useVaultSearch reaches
// for it on mount via createRealWorkerClient.
vi.mock("./features/search/searchWorkerClient", () => ({
  createRealWorkerClient: () => ({
    post: () => undefined,
    onMessage: () => () => undefined,
    terminate: () => undefined,
  }),
}));

vi.mock("./infrastructure/settingsStore", () => ({
  getSettings: vi.fn(async () => ({
    vault: { lastPath: "/Users/x/empty", recents: [] },
    ui: { claudeChat: { height: 320 } },
    claude: {},
  })),
  getRecents: vi.fn(async () => []),
  setLastPath: vi.fn(async () => undefined),
  pushRecent: vi.fn(async () => undefined),
  clearLastPath: vi.fn(async () => undefined),
  setClaudeChatHeight: vi.fn(async () => undefined),
}));

import KnowledgeBase from "./knowledgeBase";
import { FileSystemError } from "./domain/errors";

const VALID_CONFIG = {
  version: "1.0",
  name: "v",
  created: "2026-01-01T00:00:00.000Z",
  lastOpened: "2026-01-01T00:00:00.000Z",
};

describe("KnowledgeBase init-guard", () => {
  beforeEach(() => {
    bridge.readJson.mockReset();
    bridge.list.mockReset().mockResolvedValue([]);
  });

  it("renders UninitializedVaultSplash when vaultConfig.read() returns null", async () => {
    // `tauriBridge.readJson(".archdesigner/config.json")` → not-found rejection
    // is the contract for "this folder isn't a vault yet" — `readOrNull`
    // collapses it to `null`, which the shell renders as the splash.
    bridge.readJson.mockImplementation(async (path: string) => {
      if (path === ".archdesigner/config.json") {
        throw new FileSystemError("not-found", "config missing");
      }
      return null;
    });
    render(<KnowledgeBase />);
    expect(
      await screen.findByText(/empty is not yet a knowledge-base vault/i),
    ).toBeInTheDocument();
  });

  it("renders the app interior when vaultConfig.read() returns a valid config", async () => {
    bridge.readJson.mockImplementation(async (path: string) => {
      if (path === ".archdesigner/config.json") return VALID_CONFIG;
      return null;
    });
    render(<KnowledgeBase />);
    await waitFor(() =>
      expect(
        screen.queryByText(/is not yet a knowledge-base vault/i),
      ).not.toBeInTheDocument(),
    );
    // Sanity: real desktop tree mounted (Header rendered the vault name).
    await waitFor(() =>
      expect(document.querySelector('[data-testid="knowledge-base"]')).not.toBeNull(),
    );
  });
});
