// Filename helpers for exports (KB-011 / EXPORT-9.5).
//
// `<basename>.<ext>` is the format from the audit plan. The "date suffix
// on collision" wording maps to the browser's standard `(1)` / `(2)`
// download collision behaviour — the page can't observe the user's
// filesystem, so we don't try to second-guess it.

/** Strip directory components from a vault path. Returns null when the
 *  result would be empty, so callers can fall back to a default. */
export function basenameOf(path: string | null | undefined): string | null {
  if (!path) return null;
  const slash = path.lastIndexOf("/");
  const last = slash === -1 ? path : path.slice(slash + 1);
  return last.length > 0 ? last : null;
}

/** Drop a trailing `.md` / `.json` extension from a basename so the
 *  caller can append a different one. */
export function stripVaultExtension(name: string): string {
  if (name.endsWith(".md")) return name.slice(0, -3);
  if (name.endsWith(".json")) return name.slice(0, -5);
  return name;
}

/**
 * Build a download filename for an export. `kind` carries both the
 * extension and the fallback name. When `path` is missing, falls back
 * to the kind's default (e.g. `diagram.svg`).
 */
export function exportFilename(
  path: string | null | undefined,
  ext: "svg" | "png" | "pdf",
  fallback: "diagram" | "document",
): string {
  const base = basenameOf(path);
  const root = base ? stripVaultExtension(base) : fallback;
  return `${root}.${ext}`;
}
