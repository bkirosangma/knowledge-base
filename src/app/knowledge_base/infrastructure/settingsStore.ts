import { invoke } from "@tauri-apps/api/core";

export interface VaultSettings {
  lastPath: string | null;
  recents: string[];
}

export interface UiSettings {
  claudeChat: { height: number };
}

export type ClaudePermissionMode = "acceptEdits" | "default";

export interface ClaudeSettings {
  permissionMode: ClaudePermissionMode;
}

export interface Settings {
  vault: VaultSettings;
  ui: UiSettings;
  claude: ClaudeSettings;
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

export async function getClaudeChatHeight(): Promise<number> {
  const s = await getSettings();
  const h = s.ui.claudeChat.height;
  return typeof h === "number" && h > 0 ? h : 320;
}

export async function getClaudePermissionMode(): Promise<ClaudePermissionMode> {
  const s = await getSettings();
  return s.claude.permissionMode === "default" ? "default" : "acceptEdits";
}

export async function setClaudePermissionMode(
  mode: ClaudePermissionMode,
): Promise<void> {
  const s = await getSettings();
  await writeSettings({ ...s, claude: { ...s.claude, permissionMode: mode } });
}
