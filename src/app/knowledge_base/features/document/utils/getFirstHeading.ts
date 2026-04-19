/**
 * Extract the document's display title from its raw markdown body.
 *
 * Priority:
 *   1. First ATX H1 (`# Heading`) — the canonical title in a knowledge-base doc.
 *   2. Otherwise the first non-empty, non-frontmatter, non-horizontal-rule line,
 *      with any leading markdown markers stripped (so `## Foo`, `- Bar`, `> Baz`
 *      all surface as "Foo" / "Bar" / "Baz").
 *   3. Empty string if the document is empty.
 *
 * YAML frontmatter at the top of the file (`---\n…\n---`) is skipped — the
 * title is read from the body, not the metadata.
 *
 * Used by the document pane header to show the H1 next to Save / Discard
 * instead of the file name. Read-only: edits happen in the editor body, and
 * this reflects back on the next keystroke (debounced by the caller).
 */
export function getFirstHeading(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  let i = 0;

  // Skip YAML frontmatter (``---`` fence at line 0, closed by another ``---``).
  if (lines[0]?.trim() === "---") {
    i = 1;
    while (i < lines.length && lines[i].trim() !== "---") i++;
    if (i < lines.length) i++;
  }

  let firstNonEmpty: string | null = null;

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Prefer ATX H1 anywhere in the body (`# Foo`, `#  Foo bar`).
    const h1 = /^#\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (h1) return h1[1].trim();

    if (firstNonEmpty === null) firstNonEmpty = trimmed;
  }

  if (firstNonEmpty === null) return "";
  // Strip one leading marker class so list items / other headings / blockquotes
  // don't leak their marker into the pane title.
  return firstNonEmpty
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+>]\s+/, "")
    .trim();
}
