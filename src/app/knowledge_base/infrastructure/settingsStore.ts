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

export const RECENTS_MAX = 5;

export async function getSettings(): Promise<Settings> {
  return await invoke<Settings>("settings_read", {});
}

async function writeSettings(settings: Settings): Promise<void> {
  await invoke<void>("settings_write", { settings });
}

export async function setLastPath(path: string): Promise<void> {
  const s = await getSettings();
  await writeSettings({ ...s, vault: { ...s.vault, lastPath: path } });
}

export async function clearLastPath(): Promise<void> {
  const s = await getSettings();
  await writeSettings({ ...s, vault: { ...s.vault, lastPath: null } });
}

export async function getRecents(): Promise<string[]> {
  return (await getSettings()).vault.recents;
}

export async function pushRecent(path: string): Promise<void> {
  const s = await getSettings();
  const filtered = s.vault.recents.filter((p) => p !== path);
  const next = [path, ...filtered].slice(0, RECENTS_MAX);
  await writeSettings({ ...s, vault: { ...s.vault, recents: next } });
}

export async function setClaudeChatHeight(height: number): Promise<void> {
  const s = await getSettings();
  await writeSettings({
    ...s,
    ui: { ...s.ui, claudeChat: { ...s.ui.claudeChat, height } },
  });
}
