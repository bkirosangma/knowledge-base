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
  const oldBase = oldPath.replace(/\.md$/, "");
  const newBase = newPath.replace(/\.md$/, "");
  return markdown.replace(WIKI_LINK_REGEX, (fullMatch, inner: string) => {
    const [pathAndSection, displayText] = inner.split("|").map((s: string) => s.trim());
    const [linkPath, section] = pathAndSection.split("#").map((s: string) => s.trim());
    const normalized = linkPath.replace(/\.md$/, "");
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
