// src/app/knowledge_base/utils/wikiLinkParser.ts

export interface ParsedWikiLink {
  raw: string;          // full match including [[ ]]
  path: string;         // file path (may be relative or absolute)
  section?: string;     // heading anchor after #
  displayText?: string; // optional alias after |
}

const WIKI_LINK_REGEX = /\[\[([^\]]+?)\]\]/g;

export function parseWikiLinks(markdown: string): ParsedWikiLink[] {
  const results: ParsedWikiLink[] = [];
  let match;
  while ((match = WIKI_LINK_REGEX.exec(markdown)) !== null) {
    const inner = match[1];
    const [pathAndSection, displayText] = inner.split("|").map(s => s.trim());
    const [path, section] = pathAndSection.split("#").map(s => s.trim());
    results.push({
      raw: match[0],
      path,
      section: section || undefined,
      displayText: displayText || undefined,
    });
  }
  return results;
}

/**
 * Resolve a wiki-link path relative to the current document's directory.
 * - "/absolute/path" → resolved from vault root
 * - "relative/path" → resolved from current doc's directory
 * - "name" → same directory
 * Appends .md if not present.
 */
export function resolveWikiLinkPath(
  linkPath: string,
  currentDocDir: string,
): string {
  let resolved: string;
  if (linkPath.startsWith("/")) {
    // Absolute from vault root — strip leading slash
    resolved = linkPath.slice(1);
  } else {
    // Relative to current document's directory
    resolved = currentDocDir ? `${currentDocDir}/${linkPath}` : linkPath;
  }
  // Normalize path: remove double slashes, resolve . and ..
  // `..` beyond the vault root is clamped (discarded) rather than emitted as
  // a literal `..` segment, so the resolver can never produce a path that
  // escapes the vault. See DOC-4.8-13.
  const parts = resolved.split("/").filter(Boolean);
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (normalized.length > 0) normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  resolved = normalized.join("/");
  // Append .md only if no file extension is present at all
  if (!resolved.includes(".") || resolved.lastIndexOf(".") < resolved.lastIndexOf("/")) {
    resolved += ".md";
  }
  return resolved;
}

/**
 * Replace all wiki-link references to oldPath with newPath in markdown content.
 * Returns the updated markdown string.
 */
export function updateWikiLinkPaths(
  markdown: string,
  oldPath: string,
  newPath: string,
): string {
  // Strip .md for comparison
  const oldBase = oldPath.replace(/\.(md|json)$/, "");
  const newBase = newPath.replace(/\.(md|json)$/, "");
  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, inner: string) => {
    const [pathAndSection, displayText] = inner.split("|").map((s: string) => s.trim());
    const [linkPath, section] = pathAndSection.split("#").map((s: string) => s.trim());
    const normalized = linkPath.replace(/\.(md|json)$/, "");
    if (normalized === oldBase || normalized === `/${oldBase}`) {
      const prefix = linkPath.startsWith("/") ? "/" : "";
      let replacement = `${prefix}${newBase}`;
      if (section) replacement += `#${section}`;
      if (displayText) replacement += ` | ${displayText}`;
      return `[[${replacement}]]`;
    }
    return fullMatch;
  });
}

/**
 * Rewrite wiki-link section anchors that target a specific doc.
 * Preserves the link path and any alias/display text.
 *
 *   updateWikiLinkAnchors(md, "doc-b.md", { "old-slug": "new-slug", ... })
 *
 * matches `[[doc-b.md#old-slug]]`, `[[doc-b.md#old-slug | alias]]`,
 * `[[/doc-b#old-slug]]`, etc. — all paths whose normalized base equals
 * the targetPath's base, where the existing section is a key in the
 * mapping. Sections not in the mapping are left alone.
 */
export function updateWikiLinkAnchors(
  markdown: string,
  targetPath: string,
  renames: Record<string, string>,
): string {
  if (Object.keys(renames).length === 0) return markdown;
  const targetBase = targetPath.replace(/\.(md|json)$/, "");
  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, inner: string) => {
    const [pathAndSection, displayText] = inner.split("|").map((s: string) => s.trim());
    const [linkPath, section] = pathAndSection.split("#").map((s: string) => s.trim());
    if (!section) return fullMatch;
    const newSection = renames[section];
    if (newSection === undefined) return fullMatch;
    const normalized = linkPath.replace(/\.(md|json)$/, "");
    if (normalized !== targetBase && normalized !== `/${targetBase}`) return fullMatch;
    let replacement = `${linkPath}#${newSection}`;
    if (displayText) replacement += ` | ${displayText}`;
    return `[[${replacement}]]`;
  });
}

/**
 * Strip section anchors from wiki-links targeting a specific doc.
 *
 *   stripWikiLinkAnchors(md, "doc-b.md", ["deleted-section"])
 *
 * matches `[[doc-b.md#deleted-section]]`, `[[doc-b.md#deleted-section | alias]]`,
 * `[[/doc-b#deleted-section]]`, etc., and rewrites them WITHOUT the anchor:
 * `[[doc-b.md]]` or `[[doc-b.md | alias]]`. Path and alias are preserved.
 *
 * Wiki-links to other docs, anchorless wiki-links, and links to anchors not
 * in `deletedIds` are left untouched.
 */
export function stripWikiLinkAnchors(
  markdown: string,
  targetPath: string,
  deletedIds: string[],
): string {
  if (deletedIds.length === 0) return markdown;
  const targetBase = targetPath.replace(/\.(md|json)$/, "");
  const deletedSet = new Set(deletedIds);
  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, inner: string) => {
    const [pathAndSection, displayText] = inner.split("|").map((s: string) => s.trim());
    const [linkPath, section] = pathAndSection.split("#").map((s: string) => s.trim());
    if (!section || !deletedSet.has(section)) return fullMatch;
    const normalized = linkPath.replace(/\.(md|json)$/, "");
    if (normalized !== targetBase && normalized !== `/${targetBase}`) return fullMatch;
    let replacement = linkPath;
    if (displayText) replacement += ` | ${displayText}`;
    return `[[${replacement}]]`;
  });
}

/**
 * Remove all wiki-links that reference a specific document path.
 * Strips wiki-link syntax including aliases and section anchors.
 * Returns the markdown with matching links replaced by empty string.
 */
export function stripWikiLinksForPath(markdown: string, deletedDocPath: string): string {
  const deletedBase = deletedDocPath.replace(/\.(md|json)$/, "");
  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, inner: string) => {
    const [pathAndSection] = inner.split("|").map((s: string) => s.trim());
    const [linkPath] = pathAndSection.split("#").map((s: string) => s.trim());
    const normalized = linkPath.replace(/\.(md|json)$/, "");
    if (normalized === deletedBase || normalized === `/${deletedBase}`) {
      return "";
    }
    return fullMatch;
  });
}
