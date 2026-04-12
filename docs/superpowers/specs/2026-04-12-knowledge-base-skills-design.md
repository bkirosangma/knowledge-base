# Knowledge Base Skills Overhaul — Design Spec

**Date:** 2026-04-12
**Goal:** Consolidate the scattered `create-architecture`, `init-vault`, and related skills into a unified `/knowledge-base` skill family with sub-commands: `init`, `diagram`, `document`, `create`.

---

## 1. File Structure

```
~/.claude/skills/knowledge-base/
  SKILL.md                                  # Router: parses sub-command, dispatches
  commands/
    init.md                                 # /knowledge-base init [path]
    diagram.md                              # /knowledge-base diagram <topic>
    document.md                             # /knowledge-base document <topic> [-i]
    create.md                               # /knowledge-base create <topic> [-i]
  archetypes/
    software-architecture.md                # The one concrete archetype (ships with skill)
    _archetype-template.md                  # Schema/format for authoring new archetypes
```

### Router (`SKILL.md`)

- **Trigger phrases:** `/knowledge-base`, `/kb`, "create architecture", "design diagram", "architecture of X", "create document", "write about X", "init vault", "initialize vault", "set up vault", "create about X"
- **Argument parsing:** first token after the skill name is the sub-command (`init`, `diagram`, `document`, `create`). Remaining tokens are passed as arguments.
- **No argument:** prints help listing available sub-commands.
- **Routing:**
  - `init` → reads and follows `commands/init.md`
  - `diagram` → reads and follows `commands/diagram.md`
  - `document` → reads and follows `commands/document.md`
  - `create` → reads and follows `commands/create.md`

---

## 2. `/knowledge-base init [path]`

Initializes a folder as a knowledge-base vault. Merges the old `init-vault` functionality with vault-specific CLAUDE.md and graphify hook installation.

### Vault structure after init

```
<vault-root>/
  .archdesigner/
    config.json                     # Vault metadata (version, name, created, lastOpened)
    _links.json                     # Wiki-link index (auto-maintained by the app)
    cross-references.json           # Graphify edge data (auto-maintained by the app)
  CLAUDE.md                         # Lean, static — vault identity + pointers
  MEMORY.md                         # Index of vault memories
  memory/
    archetype-preferences.md        # Learned diagram style preferences
    topic-registry.md               # What topics this vault covers
  .graphifyignore                   # Excludes .archdesigner/ from graphify indexing
```

### Steps

1. **Resolve target directory** — no arg = cwd, relative/absolute paths supported, create if missing.
2. **Ask vault name** — suggest directory name as default.
3. **Create `.archdesigner/`** — `config.json` + empty `_links.json` (same schema as current `init-vault`).
4. **Ask about starter structure** — same 3 options as current `init-vault`:
   - A) Minimal — just config
   - B) Documentation structure — `docs/` with subdirectories + `README.md`
   - C) Full starter kit — B + template documents with wiki-link examples
5. **Write `CLAUDE.md`** — lean and static:
   - Vault name and purpose (1-2 lines)
   - File conventions: `.json` = diagrams, `.md` = documents, `[[wiki-links]]` for cross-references
   - Pointers to `MEMORY.md` for archetype preferences, topic registry, vault feedback
   - Pointers to `/graphify query` and `/mem-search` for vault intelligence
   - Brief reference to archetype format and diagram JSON schema
6. **Write `MEMORY.md` + `memory/`:**
   - `MEMORY.md` — index file with pointers to memory files
   - `memory/archetype-preferences.md` — starts with frontmatter only, no content yet
   - `memory/topic-registry.md` — starts with frontmatter only, no content yet
   - Memory files can be split and re-indexed when they grow large
7. **Install graphify hook** — run `graphify claude install` inside the vault directory so vault content gets indexed.
8. **Add `.archdesigner/` to `.graphifyignore`**
9. **Build initial graphify index** if vault has existing content.
10. **Print summary.**

### Reinitializing

Same rules as current `init-vault`: preserve `_links.json`, update `config.json` timestamp, only create files that don't already exist, warn before overwriting.

### What this is NOT

This is NOT `init-project`. That skill stays independent — it sets up graphify + claude-mem for codebases. `/knowledge-base init` sets up a content vault for documents and diagrams.

---

## 3. `/knowledge-base diagram <topic>`

Generates a diagram JSON file for any topic. Not limited to software architecture — handles mechanical systems, biological processes, business workflows, etc.

### Archetype system

**Selection flow:**

1. Check vault's `memory/archetype-preferences.md` for learned preferences relevant to the topic domain.
2. Query **graphify** — what related content exists in the vault? Reuse layer/color conventions for consistency.
3. Query **claude-mem** — past diagram sessions, corrections the user made on similar diagrams.
4. Select archetype:
   - If topic matches `software-architecture` archetype → use it.
   - Otherwise → adapt on the fly using the archetype template as a structural guide.
5. Generate the diagram JSON following the selected/adapted rules.

**After generation:**

6. Update graphify incrementally so the new diagram is immediately queryable.
7. Auto-learn: if Claude made archetype adaptations (new icon mappings, layer color choices for a novel domain), note them as candidates in `memory/archetype-preferences.md`. Also adapts from user corrections/choices during the session — no explicit "save" required.

### Archetype file format (`_archetype-template.md`)

```markdown
---
name: <archetype-name>
description: <one-line description>
domain-indicators: [<keywords that trigger this archetype>]
---

## Layer Conventions
<categories, colors, ordering>

## Icon Mappings
<domain concept → lucide icon name>

## Connection Semantics
<what edge colors and labels mean in this domain>

## Layout Preferences
<horizontal vs vertical emphasis, density, spacing adjustments>
```

### `software-architecture.md`

The existing `create-architecture` SKILL.md content reorganized into the archetype format. Same spacing rules, icon list, anchor points, flow conventions, symmetry rules, condition node placement — all preserved.

---

## 4. `/knowledge-base document <topic> [-i|--interactive]`

Generates a standalone markdown document on any topic.

### Flow

1. **Query compound intelligence:**
   - **graphify** — related content in the vault (adjacent topics, existing diagrams)
   - **claude-mem** — past work on this topic, document structure preferences
   - **vault MEMORY.md** — feedback on document style/depth
2. **Generate the document:**
   - Comprehensive, well-structured prose
   - Sections with clear headings
   - If related diagrams exist in vault, include `[[diagram-name.json]]` wiki-links
   - If related documents exist, include `[[other-doc]]` wiki-links for cross-referencing
3. **Write to vault** — root or appropriate subdirectory if vault has doc structure.
4. **Update graphify** incrementally.
5. **Update link index** — track wiki-links in the new document.

### Interactive mode (`-i`)

Before generating, Claude asks 2-3 questions: target audience, depth level, specific angles to cover. Then generates tailored to those answers.

### Without `-i`

Claude generates directly based on topic + compound intelligence context. User edits afterward.

---

## 5. `/knowledge-base create <topic> [-i|--interactive]`

The compound command — generates both a document and a diagram, linked via wiki-links. The document is the primary knowledge artifact; the diagram supplements it as a visual overview that helps the reader orient themselves in the knowledge space.

### Flow

1. **Query compound intelligence** (same as document/diagram individually).
2. **Generate the document first** — comprehensive prose on the topic. This establishes the concepts, structure, and relationships.
3. **Generate the diagram second** — informed by the document's content. Maps the document's key concepts into layers and nodes. The diagram is a visual map of the knowledge in the document.
4. **Cross-link them:**
   - Document gets a `[[topic-name.json]]` wiki-link near the top (e.g., "See the visual overview: `[[steam-engine.json]]`")
   - Diagram title matches the document topic
   - Link index and graphify cross-references are updated
5. **Update vault state:**
   - Graphify rebuild (both files indexed)
   - Link index updated
   - `memory/topic-registry.md` updated with the new topic entry
6. **Interactive mode (`-i`):** same as document — asks audience/depth/angle questions before generating either artifact.

### Naming convention

- Document: `<topic-slug>.md` (e.g., `steam-engine.md`)
- Diagram: `<topic-slug>.json` (e.g., `steam-engine.json`)
- Both at vault root, or in matching subdirectory if vault has structure.

---

## 6. Lifecycle & Cleanup

### Skills to delete

| Skill | Replacement |
|-------|-------------|
| `~/.claude/skills/create-architecture/` | `commands/diagram.md` |
| `~/.claude/skills/init-vault/` | `commands/init.md` |

### Skills that stay untouched

| Skill | Reason |
|-------|--------|
| `~/.claude/skills/init-project/` | Codebase intelligence — separate concern |
| `~/.claude/skills/graphify/` | Global, used internally by knowledge-base |
| `~/.claude/skills/hybrid-search/` | Global |
| `~/.claude/skills/compound-dispatch/` | Global |

### Global CLAUDE.md updates

- Remove `create-architecture` and `init-vault` references
- Add `/knowledge-base` entry with sub-commands: `init`, `diagram`, `document`, `create`
- Keep graphify/hybrid-search/compound-dispatch entries as-is
