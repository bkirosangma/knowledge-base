import { invoke } from "@tauri-apps/api/core";

export interface VaultSettings {
  lastPath: string | null;
  recents: string[];
}

export interface UiSettings {
  claudeChat: { height: number };
}

export interface Settings {
  vault: VaultSettings;
  ui: UiSettings;
  claude: Record<string, unknown>;
}

const RECENTS_MAX = 5;

export async function getSettings(): Promise<Settings> {
  return await invoke<Settings>("settings_read", {});
}

async function writeSettings(settings: Settings): Promise<void> {
  await invoke<void>("settings_write", { settings });
}

export const __RECENTS_MAX = RECENTS_MAX;
// Internal export for the mutation helpers in Task 3 — keeps them in the same module.
export { writeSettings as __writeSettings };
