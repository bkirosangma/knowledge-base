import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createVaultConfigRepositoryTauri } from "./vaultConfigRepoTauri";
import { FileSystemError } from "../domain/errors";
import type { VaultConfig } from "../shared/utils/types";

const CONFIG_PATH = ".archdesigner/config.json";

describe("vaultConfigRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  describe("init", () => {
    it("writes a fresh config with version, name, and timestamps", async () => {
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const before = new Date();
      const config = await repo.init("My Vault");
      const after = new Date();

      expect(bridge.writeJson).toHaveBeenCalledOnce();
      const [path, value] = bridge.writeJson.mock.calls[0];
      expect(path).toBe(CONFIG_PATH);
      expect(value).toEqual({
        version: "1.0",
        name: "My Vault",
        created: expect.any(String),
        lastOpened: expect.any(String),
      });

      // Validate timestamps are ISO strings within the test's time window
      const created = new Date(value.created);
      const lastOpened = new Date(value.lastOpened);
      expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(created.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(lastOpened.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastOpened.getTime()).toBeLessThanOrEqual(after.getTime());

      // Verify return value
      expect(config).toEqual({
        version: "1.0",
        name: "My Vault",
        created: value.created,
        lastOpened: value.lastOpened,
      });
    });

    it("returns the created config", async () => {
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const config = await repo.init("Test Vault");

      expect(config.version).toBe("1.0");
      expect(config.name).toBe("Test Vault");
      expect(config.created).toBeDefined();
      expect(config.lastOpened).toBeDefined();
    });

    it("throws when writeJson fails", async () => {
      const error = new Error("Write failed");
      bridge.writeJson.mockRejectedValue(error);
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.init("My Vault");
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe("read", () => {
    it("reads and returns valid config", async () => {
      const mockConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(mockConfig);
      const repo = createVaultConfigRepositoryTauri();

      const config = await repo.read();

      expect(bridge.readJson).toHaveBeenCalledWith(CONFIG_PATH);
      expect(config).toEqual(mockConfig);
    });

    it("throws FileSystemError with kind 'malformed' when data is not an object", async () => {
      bridge.readJson.mockResolvedValue("not an object");
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.read();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("name", "FileSystemError");
        expect(e).toHaveProperty("kind", "malformed");
      }
    });

    it("throws FileSystemError with kind 'malformed' when version is missing", async () => {
      bridge.readJson.mockResolvedValue({
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      });
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.read();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("name", "FileSystemError");
        expect(e).toHaveProperty("kind", "malformed");
      }
    });

    it("throws FileSystemError with kind 'malformed' when name is missing", async () => {
      bridge.readJson.mockResolvedValue({
        version: "1.0",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      });
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.read();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("name", "FileSystemError");
        expect(e).toHaveProperty("kind", "malformed");
      }
    });

    it("throws FileSystemError with kind 'malformed' when created is missing", async () => {
      bridge.readJson.mockResolvedValue({
        version: "1.0",
        name: "My Vault",
        lastOpened: "2026-05-08T07:00:00.000Z",
      });
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.read();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("name", "FileSystemError");
        expect(e).toHaveProperty("kind", "malformed");
      }
    });

    it("throws FileSystemError with kind 'malformed' when lastOpened is missing", async () => {
      bridge.readJson.mockResolvedValue({
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
      });
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.read();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toHaveProperty("name", "FileSystemError");
        expect(e).toHaveProperty("kind", "malformed");
      }
    });

    it("allows optional theme field", async () => {
      const mockConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
        theme: "dark",
      };
      bridge.readJson.mockResolvedValue(mockConfig);
      const repo = createVaultConfigRepositoryTauri();

      const config = await repo.read();

      expect(config).toEqual(mockConfig);
    });

    it("allows optional graph field", async () => {
      const mockConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
        graph: { layout: {} },
      };
      bridge.readJson.mockResolvedValue(mockConfig);
      const repo = createVaultConfigRepositoryTauri();

      const config = await repo.read();

      expect(config).toEqual(mockConfig);
    });
  });

  describe("touchLastOpened", () => {
    it("reads config, updates lastOpened, and writes back", async () => {
      const now = new Date();
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-07T00:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      await repo.touchLastOpened();

      expect(bridge.readJson).toHaveBeenCalledWith(CONFIG_PATH);
      expect(bridge.writeJson).toHaveBeenCalledOnce();
      const [path, value] = bridge.writeJson.mock.calls[0];
      expect(path).toBe(CONFIG_PATH);
      expect(value.version).toBe("1.0");
      expect(value.name).toBe("My Vault");
      expect(value.created).toBe("2026-05-01T10:00:00.000Z");

      const lastOpened = new Date(value.lastOpened);
      expect(lastOpened.getTime()).toBeGreaterThanOrEqual(now.getTime() - 1000);
      expect(lastOpened.getTime()).toBeLessThanOrEqual(now.getTime() + 1000);
    });

    it("preserves optional fields like theme", async () => {
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-07T00:00:00.000Z",
        theme: "dark",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      await repo.touchLastOpened();

      const [, value] = bridge.writeJson.mock.calls[0];
      expect(value.theme).toBe("dark");
    });

    it("throws when readJson fails", async () => {
      const error = new Error("Read failed");
      bridge.readJson.mockRejectedValue(error);
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.touchLastOpened();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it("throws when writeJson fails", async () => {
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-07T00:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockRejectedValue(new Error("Write failed"));
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.touchLastOpened();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe("update", () => {
    it("SHELL-1.13-08: update({ theme: 'dark' }) preserves name/version/created", async () => {
      // Pre-seed config; call update({ theme: "dark" }); read back; assert
      // theme is "dark" AND name/version/created are preserved verbatim.
      const seed = {
        version: "1.0",
        name: "MVP-5 Vault",
        created: "2026-04-01T00:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(seed);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const updated = await repo.update({ theme: "dark" });

      // Patch applied.
      expect(updated.theme).toBe("dark");
      // Untouched fields survive.
      expect(updated.version).toBe(seed.version);
      expect(updated.name).toBe(seed.name);
      expect(updated.created).toBe(seed.created);
      // The persisted payload mirrors the returned shape.
      const [, value] = bridge.writeJson.mock.calls[0];
      expect(value).toEqual({ ...seed, theme: "dark" });
    });

    it("reads config, merges patch, and writes back", async () => {
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const updated = await repo.update({ theme: "dark" });

      expect(bridge.readJson).toHaveBeenCalledWith(CONFIG_PATH);
      expect(bridge.writeJson).toHaveBeenCalledOnce();
      const [path, value] = bridge.writeJson.mock.calls[0];
      expect(path).toBe(CONFIG_PATH);
      expect(value).toEqual({
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
        theme: "dark",
      });
      expect(updated).toEqual(value);
    });

    it("replaces scalar values", async () => {
      const currentConfig = {
        version: "1.0",
        name: "Old Name",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const updated = await repo.update({ name: "New Name" });

      const [, value] = bridge.writeJson.mock.calls[0];
      expect(value.name).toBe("New Name");
      expect(updated.name).toBe("New Name");
    });

    it("one-level merges nested objects", async () => {
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
        graph: { layout: { n1: { x: 10, y: 20 } }, zoom: 1.5 },
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const updated = await repo.update({
        graph: { layout: { n2: { x: 30, y: 40 } } },
      });

      const [, value] = bridge.writeJson.mock.calls[0];
      // One-level merge: graph.layout is replaced, but graph.zoom is preserved
      expect(value.graph).toEqual({
        layout: { n2: { x: 30, y: 40 } },
        zoom: 1.5,
      });
      expect(updated.graph).toEqual(value.graph);
    });

    it("replaces nested object with null", async () => {
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
        theme: "dark",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockResolvedValue(undefined);
      const repo = createVaultConfigRepositoryTauri();

      const updated = await repo.update({ theme: undefined });

      const [, value] = bridge.writeJson.mock.calls[0];
      expect(value.theme).toBeUndefined();
      expect(updated.theme).toBeUndefined();
    });

    it("throws when readJson fails", async () => {
      const error = new Error("Read failed");
      bridge.readJson.mockRejectedValue(error);
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.update({ theme: "dark" });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it("throws when writeJson fails", async () => {
      const currentConfig = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };
      bridge.readJson.mockResolvedValue(currentConfig);
      bridge.writeJson.mockRejectedValue(new Error("Write failed"));
      const repo = createVaultConfigRepositoryTauri();

      try {
        await repo.update({ theme: "dark" });
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe("isVault", () => {
    it("returns true for valid config with version", () => {
      const repo = createVaultConfigRepositoryTauri();
      const config = {
        version: "1.0",
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };

      const result = repo.isVault(config);

      expect(result).toBe(true);
    });

    it("returns false for null", () => {
      const repo = createVaultConfigRepositoryTauri();

      const result = repo.isVault(null);

      expect(result).toBe(false);
    });

    it("returns false when version is missing", () => {
      const repo = createVaultConfigRepositoryTauri();
      const config = {
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };

      const result = repo.isVault(config as unknown as VaultConfig);

      expect(result).toBe(false);
    });

    it("returns false when version is undefined", () => {
      const repo = createVaultConfigRepositoryTauri();
      const config = {
        version: undefined,
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };

      const result = repo.isVault(config as unknown as VaultConfig);

      expect(result).toBe(false);
    });

    it("returns false when version is null", () => {
      const repo = createVaultConfigRepositoryTauri();
      const config = {
        version: null,
        name: "My Vault",
        created: "2026-05-01T10:00:00.000Z",
        lastOpened: "2026-05-08T07:00:00.000Z",
      };

      const result = repo.isVault(config as unknown as VaultConfig);

      expect(result).toBe(false);
    });
  });
});
