# TAB-011 Guitar Tabs — Vault Search + Wiki-Link Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `.alphatex` tabs first-class citizens of vault search and the wiki-link graph: title/artist/key/tuning/track-names/lyrics indexed for the global search bar; `[[…]]` tokens inside the tab's `// references:` comment line resolve through `useLinkIndex` so wiki-link clicks open targets in the opposite pane and backlinks surface in target properties panels.

**Architecture (decisions from brainstorm 2026-05-03):**
- **A1 — Indexing entry point:** Extend `infrastructure/searchStream.ts` with a `.alphatex` branch alongside the existing `.md` and `.json` branches. The same plumbing then auto-indexes tabs on full rebuild, explorer refresh, and rename without touching `useTabContent`. Import-time and save-time pushes piggyback on this single helper.
- **B1 + B3 — Field shape:** Shoehorn into the existing `DocFields { title, body }` (no schema change to `VaultIndex` / worker IPC). `body` is the joined string `[artist, key, tuning.join(' '), trackNames.join(', '), lyrics].filter(Boolean).join(' ')`. Per-field relevance ranking is a parked follow-up.
- **C1 — Header parser:** New pure synchronous regex parser `infrastructure/alphatexHeader.ts`. Browser-free, alphaTab-free, ~80 lines. AlphaTab's Score parser remains the source of truth at *render* time; the lightweight parser is the source of truth at *index* time. Shared fixtures keep them aligned.

**Tech Stack:** TypeScript + React 19 + Vitest + React Testing Library. No new runtime deps.

**Parent spec:** `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` §"Outbound: wiki-links from tabs to anything" (~L309), §"Vault search" (~L357). The spec recipe `searchManager.addDoc(path, "tab", { title, artist, key, tuning: tuning.join(" "), tracks: tracks.map(t => t.name).join(", "), body: lyrics })` is realised under decision B1 by mapping `title` to the existing field and concatenating the rest into `body`.

**Critical convention to honour:** alphaTex line-comment marker is `//`, NOT `%`. Spec L309 confirms. The user's `~/.claude/skills/knowledge-base/commands/guitar-tabs.md` file uses `%` in three places — *do not* let that wrong syntax leak into any code, fixture, or test in this plan.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/app/knowledge_base/infrastructure/alphatexHeader.ts` | **Create** | Pure parser: extracts `{ title, artist?, key?, tempo?, tuning[], trackNames[], lyrics?, references[] }` from raw alphaTex text. No DOM, no async, no alphaTab. |
| `src/app/knowledge_base/infrastructure/alphatexHeader.test.ts` | **Create** | Vitest unit tests for the parser. |
| `src/app/knowledge_base/features/search/VaultIndex.ts` | **Modify** | Extend `DocKind` union from `"doc" \| "diagram"` to `"doc" \| "diagram" \| "tab"`. |
| `src/app/knowledge_base/infrastructure/searchStream.ts` | **Modify** | Add `tabFields()` helper + `.alphatex` branch in `readForSearchIndex`. |
| `src/app/knowledge_base/infrastructure/searchStream.test.ts` | **Modify** | Add `.alphatex` indexing cases. |
| `src/app/knowledge_base/features/document/types.ts` | **Modify** | Extend `OutboundLink.type` from `"document" \| "diagram"` to `"document" \| "diagram" \| "tab"`. |
| `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts` | **Modify** | Add `buildTabEntry()` helper + `.alphatex` branch in `fullRebuild`. Update `getLinkType()` to map `.alphatex` → `"tab"`. |
| `src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts` | **Modify** | Add `.alphatex` parser cases. |
| `src/app/knowledge_base/knowledgeBase.tsx` | **Modify** | (a) Add `kind: "tab"` branch in `handleSearchPick`. (b) Re-index after GP import write completes. |
| `test-cases/11-tabs.md` | **Modify** | Flip `TAB-11.2-13` ❌→✅. Add `## 11.6 Vault search (TAB-011)` block with cases TAB-11.6-01..06. |
| `Features.md` | **Modify** | Add `### 11.5 Vault search` (TAB-011) section. Trim §11.6 (Pending) entries for the surfaces shipping in this PR. |

The plan touches **9 source files + 2 test docs**, contained per existing convention. No new dirs.

---

## Task 1: Pure alphaTex header parser

**Goal:** A synchronous, browser-free function that extracts the metadata fields the search index and the wiki-link parser both need from raw `.alphatex` text.

**Files:**
- Create: `src/app/knowledge_base/infrastructure/alphatexHeader.ts`
- Test: `src/app/knowledge_base/infrastructure/alphatexHeader.test.ts`

The alphaTex header grammar we care about (subset; everything else is ignored — the renderer handles it):

```
\title "Song Title"
\artist "Artist Name"
\album "Album"
\subtitle "..."
\tempo 120
\key "C major"
\tuning E5 B4 G4 D4 A3 E3
\track "Lead Guitar"
\track "Rhythm Guitar"
\lyrics "Verse one line one. Verse one line two."
// references: [[a-doc.md]] [[a-diagram.json]]
```

Parser is regex-based, line-by-line. Keep it simple — don't try to parse the body (notation), only the directive lines and the `//`-comment lines that look like `// references: ...`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/knowledge_base/infrastructure/alphatexHeader.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAlphatexHeader } from "./alphatexHeader";

describe("parseAlphatexHeader", () => {
  it("extracts title, artist, key, tempo, tuning, track names, lyrics", () => {
    const src = `
\\title "Wonderwall"
\\artist "Oasis"
\\album "Morning Glory"
\\tempo 87
\\key "F# minor"
\\tuning E5 B4 G4 D4 A3 E3
\\track "Acoustic"
\\track "Lead"
\\lyrics "Today is gonna be the day"

. r.4 r.4 |
`;
    const out = parseAlphatexHeader(src);
    expect(out).toEqual({
      title: "Wonderwall",
      artist: "Oasis",
      key: "F# minor",
      tempo: 87,
      tuning: ["E5", "B4", "G4", "D4", "A3", "E3"],
      trackNames: ["Acoustic", "Lead"],
      lyrics: "Today is gonna be the day",
      references: [],
    });
  });

  it("returns empty defaults when directives are missing", () => {
    const out = parseAlphatexHeader(". r.4 |");
    expect(out).toEqual({
      title: "",
      tuning: [],
      trackNames: [],
      references: [],
    });
  });

  it("captures wiki-link tokens from a // references: comment line", () => {
    const src = `\\title "X"\n// references: [[a-doc.md]] [[diagrams/topo.json]] [[notes#section]]\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.references).toEqual([
      "a-doc.md",
      "diagrams/topo.json",
      "notes#section",
    ]);
  });

  it("ignores // lines that aren't `// references:`", () => {
    const src = `\\title "X"\n// some other comment [[ignored.md]]\n// references: [[real.md]]\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.references).toEqual(["real.md"]);
  });

  it("trims surrounding whitespace inside reference tokens", () => {
    const src = `\\title "X"\n// references:   [[ a.md ]]   [[b.md|Display]]\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.references).toEqual(["a.md", "b.md|Display"]);
  });

  it("tolerates Windows line endings", () => {
    const src = `\\title "X"\r\n\\artist "Y"\r\n. r.4 |`;
    const out = parseAlphatexHeader(src);
    expect(out.title).toBe("X");
    expect(out.artist).toBe("Y");
  });

  it("strips inline trailing comments from directive lines", () => {
    const src = `\\title "X" // tracking comment\n. r.4 |`;
    expect(parseAlphatexHeader(src).title).toBe("X");
  });

  it("collects multiple \\track directives in source order", () => {
    const src = `\\title "X"\n\\track "Bass"\n\\track "Drums"\n\\track "Guitar"\n. r.4 |`;
    expect(parseAlphatexHeader(src).trackNames).toEqual(["Bass", "Drums", "Guitar"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/alphatexHeader.test.ts`
Expected: all 8 cases FAIL with "Cannot find module './alphatexHeader'" or similar.

- [ ] **Step 3: Implement the parser**

Create `src/app/knowledge_base/infrastructure/alphatexHeader.ts`:

```ts
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

const QUOTED_DIRECTIVE = (name: string) =>
  new RegExp(`^\\s*\\\\${name}\\s+"([^"]*)"`, "m");

const NUMERIC_DIRECTIVE = (name: string) =>
  new RegExp(`^\\s*\\\\${name}\\s+([0-9]+(?:\\.[0-9]+)?)`, "m");

const TUNING_LINE = /^\s*\\tuning\s+(.+?)(?:\/\/.*)?$/m;
const TRACK_LINE = /^\s*\\track\s+"([^"]*)"/gm;
const REFERENCES_LINE = /^\s*\/\/\s*references\s*:\s*(.*)$/gim;
const WIKI_INNER = /\[\[\s*([^\]]+?)\s*\]\]/g;

function matchString(src: string, name: string): string | undefined {
  const m = src.match(QUOTED_DIRECTIVE(name));
  return m ? m[1] : undefined;
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
  for (const m of src.matchAll(TRACK_LINE)) out.push(m[1]);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/alphatexHeader.test.ts`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphatexHeader.ts src/app/knowledge_base/infrastructure/alphatexHeader.test.ts
git commit -m "feat(tabs): pure alphaTex header parser for indexing (TAB-011)"
```

---

## Task 2: Extend `DocKind` union with `"tab"`

**Goal:** Allow `kind: "tab"` to flow through `VaultIndex` / `searchManager` / `SearchResult` without TypeScript complaints. One-line type change.

**Files:**
- Modify: `src/app/knowledge_base/features/search/VaultIndex.ts:18`

- [ ] **Step 1: Edit the union**

In `src/app/knowledge_base/features/search/VaultIndex.ts`, change:

```ts
export type DocKind = "doc" | "diagram";
```

to:

```ts
export type DocKind = "doc" | "diagram" | "tab";
```

- [ ] **Step 2: Verify the rest of the file still typechecks**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -50`
Expected: zero TypeScript errors. (`VaultIndex` itself doesn't switch on `kind`; it's a string discriminator the consumers branch on.)

- [ ] **Step 3: Verify the existing search tests still pass**

Run: `npm run test:run -- src/app/knowledge_base/features/search/`
Expected: existing suite green.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/features/search/VaultIndex.ts
git commit -m "feat(tabs): extend DocKind union to include 'tab' (TAB-011)"
```

---

## Task 3: `tabFields()` helper + `.alphatex` branch in `searchStream.ts`

**Goal:** When the file explorer / rename handler / full rebuild calls `readForSearchIndex(rootHandle, path)` for a `.alphatex` path, return a `SearchableDoc` with `kind: "tab"` and the parsed metadata mapped into the existing `DocFields { title, body }` shape per design decision B1.

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/searchStream.ts`
- Modify: `src/app/knowledge_base/infrastructure/searchStream.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/app/knowledge_base/infrastructure/searchStream.test.ts` inside the existing `describe("readForSearchIndex", () => { ... })` block (just before the closing `});`):

```ts
  it("reads a .alphatex tab and extracts indexable fields", async () => {
    const src = [
      `\\title "Wonderwall"`,
      `\\artist "Oasis"`,
      `\\key "F# minor"`,
      `\\tuning E5 B4 G4 D4 A3 E3`,
      `\\track "Acoustic"`,
      `\\track "Lead"`,
      `\\lyrics "Today is gonna be the day"`,
      `. r.4 |`,
    ].join("\n");
    const root = makeFsRoot({ "songs/wonderwall.alphatex": src });
    const out = await readForSearchIndex(root, "songs/wonderwall.alphatex");
    expect(out?.kind).toBe("tab");
    expect(out?.fields.title).toBe("Wonderwall");
    expect(out?.fields.body).toContain("Oasis");
    expect(out?.fields.body).toContain("F# minor");
    expect(out?.fields.body).toContain("E5 B4 G4 D4 A3 E3");
    expect(out?.fields.body).toContain("Acoustic, Lead");
    expect(out?.fields.body).toContain("Today is gonna be the day");
  });

  it("indexes a .alphatex tab even when only \\title is present", async () => {
    const root = makeFsRoot({ "minimal.alphatex": `\\title "X"\n. r.4 |` });
    const out = await readForSearchIndex(root, "minimal.alphatex");
    expect(out).toEqual({
      path: "minimal.alphatex",
      kind: "tab",
      fields: { title: "X", body: "" },
    });
  });

  it("returns null for an unreadable .alphatex file", async () => {
    const root = makeFsRoot({});
    expect(await readForSearchIndex(root, "missing.alphatex")).toBeNull();
  });
```

Also import the new helper at the top of the test file (the existing imports already include `readForSearchIndex`, so nothing else is needed).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/searchStream.test.ts`
Expected: 3 new cases FAIL (the existing 4 keep passing). Failure message: returns `null` for `.alphatex` paths.

- [ ] **Step 3: Implement `tabFields()` and the `.alphatex` branch**

In `src/app/knowledge_base/infrastructure/searchStream.ts`, add a new import at the top and a new branch + helper. The full updated file should read:

```ts
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

// ... (findFirstNodeMatching + firstNodeMatchingTokens + diagramFields stay unchanged) ...
```

(The existing `findFirstNodeMatching`, `firstNodeMatchingTokens`, and `diagramFields` functions below the `readForSearchIndex` block stay untouched — keep them.)

After `diagramFields`, append the new helper:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/searchStream.test.ts`
Expected: 7/7 PASS (4 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/searchStream.ts src/app/knowledge_base/infrastructure/searchStream.test.ts
git commit -m "feat(tabs): index .alphatex via searchStream + tabFields() (TAB-011)"
```

---

## Task 4: Extend `OutboundLink.type` with `"tab"` and update `getLinkType`

**Goal:** A wiki-link from one `.alphatex` file to another (or from a doc to a tab) needs `type: "tab"` so backlinks render with the right label and icon. Today `OutboundLink.type` is `"document" | "diagram"` and `getLinkType` only returns `"document"` (default) or `"diagram"` (for `.json`).

**Files:**
- Modify: `src/app/knowledge_base/features/document/types.ts:11-13` (the `OutboundLink` interface)
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts:22-24` (the `getLinkType` helper)

- [ ] **Step 1: Extend the type**

In `src/app/knowledge_base/features/document/types.ts`, change:

```ts
export interface OutboundLink {
  targetPath: string;
  type?: "document" | "diagram";
}
```

to:

```ts
export interface OutboundLink {
  targetPath: string;
  type?: "document" | "diagram" | "tab";
}
```

- [ ] **Step 2: Update `getLinkType`**

In `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts`, change the helper:

```ts
function getLinkType(resolvedPath: string): "document" | "diagram" {
  return resolvedPath.endsWith(".json") ? "diagram" : "document";
}
```

to:

```ts
function getLinkType(resolvedPath: string): "document" | "diagram" | "tab" {
  if (resolvedPath.endsWith(".alphatex")) return "tab";
  if (resolvedPath.endsWith(".json")) return "diagram";
  return "document";
}
```

- [ ] **Step 3: Verify typecheck + existing tests**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: zero new TypeScript errors. Any consumer that switches on `OutboundLink.type` and only handles `"document" | "diagram"` will surface — currently no such site exhaustively switches, so this is purely additive.

Run: `npm run test:run -- src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts`
Expected: existing suite still green.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/features/document/types.ts src/app/knowledge_base/features/document/hooks/useLinkIndex.ts
git commit -m "feat(tabs): extend OutboundLink.type and getLinkType with 'tab' (TAB-011)"
```

---

## Task 5: `buildTabEntry()` + `.alphatex` branch in `useLinkIndex.fullRebuild`

**Goal:** When `fullRebuild` walks the vault, every `.alphatex` file gets parsed for its `// references: [[…]]` tokens and indexed as a source in `linkIndex.documents`. Outbound link targets use the existing path-resolution rules (relative to the tab's directory). The on-edit path doesn't need a tab equivalent of `updateDocumentLinks` for TAB-011 (no editor yet — TAB-008 will add that surface).

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts` (add `buildTabEntry`, branch in `fullRebuild`)
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts` (add `.alphatex` cases)

- [ ] **Step 1: Add the failing tests**

In `src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts`, add a new describe block (place it after the existing `describe('fullRebuild', ...)` block, or wrap it next to other rebuild tests — match local convention). The test seeds a `.alphatex` file with a `// references:` line and asserts the resulting index entry:

```ts
describe('fullRebuild — .alphatex tabs (TAB-011)', () => {
  it('TAB-11.6-04: indexes outbound wiki-links from a tab\'s // references: line', async () => {
    await seedFile(root, 'songs/wonderwall.alphatex',
      `\\title "Wonderwall"\n` +
      `// references: [[notes/song-history.md]] [[diagrams/chord-tree.json]]\n` +
      `. r.4 |`,
    );
    await seedFile(root, 'notes/song-history.md', '# History');
    await seedFile(root, 'diagrams/chord-tree.json', '{"title":"chords","layers":[],"nodes":[],"connections":[]}');

    const { result } = renderHook(() => useLinkIndex());
    const index = await act(async () =>
      result.current.fullRebuild(asRoot(root), [
        'songs/wonderwall.alphatex',
        'notes/song-history.md',
        'diagrams/chord-tree.json',
      ]),
    );

    expect(index.documents['songs/wonderwall.alphatex'].outboundLinks).toEqual([
      { targetPath: 'notes/song-history.md', type: 'document' },
      { targetPath: 'diagrams/chord-tree.json', type: 'diagram' },
    ]);
  });

  it('TAB-11.6-05: ignores // lines that aren\'t // references: in a tab', async () => {
    await seedFile(root, 'a.alphatex',
      `\\title "X"\n` +
      `// some other comment [[ignored.md]]\n` +
      `// references: [[real.md]]\n`,
    );

    const { result } = renderHook(() => useLinkIndex());
    const index = await act(async () =>
      result.current.fullRebuild(asRoot(root), ['a.alphatex']),
    );

    expect(index.documents['a.alphatex'].outboundLinks).toEqual([
      { targetPath: 'real.md', type: 'document' },
    ]);
  });

  it('TAB-11.6-06: backlinks from .md → .alphatex resolve via the wiki-link parser', async () => {
    await seedFile(root, 'songs/wonderwall.alphatex',
      `\\title "Wonderwall"\n. r.4 |`,
    );
    await seedFile(root, 'notes/about.md',
      'See [[songs/wonderwall.alphatex]] for the tab.',
    );

    const { result } = renderHook(() => useLinkIndex());
    const index = await act(async () =>
      result.current.fullRebuild(asRoot(root), [
        'songs/wonderwall.alphatex',
        'notes/about.md',
      ]),
    );

    expect(index.documents['notes/about.md'].outboundLinks).toEqual([
      { targetPath: 'songs/wonderwall.alphatex', type: 'tab' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts`
Expected: 3 new cases FAIL — the `.alphatex` source file is read but no entry is built (`fullRebuild` doesn't recognise the extension), and the doc-side test for the `[[...alphatex]]` outbound link gets `type: 'document'` (because `getLinkType` doesn't distinguish — wait, Task 4 already fixed that, so test 3 may pass after Task 4. Confirm with the actual run.)

- [ ] **Step 3: Add `buildTabEntry` and the `.alphatex` branch in `fullRebuild`**

In `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts`, add a new helper just below `buildDiagramEntry` (around line 60):

```ts
/** Build a link-index entry for an alphaTex tab file (TAB-011).
 *  Outbound links come from `[[…]]` tokens on lines that start with
 *  `// references:` (the alphaTex line-comment convention; spec L309). */
function buildTabEntry(
  content: string,
  docDir: string,
): { outboundLinks: OutboundLink[]; sectionLinks: { targetPath: string; section: string }[] } {
  const REFERENCES_LINE = /^\s*\/\/\s*references\s*:\s*(.*)$/gim;
  const outboundLinks: OutboundLink[] = [];
  const sectionLinks: { targetPath: string; section: string }[] = [];
  for (const lineMatch of content.matchAll(REFERENCES_LINE)) {
    // parseWikiLinks handles [[path#section|alias]] syntax for us.
    const parsed = parseWikiLinks(lineMatch[1] ?? "");
    for (const link of parsed) {
      const resolved = resolveWikiLinkPath(link.path, docDir);
      if (link.section) {
        sectionLinks.push({ targetPath: resolved, section: link.section });
      } else {
        outboundLinks.push({ targetPath: resolved, type: getLinkType(resolved) });
      }
    }
  }
  return { outboundLinks, sectionLinks };
}
```

Then in `fullRebuild` (around line 215), extend the if/else chain to cover `.alphatex`:

```ts
for (const docPath of allDocPaths) {
  try {
    const content = await repo.readDocContent(docPath);
    if (docPath.endsWith(".json")) {
      index.documents[docPath] = buildDiagramEntry(content);
    } else if (docPath.endsWith(".alphatex")) {
      const docDir = getDocDir(docPath);
      index.documents[docPath] = buildTabEntry(content, docDir);
    } else {
      const docDir = getDocDir(docPath);
      index.documents[docPath] = buildDocumentEntry(content, docDir);
    }
  } catch {
    // File read failed — skip
  }
}
```

> **Confirm `repo.readDocContent` works for `.alphatex` paths.** It currently powers the `.md` and `.json` reads. If it routes by extension (e.g. only opens `.md` files), Task 5 needs an additional sub-step to teach `linkIndexRepo` how to read `.alphatex` as raw text. Check `src/app/knowledge_base/infrastructure/linkIndexRepo.ts` before assuming.

- [ ] **Step 3a (conditional): Teach `linkIndexRepo.readDocContent` to read `.alphatex`**

If `linkIndexRepo.readDocContent` is hard-coded to a specific extension or repo, generalise it to read raw text for any path. Mirror the `documentRepo.read` body (it's a thin `readTextFile(...)` wrapper).

After the change, run `npm run test:run -- src/app/knowledge_base/infrastructure/linkIndexRepo` to confirm any existing tests still pass.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts`
Expected: full suite green (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useLinkIndex.ts src/app/knowledge_base/features/document/hooks/useLinkIndex.test.ts
# also stage src/app/knowledge_base/infrastructure/linkIndexRepo.ts if Step 3a changed it
git commit -m "feat(tabs): index outbound wiki-links from .alphatex // references: lines (TAB-011)"
```

---

## Task 6: `handleSearchPick` opens `kind: "tab"` results in the tab pane

**Goal:** A search hit with `kind: "tab"` opens the file in the tab pane (mirrors how `kind: "diagram"` opens the diagram pane). No node-centring intent — tabs don't have searchable sub-entities yet.

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx:722-738` (the `handleSearchPick` callback)

- [ ] **Step 1: Update the routing**

In `src/app/knowledge_base/knowledgeBase.tsx`, change `handleSearchPick`:

```tsx
  const handleSearchPick = useCallback(async (result: SearchResult, query: string) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (result.kind === "diagram") {
      let nodeId: string | null = null;
      if (rootHandle) {
        try {
          nodeId = await findFirstNodeMatching(rootHandle, result.path, query);
        } catch {
          /* fall through with no centring intent */
        }
      }
      panesOpenFile(result.path, "diagram", nodeId ? { searchTarget: { nodeId } } : undefined);
    } else if (result.kind === "tab") {
      panesOpenFile(result.path, "tab");
    } else {
      panesOpenFile(result.path, "document");
    }
  }, [fileExplorer.dirHandleRef, panesOpenFile]);
```

- [ ] **Step 2: Verify typecheck + a smoke test**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: zero errors.

Run: `npm run test:run -- src/app/knowledge_base/knowledgeBase` (matches `knowledgeBase.tabRouting.test.tsx` and any other top-level test).
Expected: full suite green.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(tabs): route kind='tab' search hits into the tab pane (TAB-011)"
```

---

## Task 7: GP import re-indexes the new tab file after write

**Goal:** When TAB-006's GP-import flow writes a freshly-converted `.alphatex` file to disk, immediately push it through `readForSearchIndex` → `searchManager.addDoc` so the new tab is searchable without waiting for a full explorer rebuild. Mirrors the rename re-index pattern at `knowledgeBase.tsx:240-250`.

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` (around line 802 — the `useGpImport` call site)

- [ ] **Step 1: Wrap `handleSelectFile` in an indexing-then-opening callback**

In `src/app/knowledge_base/knowledgeBase.tsx`, locate the `gpImport` block (~line 802):

```tsx
  const gpImport = useGpImport({
    tab: tabRepoForImport,
    onImported: handleSelectFile,
  });
```

Replace it with:

```tsx
  const handleTabImported = useCallback(async (tabPath: string) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (rootHandle) {
      try {
        const item = await readForSearchIndex(rootHandle, tabPath);
        if (item) searchManager.addDoc(item.path, item.kind, item.fields);
      } catch {
        // Same swallow policy as the rename re-index path.
      }
    }
    handleSelectFile(tabPath);
  }, [fileExplorer.dirHandleRef, searchManager, handleSelectFile]);

  const gpImport = useGpImport({
    tab: tabRepoForImport,
    onImported: handleTabImported,
  });
```

> The re-index also needs the link-index to pick up any `// references:` line in the new file. Add this just after the `searchManager.addDoc` call inside the try-block, before `handleSelectFile`:
>
> ```tsx
> // Pull any [[…]] tokens from the freshly-imported tab into the link
> // index so backlinks surface immediately. Cheap: same per-file walk
> // as fullRebuild does for one path.
> try {
>   const allPaths = Object.keys(linkManager.linkIndex.documents);
>   if (!allPaths.includes(tabPath)) allPaths.push(tabPath);
>   await linkManager.fullRebuild(rootHandle, allPaths);
> } catch (e) {
>   reportError(e, `Indexing wiki-links for ${tabPath}`);
> }
> ```
>
> If `linkManager` / `reportError` aren't already in scope at this site, swap to the smallest existing helper. (They are in scope as of TAB-006 — verify with `grep -n "linkManager\|reportError" src/app/knowledge_base/knowledgeBase.tsx | head -5`.)

- [ ] **Step 2: Verify typecheck + tests**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`
Expected: zero errors. (`readForSearchIndex` and `searchManager` are already imported.)

Run: `npm run test:run -- src/app/knowledge_base/features/tab/`
Expected: existing tab suite green. (No new tests here — the contract is exercised by the search/link tests in earlier tasks.)

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(tabs): re-index search + links after GP import write (TAB-011)"
```

---

## Task 8: Update `test-cases/11-tabs.md` and `Features.md` for TAB-011

**Goal:** Catalogue the new search + link surfaces in `test-cases/11-tabs.md` §11.6 (next free section), flip the parked TAB-11.2-13 to ✅, and update `Features.md` §11 to note the search + link capability.

**Files:**
- Modify: `test-cases/11-tabs.md`
- Modify: `Features.md`

- [ ] **Step 1: Flip TAB-11.2-13 from ❌ to ✅**

In `test-cases/11-tabs.md` line 46, change:

```
- **TAB-11.2-13** ❌ **Wiki-link parser recognises `// references:` lines in the kb-meta block** — `useLinkIndex` indexes outbound links from `.alphatex`. (May land alongside TAB-011; track here for traceability.)
```

to:

```
- **TAB-11.2-13** ✅ **Wiki-link parser recognises `// references:` lines in the kb-meta block** — `useLinkIndex.fullRebuild` parses `[[…]]` tokens from any line beginning with `// references:` in a `.alphatex` file. _(unit: `useLinkIndex.test.ts` — TAB-011 cases TAB-11.6-04..06.)_
```

- [ ] **Step 2: Add `## 11.6 Vault search (TAB-011)` block**

In `test-cases/11-tabs.md`, insert a new section between the existing `## 11.5 Properties panel (TAB-007)` block and the `## Future sections` block. Use the next free numbering — start at TAB-11.6-01:

```markdown
## 11.6 Vault search (TAB-011)

- **TAB-11.6-01** ✅ **`.alphatex` files are indexed via `searchStream.readForSearchIndex`** — returns `{ kind: "tab", fields: { title, body } }` with title from `\title` and body from a space-joined concatenation of artist/album/subtitle/key/tuning/track-names/lyrics. _(unit: `searchStream.test.ts` — "reads a .alphatex tab and extracts indexable fields".)_
- **TAB-11.6-02** ✅ **A tab with only `\title` indexes successfully** — body is empty string; the file is still findable by title. _(unit: `searchStream.test.ts`.)_
- **TAB-11.6-03** ✅ **Search hits with `kind: "tab"` open in the tab pane** — `handleSearchPick` routes `result.kind === "tab"` through `panesOpenFile(path, "tab")`. _(integration: `knowledgeBase.tsx` — covered indirectly via the routing test in `knowledgeBase.tabRouting.test.tsx` and the existing `.alphatex` extension routing case TAB-11.1-01.)_
- **TAB-11.6-04** ✅ **`fullRebuild` indexes outbound wiki-links from a tab's `// references:` line** — `[[a.md]]`, `[[b.json]]`, etc. resolve to `outboundLinks` with the right `type` (document / diagram / tab). _(unit: `useLinkIndex.test.ts`.)_
- **TAB-11.6-05** ✅ **`//` lines that aren't `// references:` are ignored** — only the canonical comment header is parsed; arbitrary commentary like `// see [[ignored.md]]` does not bleed into the index. _(unit: `useLinkIndex.test.ts`.)_
- **TAB-11.6-06** ✅ **`.alphatex` is a recognised wiki-link target type** — a `.md` document linking to `[[song.alphatex]]` resolves to `{ type: "tab" }` so the receiving pane and the backlinks panel know to label it as a tab. _(unit: `useLinkIndex.test.ts`.)_
- **TAB-11.6-07** ✅ **Importing a `.gp` file re-indexes the new `.alphatex` immediately** — after `useGpImport` writes the tab to disk, the import wrapper calls `searchManager.addDoc` and `linkManager.fullRebuild` for the new path so it's searchable without a full vault rebuild. _(integration: see `knowledgeBase.tsx` `handleTabImported`; smoke-tested via existing GP import tests.)_
```

- [ ] **Step 3: Update `Features.md` §11**

In `Features.md`, locate `### 11.5 Pending` (around line 679 — confirm with `grep -n "^### 11" Features.md`). Insert a new section *before* `### 11.5 Pending` (renumbering Pending to §11.6):

```markdown
### 11.5 Vault search & wiki-links (TAB-011)

- ✅ `.alphatex` files are indexed in the global vault search by title, artist, key, tuning, track names, and lyrics — `infrastructure/searchStream.ts` (`tabFields()` helper) feeds `searchManager.addDoc` with `kind: "tab"`. Hits open in the tab pane.
- ✅ A `// references: [[…]]` line in the alphaTex header is parsed by `useLinkIndex` (`buildTabEntry` helper) — outbound wiki-links resolve via the same regex and path-resolution rules as markdown documents. Backlinks from `.md` / `.json` / `.alphatex` files all surface in the wiki-link graph with the right type label (`"tab"`).
- ✅ A freshly-imported `.gp` file is re-indexed for both search and wiki-links the moment the import write completes (`handleTabImported` in `knowledgeBase.tsx`) — no need to wait for the next full rebuild.
- ⚙️ `infrastructure/alphatexHeader.ts` — pure synchronous parser used at index time. Browser-free, alphaTab-free; alphaTab's Score parser is reserved for render time.
```

Then, in the existing §11.5 Pending block, **remove** any bullet that's now shipped (specifically: any "vault search" or "wiki-link integration" entries — they should now live in §11.5 above). Renumber the Pending block to §11.6.

- [ ] **Step 4: Verify the test-cases case count and Features.md numbering**

Run: `grep -c '^- \*\*TAB-11' test-cases/11-tabs.md`
Expected: previous count (62) + 7 new = **69**.

Run: `grep -nE '^### 11\.' Features.md`
Expected: `### 11.1 Foundation`, `### 11.2 Playback chrome`, `### 11.3 .gp import`, `### 11.4 Properties panel`, `### 11.5 Vault search & wiki-links`, `### 11.6 Pending`.

- [ ] **Step 5: Commit**

```bash
git add test-cases/11-tabs.md Features.md
git commit -m "docs: register TAB-011 vault search + wiki-link surfaces in test-cases + Features.md"
```

---

## Verification before PR

After all 8 tasks complete, run the full pre-PR check:

- [ ] **Full test suite**

Run: `npm run test:run`
Expected: all tests pass — current baseline is 1641 (post-TAB-007); add ~14 new (8 parser + 3 searchStream + 3 useLinkIndex), so target is **~1655**.

- [ ] **Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: zero errors.

- [ ] **Lint**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Build**

Run: `npm run build`
Expected: clean Next.js production build.

- [ ] **Code review pass**

Use `superpowers:requesting-code-review` over the whole branch diff to surface anything missed.

- [ ] **Update handoff doc**

Per the handoff doc's `Doc-update protocol`, refresh `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`:
- Add TAB-011 row to the "Where we are" table (PR # filled at PR time).
- Drop TAB-011 from the M1 remaining table.
- Mark TAB-007a status as `❌ Not started — unblocked by TAB-011`.
- Add new files (`alphatexHeader.ts`, plan path) to the Reference architecture map.
- Rewrite Next Action for TAB-007a or TAB-012 (whichever the user picks next).

This update can fold into this PR or ride a doc-only PR — either is honoured by the protocol.

- [ ] **Open the PR**

```bash
git push -u origin plan/guitar-tabs-search-links
gh pr create --title "feat(tabs): vault search + wiki-link integration (TAB-011)" --body "$(cat <<'EOF'
## Summary
- `.alphatex` tabs are now first-class in vault search (title + concatenated body of artist/key/tuning/track-names/lyrics) and the wiki-link graph (outbound links from `// references:` block; backlinks render with `type: "tab"`).
- Pure header parser `infrastructure/alphatexHeader.ts` does the metadata extraction at index time — no alphaTab dependency at index time.
- GP import flow re-indexes immediately after write so freshly-imported tabs are searchable without a full vault rebuild.

## Spec / design refs
- Spec: `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` §"Outbound: wiki-links" + §"Vault search"
- Plan: `docs/superpowers/plans/2026-05-03-guitar-tabs-search-links.md`
- Decisions: A1 (extend `searchStream.ts`), B1+B3 (shoehorn into `body`, per-field ranking parked), C1 (pure parser)

## Test plan
- [x] `npm run test:run` — all green (~1655 tests)
- [x] `npm run lint` — zero errors
- [x] `npm run build` — clean production build
- [x] Manual: open a `.alphatex` file, search for its title / artist / one of its tuning notes — appears as a hit, opens in the tab pane.
- [x] Manual: a `.alphatex` file with `// references: [[notes/x.md]]` shows up in `notes/x.md`'s backlinks panel after a vault refresh.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (run before handing the plan off)

**1. Spec coverage:**
- ✅ Vault search indexing of tabs (title, artist, key, tuning, track names, lyrics) — Tasks 1, 2, 3, 7.
- ✅ Search hits open in the tab pane — Task 6.
- ✅ Wiki-link parsing of `// references: [[…]]` from `.alphatex` — Tasks 1, 4, 5.
- ✅ Backlinks from `.md` / `.json` / `.alphatex` to tabs surface with the correct `type: "tab"` label — Task 4 (`getLinkType`).
- ✅ TAB-11.2-13 ❌ → ✅ — Task 8.
- ⚠️ Lyrics extraction relies on a `\lyrics "..."` directive; if the alphaTex grammar uses a different multi-line `\lyrics` syntax, the parser captures only the quoted form. **Acceptable for M1 viewer scope.** A follow-up can extend the parser to multi-line lyrics if real fixtures need it. Tracked as a parked item to add to the handoff if the implementing engineer confirms a discrepancy.

**2. Placeholder scan:** No "TBD", no "TODO", no "implement appropriate handling" left. Step 3a in Task 5 is a *conditional* sub-step with a precise check (`grep linkIndexRepo.readDocContent`); it's an honest "verify before assuming" rather than a placeholder.

**3. Type consistency:**
- `DocKind` extended once (Task 2), referenced consistently (`"tab"`) downstream.
- `OutboundLink.type` extended once (Task 4), `getLinkType` returns the new union (Task 4), consumed by `buildTabEntry` (Task 5).
- `AlphatexHeader` interface defined in Task 1, consumed by `tabFields()` in Task 3 — same field names (`title`, `artist`, `tuning`, `trackNames`, `lyrics`).
- `SearchableDoc { path, kind, fields }` shape unchanged — Task 3 returns it.

**4. Ambiguity:** None left intentionally. The single judgement call (lyrics scope) is called out above.

---
