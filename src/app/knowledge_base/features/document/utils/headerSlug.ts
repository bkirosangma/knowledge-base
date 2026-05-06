/**
 * Convert a heading's text into a stable URL-safe id. Used as the anchor target
 * for `[[doc#header]]` links and for indexing headers in the link index.
 */
export function headerSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")   // strip punctuation
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
