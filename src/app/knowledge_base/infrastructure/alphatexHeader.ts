/**
 * Pure synchronous parser for the alphaTex header directives the vault
 * search index + wiki-link parser need. Reads only the metadata grammar
 * (\\title, \\artist, \\album, \\subtitle, \\tempo, \\key, \\tuning,
 * \\track, \\lyrics) and the `// references: [[...]]` comment line. The
 * note-body is intentionally ignored — alphaTab's Score parser handles
 * rendering; this module handles indexing.
 *
 * No DOM, no async, no dependency on alphaTab. Cheap to call at index
 * time across a whole vault.
 */

export interface AlphatexHeader {
  title: string;
  artist?: string;
  album?: string;
  subtitle?: string;
  tempo?: number;
  key?: string;
  tuning: string[];
  trackNames: string[];
  lyrics?: string;
  /** Raw inner contents of every `[[…]]` token found on lines starting with
   *  `// references:`. Path resolution + `#section` / `|alias` splitting are
   *  the wiki-link parser's job; this just hands back the raw inner text. */
  references: string[];
}

// alphaTex accepts either single- or double-quoted strings (see plan
// header for grammar verification notes). The capture group below
// matches whichever quote style the author used.
const QUOTED_DIRECTIVE = (name: string) =>
  new RegExp(`^\\s*\\\\${name}\\s+(?:"([^"]*)"|'([^']*)')`, "m");

const NUMERIC_DIRECTIVE = (name: string) =>
  new RegExp(`^\\s*\\\\${name}\\s+([0-9]+(?:\\.[0-9]+)?)`, "m");

const TUNING_LINE = /^\s*\\tuning\s+(.+?)(?:\/\/.*)?$/m;
const TRACK_LINE = /^\s*\\track\s+(?:"([^"]*)"|'([^']*)')/gm;
const REFERENCES_LINE = /^\s*\/\/\s*references\s*:\s*(.*)$/gim;
const WIKI_INNER = /\[\[\s*([^\]]+?)\s*\]\]/g;

function matchString(src: string, name: string): string | undefined {
  const m = src.match(QUOTED_DIRECTIVE(name));
  // Group 1 = double-quoted form, group 2 = single-quoted form.
  if (!m) return undefined;
  return m[1] ?? m[2];
}

function matchNumber(src: string, name: string): number | undefined {
  const m = src.match(NUMERIC_DIRECTIVE(name));
  return m ? Number(m[1]) : undefined;
}

function parseTuning(src: string): string[] {
  const m = src.match(TUNING_LINE);
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean);
}

function parseTrackNames(src: string): string[] {
  const out: string[] = [];
  // Group 1 = double-quoted name, group 2 = single-quoted name.
  for (const m of src.matchAll(TRACK_LINE)) out.push(m[1] ?? m[2]);
  return out;
}

function parseReferences(src: string): string[] {
  const out: string[] = [];
  for (const lineMatch of src.matchAll(REFERENCES_LINE)) {
    const tail = lineMatch[1] ?? "";
    for (const wiki of tail.matchAll(WIKI_INNER)) {
      out.push(wiki[1].trim());
    }
  }
  return out;
}

export function parseAlphatexHeader(text: string): AlphatexHeader {
  const src = text.replace(/\r\n/g, "\n");

  const result: AlphatexHeader = {
    title: matchString(src, "title") ?? "",
    tuning: parseTuning(src),
    trackNames: parseTrackNames(src),
    references: parseReferences(src),
  };

  const artist = matchString(src, "artist");
  if (artist !== undefined) result.artist = artist;

  const album = matchString(src, "album");
  if (album !== undefined) result.album = album;

  const subtitle = matchString(src, "subtitle");
  if (subtitle !== undefined) result.subtitle = subtitle;

  const tempo = matchNumber(src, "tempo");
  if (tempo !== undefined) result.tempo = tempo;

  const key = matchString(src, "key");
  if (key !== undefined) result.key = key;

  const lyrics = matchString(src, "lyrics");
  if (lyrics !== undefined) result.lyrics = lyrics;

  return result;
}
