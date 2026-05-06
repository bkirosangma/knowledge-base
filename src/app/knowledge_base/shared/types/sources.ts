export interface SourceLink {
  /** http(s):// URL only — other schemes rejected. */
  url: string;
  /** Optional display label; falls back to URL host when blank. */
  title?: string;
}

export function isValidSourceUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function sourceDisplayLabel(s: SourceLink): string {
  if (s.title && s.title.trim() !== "") return s.title;
  try {
    return new URL(s.url).host;
  } catch {
    return s.url;
  }
}
