/**
 * Typed wrappers around the 10 `vault_*` Tauri commands plus an error
 * translator that converts the `VaultError` tagged union into the existing
 * `FileSystemError` so consumer code keeps the same `try/catch` ergonomics.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { FileSystemError } from "../domain/errors";
import type {
  ClaudeEvent,
  ClaudeStatus,
  ClaudeUserMessage,
} from "../features/claude/types";

interface RawVaultError {
  kind:
    | "no_vault"
    | "not_found"
    | "permission_denied"
    | "path_escape"
    | "io"
    | "parse";
  path?: string;
  message?: string;
}

function isRawVaultError(value: unknown): value is RawVaultError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

function translate(err: unknown, fallbackPath: string): FileSystemError {
  if (isRawVaultError(err)) {
    const path = err.path ?? fallbackPath;
    const message = err.message ?? `Vault operation failed: ${err.kind}`;
    switch (err.kind) {
      case "no_vault":
        return new FileSystemError("unknown", `No vault configured${path ? ` at ${path}` : ""}`, err);
      case "not_found":
        return new FileSystemError("not-found", `File not found: ${path}`, err);
      case "permission_denied":
        return new FileSystemError("permission", `Permission denied: ${path}`, err);
      case "path_escape":
        return new FileSystemError("unknown", `Invalid path (escapes vault root): ${path}`, err);
      case "io":
        return new FileSystemError("unknown", `I/O error${path ? ` at ${path}` : ""}: ${message}`, err);
      case "parse":
        return new FileSystemError("malformed", `Failed to parse ${path}: ${message}`, err);
    }
  }
  return new FileSystemError("unknown", `Unknown vault error: ${String(err)}`, err);
}

export interface VaultDirEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
}

async function call<T>(
  cmd: string,
  args: Record<string, unknown>,
  pathArg: string
): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw translate(err, pathArg);
  }
}

async function listenEvent<T>(
  eventName: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  return listen<T>(eventName, (event) => handler(event.payload));
}

export const tauriBridge = {
  pick(): Promise<string | null> {
    return call<string | null>("vault_pick", {}, "");
  },
  setRoot(path: string): Promise<void> {
    return call<void>("vault_set_root", { path }, path);
  },
  readText(path: string): Promise<string> {
    return call<string>("vault_read_text", { path }, path);
  },
  writeText(path: string, content: string): Promise<void> {
    return call<void>("vault_write_text", { path, content }, path);
  },
  readJson<T = unknown>(path: string): Promise<T> {
    return call<T>("vault_read_json", { path }, path);
  },
  writeJson(path: string, value: unknown): Promise<void> {
    return call<void>("vault_write_json", { path, value }, path);
  },
  list(dir: string): Promise<VaultDirEntry[]> {
    return call<VaultDirEntry[]>("vault_list", { dir }, dir);
  },
  rename(from: string, to: string): Promise<void> {
    return call<void>("vault_rename", { from, to }, from);
  },
  delete(path: string): Promise<void> {
    return call<void>("vault_delete", { path }, path);
  },
  exists(path: string): Promise<boolean> {
    return call<boolean>("vault_exists", { path }, path);
  },
  writeBytes(path: string, bytes: ArrayBuffer): Promise<void> {
    const arr = Array.from(new Uint8Array(bytes));
    return call<void>("vault_write_bytes", { path, bytes: arr }, path);
  },
  readBytes(path: string): Promise<ArrayBuffer> {
    return call<number[]>("vault_read_bytes", { path }, path).then((arr) =>
      new Uint8Array(arr).buffer,
    );
  },
  watchStart(): Promise<void> {
    return call<void>("vault_watch_start", {}, "");
  },
  watchStop(): Promise<void> {
    return call<void>("vault_watch_stop", {}, "");
  },

  // -- Claude --

  /** Probe the Claude binary; safe to call repeatedly (no subprocess spawn). */
  claudeStatus(): Promise<ClaudeStatus> {
    return call<ClaudeStatus>("claude_status", {}, "");
  },
  /** Push one user message onto the long-lived subprocess stdin. Spawns lazily on first call. */
  claudeSend(message: ClaudeUserMessage): Promise<void> {
    return call<void>("claude_send", { message }, "");
  },
  /** SIGINT the subprocess, cancelling in-flight generation. Process stays alive. */
  claudeInterrupt(): Promise<void> {
    return call<void>("claude_interrupt", {}, "");
  },
  /** Kill the subprocess and reset session state. Next claudeSend respawns. */
  claudeReset(): Promise<void> {
    return call<void>("claude_reset", {}, "");
  },
  /** Subscribe to claude_event payloads. Returns an unsubscribe function. */
  subscribeClaudeEvent(
    handler: (event: ClaudeEvent) => void,
  ): Promise<() => void> {
    return listenEvent<ClaudeEvent>("claude_event", handler);
  },
};
