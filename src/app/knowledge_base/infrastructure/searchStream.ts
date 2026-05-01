// Read-side helper that streams a vault path's contents to the search
// worker (KB-010b). Knows how to pull the indexable fields out of `.md`
// (body) and `.json` diagrams (title + layer titles + node labels +
// flow names + node sub-labels).
//
// Returns null for unrecognised extensions or unreadable files. Errors
// are mapped to FileSystemError via `classifyError` so the shell error
// surface can decide whether to report or swallow them.

import type { DocFields, DocKind } from "../features/search/VaultIndex";
import type { DiagramData } from "../shared/utils/types";
import { createDocumentRepository } from "./documentRepo";
import { createDiagramRepository } from "./diagramRepo";
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
