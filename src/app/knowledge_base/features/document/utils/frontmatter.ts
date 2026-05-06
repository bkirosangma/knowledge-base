/**
 * Constrained frontmatter parser used to round-trip metadata fields we own
 * (currently `sources`) while preserving any other keys a user has placed in
 * the YAML block.
 *
 * Supports a flat YAML map at the top of a Markdown file delimited by
 * `---` fences. Values may be:
 *   - a string scalar (`title: foo`)
 *   - an inline list (`tags: [a, b, c]`) — round-tripped verbatim
 *   - the structured `sources:` array we own (each entry `{ url, title? }`)
 *
 * Anything we don't recognise is preserved as raw YAML and re-emitted
 * unchanged before our managed keys.
 *
 * Out of scope (intentionally not supported): nested objects beyond the
 * `sources` block-list array, multi-line scalars (`|`, `>`), YAML anchors
 * & aliases, comments inside the frontmatter, and the inline JSON-like
 * form `sources: [{url: "..."}]`. If the parser can't make sense of the
 * frontmatter it falls back to "no frontmatter" and returns the input
 * verbatim as `body`.
 */

import type { SourceLink } from "../../../shared/types/sources";

export interface ParsedFrontmatter {
  /** Parsed managed fields (currently only `sources`). */
  data: { sources?: SourceLink[] };
  /** Raw YAML for any keys we don't manage; null when no frontmatter. */
  rawYaml: string | null;
  /** Document body after the closing `---` fence (or the whole file if no frontmatter). */
  body: string;
}

export interface SerializeFrontmatterInput {
  data: { sources?: SourceLink[] };
  rawYaml?: string | null;
  body: string;
}

const FENCE = "---";

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const noFrontmatter: ParsedFrontmatter = { data: {}, rawYaml: null, body: text };

  if (!text.startsWith(FENCE + "\n") && text !== FENCE && !text.startsWith(FENCE + "\r\n")) {
    return noFrontmatter;
  }

  const lines = text.split("\n");
  if (lines[0].trim() !== FENCE) return noFrontmatter;

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FENCE) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) return noFrontmatter;

  const yamlLines = lines.slice(1, closeIdx);
  let parsed: { sources?: SourceLink[]; rawYamlLines: string[] };
  try {
    parsed = parseYamlLines(yamlLines);
  } catch {
    return noFrontmatter;
  }

  const body = lines.slice(closeIdx + 1).join("\n");

  const data: { sources?: SourceLink[] } = {};
  if (parsed.sources !== undefined) data.sources = parsed.sources;

  return {
    data,
    rawYaml: parsed.rawYamlLines.join("\n"),
    body,
  };
}

export function serializeFrontmatter(input: SerializeFrontmatterInput): string {
  const sources = input.data.sources;
  const hasSources = Array.isArray(sources) && sources.length > 0;
  const rawYaml = input.rawYaml ?? null;
  const hasRaw = rawYaml !== null && rawYaml !== "";

  if (!hasSources && !hasRaw) {
    return input.body;
  }

  const parts: string[] = [FENCE];
  if (hasRaw) {
    parts.push(rawYaml as string);
  }
  if (hasSources) {
    parts.push("sources:");
    for (const s of sources as SourceLink[]) {
      parts.push(`  - url: ${quoteYamlScalar(s.url)}`);
      if (typeof s.title === "string" && s.title !== "") {
        parts.push(`    title: ${quoteYamlScalar(s.title)}`);
      }
    }
  }
  parts.push(FENCE);
  return parts.join("\n") + "\n" + input.body;
}

function parseYamlLines(yamlLines: string[]): {
  sources?: SourceLink[];
  rawYamlLines: string[];
} {
  const rawYamlLines: string[] = [];
  let sources: SourceLink[] | undefined;
  let i = 0;

  while (i < yamlLines.length) {
    const line = yamlLines[i];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      rawYamlLines.push(line);
      i++;
      continue;
    }

    const sourcesMatch = /^sources\s*:\s*(.*)$/.exec(line);
    if (sourcesMatch && sourcesMatch[1].trim() === "" && /^[^\s]/.test(line)) {
      const block: string[] = [];
      i++;
      while (i < yamlLines.length) {
        const next = yamlLines[i];
        if (next.trim() === "") {
          block.push(next);
          i++;
          continue;
        }
        if (/^\s/.test(next)) {
          block.push(next);
          i++;
          continue;
        }
        break;
      }
      const parsedSources = parseSourcesBlock(block);
      if (parsedSources === null) {
        throw new Error("malformed sources block");
      }
      sources = parsedSources;
      continue;
    }

    rawYamlLines.push(line);
    i++;
  }

  return { sources, rawYamlLines };
}

function parseSourcesBlock(lines: string[]): SourceLink[] | null {
  const out: SourceLink[] = [];
  let current: SourceLink | null = null;

  for (const line of lines) {
    if (line.trim() === "") continue;
    const itemMatch = /^(\s*)-\s+(.*)$/.exec(line);
    if (itemMatch) {
      if (current) out.push(current);
      current = { url: "" };
      const rest = itemMatch[2];
      const kv = parseKeyValue(rest);
      if (!kv) return null;
      applyKey(current, kv.key, kv.value);
      continue;
    }
    const propMatch = /^\s+(.*)$/.exec(line);
    if (propMatch && current) {
      const kv = parseKeyValue(propMatch[1]);
      if (!kv) return null;
      applyKey(current, kv.key, kv.value);
      continue;
    }
    return null;
  }
  if (current) out.push(current);

  for (const s of out) {
    if (typeof s.url !== "string" || s.url === "") return null;
  }
  return out;
}

function applyKey(target: SourceLink, key: string, value: string): void {
  if (key === "url") target.url = value;
  else if (key === "title") target.title = value;
}

function parseKeyValue(input: string): { key: string; value: string } | null {
  const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(input);
  if (!m) return null;
  const key = m[1];
  const rawValue = m[2].trim();
  if (rawValue === "") return { key, value: "" };
  return { key, value: unquoteYamlScalar(rawValue) };
}

function unquoteYamlScalar(value: string): string {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

function quoteYamlScalar(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
