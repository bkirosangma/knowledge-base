/**
 * Unlinked-mentions detector. Pure functions; consumed by
 * `UnlinkedMentions.tsx` and the document view's "Convert all" plumbing.
 *
 * Approach:
 *   1. Strip every `[[...]]` wiki-link occurrence from the markdown body
 *      so we don't propose converting tokens that are already inside a
 *      link. We keep the rest of the text (including code fences) — the
 *      user can decide whether to convert mentions inside code; doing
 *      so is harmless because Tiptap's wiki-link extension won't render
 *      inside code blocks anyway.
 *   2. Tokenize the stripped text with `/\b\w+\b/g`.
 *   3. For each unique token (length ≥ 4, lowercase) match against
 *      vault filename basenames (without extension) — case-insensitive.
 *      A common-word stoplist filters obvious noise.
 *   4. Skip self-references (the current document's own basename).
 *   5. Cap at 50 hits.
 */

const COMMON_STOPLIST = new Set<string>([
  "this", "that", "with", "from", "have", "your", "their", "would", "could",
  "about", "there", "where", "when", "what", "which", "while", "after",
  "before", "into", "onto", "over", "under", "than", "then", "they", "them",
  "were", "been", "being", "such", "some", "more", "most", "also", "even",
  "just", "only", "very", "much", "many", "each", "other", "another",
  "between", "through", "within", "without", "because", "since", "though",
  "should", "might", "must", "shall", "will", "does", "doing", "done",
]);

const WIKI_LINK_RE = /\[\[[^\]]*\]\]/g;
const TOKEN_RE = /\b\w+\b/g;

export interface UnlinkedMention {
  /** The exact-cased token as it appears in the document. */
  token: string;
  /** Number of unlinked occurrences in the body. */
  count: number;
  /** Vault file path that this token resolves to (`.md` or `.json`). */
  targetPath: string;
  /** Display basename without extension. */
  targetBasename: string;
}

interface DetectArgs {
  /** Markdown body of the current document. */
  content: string;
  /** All vault file paths (.md / .json). Source: `tree` walk. */
  allFilePaths: string[];
  /** Path of the doc currently being edited (for self-skip). */
  currentPath?: string | null;
  /** Maximum number of hits to return (default 50). */
  cap?: number;
}

function basenameNoExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.substring(0, dot);
}

/**
 * Build a lowercase basename → preferred filePath map. When two files
 * share a basename across different folders the first one in the list
 * wins (matches `useLinkIndex`'s resolution preference for ambiguous
 * `[[name]]` lookups: relative-first, then root, but we don't have a
 * docDir here — first-hit is good enough for surfacing).
 */
function buildBasenameMap(allFilePaths: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const path of allFilePaths) {
    if (!path.endsWith(".md") && !path.endsWith(".json")) continue;
    const key = basenameNoExt(path).toLowerCase();
    if (!map.has(key)) map.set(key, path);
  }
  return map;
}

/** Strip every `[[...]]` block so its inner text doesn't tokenize. */
export function stripWikiLinks(content: string): string {
  return content.replace(WIKI_LINK_RE, "");
}

/**
 * Detect unlinked mentions in a markdown body. Returns at most `cap`
 * results, sorted by count descending then alphabetically.
 */
export function detectUnlinkedMentions({
  content,
  allFilePaths,
  currentPath,
  cap = 50,
}: DetectArgs): UnlinkedMention[] {
  if (!content) return [];
  const stripped = stripWikiLinks(content);
  const basenameMap = buildBasenameMap(allFilePaths);
  const selfBasename = currentPath ? basenameNoExt(currentPath).toLowerCase() : null;

  const counts = new Map<string, { token: string; count: number; targetPath: string; targetBasename: string }>();

  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(stripped))) {
    const raw = match[0];
    if (raw.length < 4) continue;
    const lc = raw.toLowerCase();
    if (COMMON_STOPLIST.has(lc)) continue;
    if (selfBasename && lc === selfBasename) continue;
    const targetPath = basenameMap.get(lc);
    if (!targetPath) continue;
    const existing = counts.get(lc);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(lc, {
        token: raw,
        count: 1,
        targetPath,
        targetBasename: basenameNoExt(targetPath),
      });
    }
  }

  const out = Array.from(counts.values());
  out.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.token.localeCompare(b.token);
  });
  return out.slice(0, cap);
}

/**
 * Convert every unlinked occurrence of `token` in `content` to
 * `[[targetBasename]]`. Skips occurrences already inside a `[[...]]`
 * block (those are detected by mask-and-restore — we substitute every
 * `[[...]]` with a placeholder, replace `\btoken\b` in the rest, then
 * splice the placeholders back).
 *
 * Returns the new content (or the input untouched if there are no
 * matches). Case-insensitive on the token boundary.
 */
export function convertMention(
  content: string,
  token: string,
  targetBasename: string,
): string {
  if (!content || !token) return content;
  // Mask wiki-link blocks with a sentinel so they survive the global
  // replace untouched. The sentinel uses chars that can't appear in
  // user content (NUL won't survive the round-trip; Unicode private
  // use area is safer).
  const placeholders: string[] = [];
  const SENTINEL = "UML";
  const masked = content.replace(WIKI_LINK_RE, (m) => {
    const idx = placeholders.length;
    placeholders.push(m);
    return `${SENTINEL}${idx}${SENTINEL}`;
  });

  // Escape regex metachars in `token` for the boundary match.
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "gi");
  const replaced = masked.replace(re, `[[${targetBasename}]]`);

  // Restore wiki-link blocks.
  return replaced.replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"),
    (_full, idx) => placeholders[Number(idx)] ?? _full,
  );
}
