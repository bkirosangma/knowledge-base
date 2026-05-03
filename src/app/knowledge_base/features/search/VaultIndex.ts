// Vault search inverted index (KB-010 / SEARCH-8.2).
//
// In-memory `Map<token, Posting[]>` keyed by token. Each posting links a
// token back to one (path, field) tuple plus the character offsets where
// the token appears in that field's text. The index also stores the
// per-field source text so `query` can produce ±40-char snippets without
// going back to the file system.
//
// Prefix matching for the last query token is implemented as a linear
// scan of map keys using `String.prototype.startsWith`. For the target
// vault size (~200 docs / a few thousand unique tokens) this comfortably
// stays under the 50 ms latency budget asserted in `VaultIndex.test.ts`.
// A trie / sorted-key structure can be slotted in later if a benchmark
// shows it's worth the complexity.

import { tokenize, tokenizeWithPositions } from "./tokenizer";

export type DocKind = "doc" | "diagram" | "tab";
export type Field = "body" | "title" | "label" | "flow";

/** Caller-supplied content split by indexable field. All fields optional —
 *  diagrams typically have title / label / flow but no body; markdown
 *  documents typically have body only. */
export interface DocFields {
  body?: string;
  title?: string;
  layerTitles?: string[];
  nodeLabels?: string[];
  flowNames?: string[];
}

interface Posting {
  path: string;
  kind: DocKind;
  field: Field;
  positions: number[];
}

export interface FieldHit {
  field: Field;
  /** Earliest character offset of any matching token within the field's
   *  source text. Drives snippet placement. */
  firstPosition: number;
}

export interface SearchResult {
  path: string;
  kind: DocKind;
  /** One entry per field that contributed at least one hit, ordered by
   *  field priority (body → title → label → flow). */
  fieldHits: FieldHit[];
  /** ±40 character snippet around the first body match — or first
   *  non-body match when the body has none. Empty string if no field
   *  yielded usable text. */
  snippet: string;
  /** Raw hit count across all fields. Used for ordering only — not a
   *  semantic relevance score. */
  score: number;
}

interface DocEntry {
  path: string;
  kind: DocKind;
  /** The exact text indexed for each field, keyed by field. Layer titles,
   *  node labels, and flow names are joined with " • " before indexing
   *  so positions in postings line up with this stored text. */
  fieldTexts: Map<Field, string>;
}

const FIELD_ORDER: readonly Field[] = ["body", "title", "label", "flow"];
const SNIPPET_RADIUS = 40;
const FIELD_JOINER = " • ";

export class VaultIndex {
  private postings = new Map<string, Posting[]>();
  private docs = new Map<string, DocEntry>();

  size(): number {
    return this.docs.size;
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  clear(): void {
    this.postings.clear();
    this.docs.clear();
  }

  /** Idempotent: re-adding the same path replaces the previous entry. */
  addDoc(path: string, kind: DocKind, fields: DocFields): void {
    if (this.docs.has(path)) this.removeDoc(path);

    const fieldTexts = new Map<Field, string>();

    if (fields.body) fieldTexts.set("body", fields.body);

    const titleParts: string[] = [];
    if (fields.title) titleParts.push(fields.title);
    if (fields.layerTitles) titleParts.push(...fields.layerTitles);
    if (titleParts.length > 0) fieldTexts.set("title", titleParts.join(FIELD_JOINER));

    if (fields.nodeLabels && fields.nodeLabels.length > 0) {
      fieldTexts.set("label", fields.nodeLabels.join(FIELD_JOINER));
    }
    if (fields.flowNames && fields.flowNames.length > 0) {
      fieldTexts.set("flow", fields.flowNames.join(FIELD_JOINER));
    }

    for (const [field, text] of fieldTexts) {
      this.indexField(path, kind, field, text);
    }

    this.docs.set(path, { path, kind, fieldTexts });
  }

  removeDoc(path: string): void {
    if (!this.docs.has(path)) return;
    for (const [token, list] of this.postings) {
      const filtered = list.filter((p) => p.path !== path);
      if (filtered.length === 0) {
        this.postings.delete(token);
      } else if (filtered.length !== list.length) {
        this.postings.set(token, filtered);
      }
    }
    this.docs.delete(path);
  }

  /** AND-of-tokens with prefix matching on the final token. Returns the
   *  top `limit` results ordered by hit count (highest first). */
  query(input: string, limit = 50): SearchResult[] {
    const tokens = tokenize(input);
    if (tokens.length === 0) return [];

    const exactTokens = tokens.slice(0, -1);
    const prefixToken = tokens[tokens.length - 1];

    // Per-position-slot posting lists. Each slot represents one query
    // token; a result must have at least one posting in every slot.
    const tokenSlots: Posting[][] = [];

    for (const t of exactTokens) {
      const list = this.postings.get(t);
      if (!list) return []; // missing required term short-circuits
      tokenSlots.push(list);
    }

    const prefixSlot: Posting[] = [];
    for (const [key, list] of this.postings) {
      if (key === prefixToken || key.startsWith(prefixToken)) {
        prefixSlot.push(...list);
      }
    }
    if (prefixSlot.length === 0) return [];
    tokenSlots.push(prefixSlot);

    // Group postings by path, tracking which slots each path has hits in.
    const pathSlots = new Map<string, Map<number, Posting[]>>();
    for (let i = 0; i < tokenSlots.length; i++) {
      for (const post of tokenSlots[i]) {
        let entry = pathSlots.get(post.path);
        if (!entry) {
          entry = new Map();
          pathSlots.set(post.path, entry);
        }
        const slot = entry.get(i);
        if (slot) slot.push(post);
        else entry.set(i, [post]);
      }
    }

    const results: SearchResult[] = [];
    for (const [path, hitsBySlot] of pathSlots) {
      if (hitsBySlot.size !== tokenSlots.length) continue; // missing a required token

      const doc = this.docs.get(path);
      if (!doc) continue;

      const fieldFirstPos = new Map<Field, number>();
      let totalHits = 0;
      for (const [, posts] of hitsBySlot) {
        for (const p of posts) {
          totalHits += p.positions.length;
          for (const pos of p.positions) {
            const cur = fieldFirstPos.get(p.field);
            if (cur === undefined || pos < cur) fieldFirstPos.set(p.field, pos);
          }
        }
      }

      const fieldHits: FieldHit[] = Array.from(fieldFirstPos, ([field, firstPosition]) => ({
        field,
        firstPosition,
      })).sort((a, b) => FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field));

      results.push({
        path,
        kind: doc.kind,
        fieldHits,
        snippet: buildSnippet(doc, fieldHits),
        score: totalHits,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private indexField(path: string, kind: DocKind, field: Field, text: string): void {
    const positionsByToken = new Map<string, number[]>();
    for (const { token, position } of tokenizeWithPositions(text)) {
      const arr = positionsByToken.get(token);
      if (arr) arr.push(position);
      else positionsByToken.set(token, [position]);
    }
    for (const [token, positions] of positionsByToken) {
      const list = this.postings.get(token);
      const posting: Posting = { path, kind, field, positions };
      if (list) list.push(posting);
      else this.postings.set(token, [posting]);
    }
  }
}

function buildSnippet(doc: DocEntry, fieldHits: FieldHit[]): string {
  // Prefer body for snippet placement; fall back to the first non-body
  // hit that has stored text.
  const bodyHit = fieldHits.find((h) => h.field === "body");
  const chosen = bodyHit ?? fieldHits[0];
  if (!chosen) return "";
  const text = doc.fieldTexts.get(chosen.field);
  if (!text) return "";
  return sliceAround(text, chosen.firstPosition, SNIPPET_RADIUS);
}

function sliceAround(text: string, position: number, radius: number): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}
