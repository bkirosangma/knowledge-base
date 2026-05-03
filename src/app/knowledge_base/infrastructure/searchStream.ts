// Read-side helper that streams a vault path's contents to the search
// worker (KB-010b). Knows how to pull the indexable fields out of `.md`
// (body), `.json` diagrams (title + layer titles + node labels +
// flow names + node sub-labels), and `.alphatex` tabs (title +
// concatenated metadata body per TAB-011).
//
// Returns null for unrecognised extensions or unreadable files. Errors
// are mapped to FileSystemError via `classifyError` so the shell error
// surface can decide whether to report or swallow them.

import type { DocFields, DocKind } from "../features/search/VaultIndex";
import { tokenize } from "../features/search/tokenizer";
import type { DiagramData } from "../shared/utils/types";
import { createDocumentRepository } from "./documentRepo";
import { createDiagramRepository } from "./diagramRepo";
import { createTabRepository } from "./tabRepo";
import { parseAlphatexHeader, type AlphatexHeader } from "./alphatexHeader";
import { readOrNull } from "../domain/repositoryHelpers";

export interface SearchableDoc {
  path: string;
  kind: DocKind;
  fields: DocFields;
}

/** Read `path` from `rootHandle` and return the data the search worker
 *  needs to (re)index it. Returns null for non-indexable extensions or
 *  when the file is missing/malformed. */
export async function readForSearchIndex(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
): Promise<SearchableDoc | null> {
  if (path.endsWith(".md")) {
    const docRepo = createDocumentRepository(rootHandle);
    const body = await readOrNull(() => docRepo.read(path));
    if (body === null) return null;
    return { path, kind: "doc", fields: { body } };
  }
  if (path.endsWith(".json")) {
    const diagramRepo = createDiagramRepository(rootHandle);
    const data = await readOrNull(() => diagramRepo.read(path));
    if (data === null) return null;
    return { path, kind: "diagram", fields: diagramFields(data) };
  }
  if (path.endsWith(".alphatex")) {
    const tabRepo = createTabRepository(rootHandle);
    const text = await readOrNull(() => tabRepo.read(path));
    if (text === null) return null;
    return { path, kind: "tab", fields: tabFields(parseAlphatexHeader(text)) };
  }
  return null;
}

/** Find the first node in `diagramPath` whose label or sub-label contains
 *  any tokenised term in `query`. Used by the search UI to populate
 *  `PaneEntry.searchTarget` when a diagram-side hit is clicked, so the
 *  receiving `DiagramView` knows which node to centre + select. Returns
 *  null when no match is found (the diagram still opens, just without a
 *  centring intent).
 *
 *  Loose matching by design: the index ranks the diagram by all its
 *  searchable fields, but the user "expected" a label to land on a
 *  node, so any token hit is enough. */
export async function findFirstNodeMatching(
  rootHandle: FileSystemDirectoryHandle,
  diagramPath: string,
  query: string,
): Promise<string | null> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  const diagramRepo = createDiagramRepository(rootHandle);
  const data = await readOrNull(() => diagramRepo.read(diagramPath));
  if (!data) return null;
  return firstNodeMatchingTokens(data, tokens);
}

/** Pure helper exported for tests: scan nodes for the first whose label
 *  or sub-label contains any of the tokens. */
export function firstNodeMatchingTokens(
  data: DiagramData,
  tokens: string[],
): string | null {
  if (tokens.length === 0) return null;
  for (const node of data.nodes) {
    const hay = `${node.label ?? ""} ${node.sub ?? ""}`.toLowerCase();
    for (const t of tokens) {
      if (hay.includes(t)) return node.id;
    }
  }
  return null;
}

/** Pure mapping `DiagramData` → searchable fields. Exported for unit
 *  tests so we don't need to drive the FS layer just to assert
 *  field-extraction behaviour. */
export function diagramFields(data: DiagramData): DocFields {
  const nodeLabels: string[] = [];
  for (const n of data.nodes) {
    if (n.label) nodeLabels.push(n.label);
    if (n.sub) nodeLabels.push(n.sub);
  }
  return {
    title: data.title,
    layerTitles: data.layers.map((l) => l.title).filter(Boolean),
    nodeLabels,
    flowNames: (data.flows ?? []).map((f) => f.name).filter(Boolean),
  };
}

/** Pure mapping `AlphatexHeader` → searchable fields. Per TAB-011 design B1
 *  the recipe `{ title, artist, key, tuning, tracks, body: lyrics }` is
 *  squeezed into the existing `DocFields { title, body }` shape: title
 *  takes the alphaTex `\title`, body takes everything else joined by
 *  spaces. Per-field relevance ranking is a parked follow-up. */
export function tabFields(header: AlphatexHeader): DocFields {
  const bodyParts: string[] = [];
  if (header.artist) bodyParts.push(header.artist);
  if (header.album) bodyParts.push(header.album);
  if (header.subtitle) bodyParts.push(header.subtitle);
  if (header.key) bodyParts.push(header.key);
  if (header.tuning.length > 0) bodyParts.push(header.tuning.join(" "));
  if (header.trackNames.length > 0) bodyParts.push(header.trackNames.join(", "));
  if (header.lyrics) bodyParts.push(header.lyrics);
  return {
    title: header.title,
    body: bodyParts.join(" "),
  };
}
