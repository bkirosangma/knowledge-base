# Knowledge-Base Skill Update MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `/knowledge-base` skill so its sub-commands generate, edit, validate, and transform content using the new diagram model (manual flow ordering, cross-entity attachments, wiki-link anchors, source links) and emit richer per-flow primary documents — replacing the existing 3–5 sentence + table flow descriptions.

**Architecture:** No app code changes. All edits are to skill markdown files at `~/.claude/skills/knowledge-base/`. Each command file gains awareness of the new fields; archetype files gain canonical examples. Validation rules accept empty values for everything except `sources` at generation time.

**Spec:** `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` (slices 11–12 in §14)

**Depends on:** Plans 1–4 deployed (the skill writes / validates the new fields the app implements). Until those land, this plan's outputs would be valid but ignored by the running app.

---

## File Map

| File | Action |
|------|--------|
| `~/.claude/skills/knowledge-base/commands/diagram.md` | Modify — Step 1.5 (sources), Step 3a (emit nodeOrders/start/end), Step 3e (rich primary doc replaces table-only). |
| `~/.claude/skills/knowledge-base/commands/document.md` | Modify — Step 1.5 (sources). |
| `~/.claude/skills/knowledge-base/commands/svg.md` | Modify — Step 1.5 (sources via sidecar). |
| `~/.claude/skills/knowledge-base/commands/guitar-tabs.md` | Modify — Step 1.5 (sources via AlphaTex header). |
| `~/.claude/skills/knowledge-base/commands/edit.md` | Modify — teach new fields. |
| `~/.claude/skills/knowledge-base/commands/validate.md` | Modify — validate URL shape; accept empty start/end/order/sources. |
| `~/.claude/skills/knowledge-base/commands/transform.md` | Modify — idempotent on new fields; `--add-conventions -i` may prompt for sources. |
| `~/.claude/skills/knowledge-base/archetypes/roadmaps.md` | Modify — canonical example with order numbers + multi-start/end. |
| `~/.claude/skills/knowledge-base/archetypes/software-architecture.md` | Modify — brief flow example with `startNodeIds`/`endNodeIds`. |
| `~/.claude/skills/knowledge-base/archetypes/_archetype-template.md` | Modify — new "Ordering conventions" + "Sourcing conventions" sections. |
| `~/.claude/skills/knowledge-base/scripts/kb_flow_tables.py` | Modify (optional) — emit a slimmer table since the primary doc carries the prose. |
| `~/.claude/skills/knowledge-base/scripts/kb_validate.py` (if present) | Modify — URL shape rule + new field tolerance. |

---

## Notes on testing skill changes

The skill itself runs inside Claude Code, so unit-style tests don't apply. Verification is done by:

1. Invoking `/knowledge-base diagram <fixture topic>` in a scratch vault and inspecting the output JSON + flow docs.
2. Invoking `/knowledge-base validate <fixture file>` against fixtures crafted to exercise each new rule (empty start/end, malformed source URL, etc.).
3. Reading the diff against an existing skill-generated diagram and confirming new fields appear with reasonable values.

A small fixtures folder under `~/.claude/skills/knowledge-base/test-fixtures/` is created in Task 8 to hold the input topics and expected-output snapshots used for verification.

---

## Task 1: Update `commands/diagram.md` — Step 1.5 (Gather sources)

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/diagram.md`

- [ ] **Step 1.1: Insert a new Step 1.5 after Step 1c (Additional Intelligence Queries)**

Add this block:

```markdown
## Step 1.5: Gather Sources

Sources are **mandatory** for skill-generated diagrams. Without them the user cannot verify what the diagram is grounded in.

1. **Top-level sources**: use WebSearch to find 2–4 canonical online resources for the topic. Prefer:
   - For protocols: the relevant RFC or W3C spec.
   - For algorithms: the original paper or its archive page.
   - For software architectures: the official documentation, an architectural blog post by the maintainers, or the source-code-of-record (e.g. GitHub repo).
   - Avoid: commercial blog posts that paraphrase canonical sources without adding insight.
2. **Per-entity sources** (encouraged when feasible): for any node / connection / flow whose concept has its own canonical source distinct from the top-level topic, search and attach. For nodes representing a specific service-or-protocol (e.g. an "OAuth Service" node), find that protocol's RFC.
3. **Record** the sources for use in Step 3b. Format each as:
   ```json
   { "url": "https://datatracker.ietf.org/doc/html/rfc6749", "title": "RFC 6749 — OAuth 2.0" }
   ```
4. **Minimum**: at least one top-level `sources` entry MUST be present in the final JSON. Per-entity sources are encouraged but not required.
```

- [ ] **Step 1.2: Update Step 3b (JSON Output) — top-level shape**

Modify the schema block to include `sources`:

```json
{
  "title": "<Diagram Title>",
  "sources": [SourceLink],
  "layers": [LayerDef],
  "nodes": [SerializedNodeData],
  "connections": [Connection],
  "layerManualSizes": {},
  "lineCurve": "bezier",
  "flows": [FlowDef],
  "documents": [DocumentMeta]
}
```

Add (after the existing `DocumentMeta` example block):

```json
SourceLink shape:
{
  "url": "https://example.com/...",
  "title": "Optional display label"
}
```

Note: per-entity sources nest the same shape inside any `LayerDef`, `SerializedNodeData`, `Connection`, or `FlowDef` (each accepts an optional `sources` array).

- [ ] **Step 1.3: Commit (the skill repository, if version-controlled)**

If `~/.claude/skills/` is under git, commit the change there. Otherwise, the file change is the deliverable.

---

## Task 2: Update `commands/diagram.md` — Step 3a emits flow ordering fields

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/diagram.md`

- [ ] **Step 2.1: Insert a new sub-step under Step 3a step 10 (Define flows)**

After the existing flow-definition guidance, add:

```markdown
### Flow ordering, start, and end (optional but encouraged)

The new `FlowDef` shape supports three optional fields that turn a flow's connections into a numbered traversal:

```json
{
  "id": "flow-...",
  "name": "...",
  "connectionIds": [...],
  "category": "...",
  "nodeOrders": { "el-browser": 1, "el-api-gateway": 2, "el-auth-service": 3 },
  "startNodeIds": ["el-browser"],
  "endNodeIds": ["el-session-db"]
}
```

- **`nodeOrders`** — Map of node ID → integer step. Use when the flow has a well-defined sequence (request flows, OAuth grants, learning paths). Multiple nodes may share an order number to indicate parallel steps. Omit when ordering would mislead (highly branching state machines, freely-traversable architectures).
- **`startNodeIds`** — Array of node IDs that are valid entry points to the flow. For roadmaps, all "Foundations" topics are starts.
- **`endNodeIds`** — Array of node IDs that are valid exit points / outcomes.

For each generated flow, decide based on archetype:

| Archetype | Default behaviour |
|---|---|
| Roadmaps | Always emit. Lowest-stage topics → `startNodeIds`. Highest-stage topics → `endNodeIds`. `nodeOrders` reflects recommended traversal sequence. |
| Software architecture | Emit when the flow is a request lifecycle (e.g. login). Skip when the flow is a topology/relationship diagram. |
| Other | Emit when the diagram represents a process; skip otherwise. |

Validate after emission: every `nodeOrders` key, `startNodeIds` entry, and `endNodeIds` entry MUST be reachable from the flow's `connectionIds` (i.e. appear as the `from` or `to` of at least one of those connections).
```

- [ ] **Step 2.2: Update the FlowDef example in Step 3b**

Locate the existing FlowDef schema block in Step 3b and append the three new optional fields with a one-line comment each.

---

## Task 3: Replace Step 3e — rich primary flow docs

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/diagram.md`

- [ ] **Step 3.1: Replace the existing Step 3e block entirely**

Delete the existing "3e. Flow Explanation Documents" block and replace with:

```markdown
### 3e. Flow primary documents (and optional extension docs)

For each flow defined in Step 3a, write a **rich primary document** that explains the flow as a self-contained piece of writing — not a hub, not a stub. The 3–5 sentence + table format used previously is **deprecated**.

#### 3e.1 Primary doc

1. **Filename**: `<topicFolder>/flow-descriptions/<flow-id>.md`. Create the folder with `mkdir -p` first.

2. **Length**: aim for 1500–3000 words. Do not pad — if the flow honestly fits in 800 words, write 800. Padding hurts skim-readability.

3. **Structure** (adaptive — let the topic shape the headings, not a rigid taxonomy):
   - **Overview** — one-paragraph summary of the trigger, the path, and the outcome.
   - **What happens** — narrative pass through the nodes in flow order. For each node, name it, explain its role in this flow, link to its detailed page or RFC.
   - **Why this grouping** — why these nodes and connections form a coherent flow (and what's intentionally not in it).
   - **How connections work** — for each non-trivial connection, explain the protocol, the contract, the failure mode.
   - **Edge cases** — at least one paragraph on what happens when the flow doesn't go cleanly (timeouts, errors, partial state).
   - **Cross-references** — wiki-links to related diagrams, related flows, related concept documents.

4. **Wiki-links**:
   - Use `[[other-doc.md]]` to link to other vault documents.
   - Use `[[other-doc.md#header]]` when linking to a specific section.
   - Use `[[other-diagram.json]]` to link to other diagrams.

5. **Auto-generated tables**:
   - Run `kb_flow_tables.py` as before, but embed the output as an appendix at the end (under "## Appendix: Connection reference") rather than as the body. The table is a reference; the prose is the document.

6. **Sources**: copy the flow's `sources` (if any) and the relevant top-level diagram sources into a YAML frontmatter block:

   ```markdown
   ---
   sources:
     - url: https://datatracker.ietf.org/doc/html/rfc6749
       title: RFC 6749 — OAuth 2.0
   ---

   # Flow Name

   ...
   ```

#### 3e.2 Extension docs (conservative, optional)

While drafting the primary, identify any subtopic that:

- Naturally takes 400+ words to explain at appropriate depth.
- Has its own canonical source distinct from the parent flow.
- Would dilute the primary if kept inline.

For each such subtopic, generate a sibling extension doc:

- **Filename**: `<topicFolder>/flow-descriptions/<flow-id>/<subtopic-slug>.md`. Create the subfolder with `mkdir -p` first.
- **Self-contained**: the extension is its own document, not a continuation. It MAY assume the reader has read the primary, but should re-state context briefly.
- **Wiki-link from primary**: at the relevant section of the primary, insert `[[<flow-id>/<subtopic-slug>.md#overview]]` (anchor optional).
- **No registration**: only the primary doc is registered in the diagram's `documents[]`. The extension is reachable through wiki-links + the auto-derived backlinks.
- **Conservative bias**: when in doubt, keep the content inline rather than spawn an extension. Truly deeper dives belong in a fresh `/kb document` or `/kb create` session.
- **Interactive mode (`-i`)**: surface borderline candidates to the user and ask before writing.

#### 3e.3 Registration

Append a `DocumentMeta` to the diagram JSON's `documents` array for each primary doc:

```json
{
  "id": "<topic-slug>-<flow-id>",
  "filename": "<collection-path>/<topic-slug>/flow-descriptions/<flow-id>.md",
  "title": "<Flow Name>",
  "attachedTo": [{ "type": "flow", "id": "<flow-id>" }]
}
```

Extension docs are NOT registered.
```

- [ ] **Step 3.2: Verify the user-facing checklist (Step 5: Verification)**

Update the verification checklist in Step 5 so it mentions the new flow primary doc shape and the optional extensions. Replace the existing item 7:

```markdown
7. Each flow has a companion primary document at `flow-descriptions/<flow-id>.md` registered in the diagram's `documents[]` and pre-attached to the flow. Optional extensions, if any, are wiki-linked from the primary.
```

---

## Task 4: Update `commands/document.md` — Step 1.5 (sources)

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/document.md`

- [ ] **Step 4.1: Insert Step 1.5**

Mirror the diagram-command source-gathering block, scoped to a document:

```markdown
## Step 1.5: Gather Sources

Sources are mandatory. Use WebSearch to find 2–4 canonical online resources for the topic. Prefer the topic's primary literature over derivative blog posts. Record as:

```yaml
sources:
  - url: https://...
    title: Optional display label
```

These go into the document's YAML frontmatter (top of file, between `---` delimiters).
```

- [ ] **Step 4.2: Update the document template**

Locate the existing template that this command writes for new documents. Add a `sources` field to the frontmatter block.

---

## Task 5: Update `commands/svg.md` — Step 1.5 (sources via sidecar)

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/svg.md`

- [ ] **Step 5.1: Insert Step 1.5**

```markdown
## Step 1.5: Gather Sources

For SVGs, sources are mandatory. Use WebSearch for 1–2 authoritative references on the visualisation type (e.g. for "Raga Yaman clock", a paper or treatise on Hindustani classical theory). After the SVG is written, also write a sidecar JSON file at `<filename>.svg.meta.json`:

```json
{
  "sources": [
    { "url": "https://example.org/raga-yaman", "title": "Raga Yaman in Hindustani theory" }
  ]
}
```

The app reads this sidecar on SVG load and surfaces it in the SvgProperties Sources section.
```

---

## Task 6: Update `commands/guitar-tabs.md` — Step 1.5

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/guitar-tabs.md`

- [ ] **Step 6.1: Insert Step 1.5**

```markdown
## Step 1.5: Gather Sources

For tabs, sources are mandatory. Use WebSearch to find 1–2 authoritative references — original tab notation (Songsterr, Ultimate Guitar's verified versions), official artist sheet music, or interviews / videos describing how the part was played. Sources go into the AlphaTex header:

```alphatex
\title "Hotel California Intro"
\artist "Eagles"
\sources "[{\"url\":\"https://www.songsterr.com/...\",\"title\":\"Songsterr — Hotel California\"}]"
.
```

`\sources` takes a JSON-encoded array of `{url, title?}` objects. The app parses it on load. (If the AlphaTex parser version in use doesn't support custom `\xxx` macros, fall back to a leading `// sources: <JSON>` comment line.)
```

---

## Task 7: Update `commands/edit.md`

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/edit.md`

- [ ] **Step 7.1: Add a new "Allowed mutations" subsection**

Append:

```markdown
### Flow ordering and start/end

`/kb edit` accepts changes to:
- `flows[].nodeOrders` — replace, add, or remove keys; values must be integers.
- `flows[].startNodeIds` and `flows[].endNodeIds` — replace, add, or remove. Each entry must be a flow member (i.e. appear as `from` or `to` of one of the flow's `connectionIds`). Reject changes that violate this and report the offending IDs.
- `nodes[].sources`, `connections[].sources`, `layers[].sources`, `flows[].sources`, top-level `sources` — replace, add, or remove. Each `url` MUST be `http://` or `https://`. Reject other schemes.

### Cross-entity attachment

`/kb edit` accepts changes to:
- Any entity's `attachedTo` array. The target's `type` must be one of `root | node | connection | flow | type | tab | tab-section | tab-track`. The `id` must reference an existing entity (validated against the relevant diagram / tab / etc.).
```

---

## Task 8: Update `commands/validate.md`

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/validate.md`

- [ ] **Step 8.1: Add new validation rules**

Append to the rules table:

```markdown
| Rule | Severity | Auto-fix? |
|---|---|---|
| Every `sources[].url` parses as `http(s)://`. Other schemes (`javascript:`, `data:`, `file:`) → error. | Error | Remove the offending entry on `--fix`. |
| `sources[].title` is a string or absent. Empty string → normalise to omitted on `--fix`. | Warning | Yes |
| `flows[].nodeOrders` keys are flow members (appear as `from`/`to` of one of the flow's `connectionIds`). | Error | Remove orphan keys on `--fix`. |
| `flows[].startNodeIds` / `endNodeIds` entries are flow members. | Error | Remove orphans on `--fix`. |
| `flows[].nodeOrders` values are integers. | Error | Drop non-integers on `--fix`. |
| Empty `nodeOrders` / `startNodeIds` / `endNodeIds` / `sources` is **not** an error — these fields are optional clarity aids. | n/a | n/a |
| `attachedTo[].type` is one of the allowed values. | Error | Drop entry on `--fix`. |
```

- [ ] **Step 8.2: Update `kb_validate.py` (if present)**

Add the URL-shape check, the flow-member check, and the `attachedTo.type` check. The script's existing structure should already iterate per-entity; add the new rules where the per-entity walk happens.

---

## Task 9: Update `commands/transform.md`

**Files:**
- Modify: `~/.claude/skills/knowledge-base/commands/transform.md`

- [ ] **Step 9.1: Document idempotence on the new fields**

Append:

```markdown
### Idempotence on optional fields

`/kb transform` does NOT auto-populate any of:
- `flows[].nodeOrders`, `flows[].startNodeIds`, `flows[].endNodeIds`
- top-level `sources`, per-entity `sources`
- `attachedTo`

These are author-discretion fields. Re-running `transform` against an already-transformed file leaves them untouched.

`--add-conventions` in interactive mode (`-i`) MAY prompt the user to add `sources` if the file lacks them; it never adds without user consent.
```

---

## Task 10: Update archetype files

**Files:**
- Modify: `~/.claude/skills/knowledge-base/archetypes/roadmaps.md`
- Modify: `~/.claude/skills/knowledge-base/archetypes/software-architecture.md`
- Modify: `~/.claude/skills/knowledge-base/archetypes/_archetype-template.md`

- [ ] **Step 10.1: roadmaps.md — canonical example**

Locate the FlowDef section. Replace the example with a fully-fleshed roadmap-flow example:

```json
{
  "id": "flow-fullstack-path",
  "name": "Full-Stack Web Path",
  "category": "Learning Paths",
  "connectionIds": ["dl-html-css", "dl-css-js", "dl-js-react", "dl-js-node", "dl-react-deploy", "dl-node-deploy"],
  "nodeOrders": {
    "el-html": 1, "el-css": 1,
    "el-js": 2,
    "el-react": 3, "el-node": 3,
    "el-deploy": 4
  },
  "startNodeIds": ["el-html", "el-css"],
  "endNodeIds": ["el-deploy"]
}
```

Add a paragraph explaining: HTML and CSS are co-equal starting points (both order 1, both `startNodeIds`); React and Node are parallel mid-path topics (both order 3); Deploy is the single end (order 4). For "choose-your-path" roadmaps, multiple ends are common too — name several specialisations as ends.

- [ ] **Step 10.2: software-architecture.md — brief example**

Add (alongside the existing FlowDef example):

```json
{
  "id": "flow-login",
  "name": "Login Flow",
  "connectionIds": ["dl-1", "dl-2", "dl-3", "dl-4", "dl-5", "dl-6"],
  "nodeOrders": {
    "el-browser": 1,
    "el-api-gateway": 2,
    "el-auth-service": 3,
    "el-token-mint": 4,
    "el-session-db": 5,
    "el-browser-redirected": 6
  },
  "startNodeIds": ["el-browser"],
  "endNodeIds": ["el-session-db"]
}
```

- [ ] **Step 10.3: _archetype-template.md — new sections**

Append two new template sections that future archetypes should fill in:

```markdown
## Ordering conventions

Describe how flows in this archetype are ordered:
- Are flows ordered (process / pipeline / lifecycle) or unordered (topology / ecosystem)?
- What does a "step" mean in this domain?
- When should multiple nodes share an order (parallel steps)?
- When are condition nodes ordered vs unordered?

## Sourcing conventions

Describe what canonical online sources fit this archetype's domain:
- For protocol diagrams: link the relevant RFC.
- For algorithms: link the original paper.
- For organisational architecture: link the team's RFC / ADR / public docs.
- For learning roadmaps: link the canonical curriculum or syllabus the roadmap is grounded in.
```

---

## Task 11: Verification fixtures

**Files:**
- Create: `~/.claude/skills/knowledge-base/test-fixtures/2026-05-05-flow-ordering.json`
- Create: `~/.claude/skills/knowledge-base/test-fixtures/2026-05-05-source-validation.json`

- [ ] **Step 11.1: Flow-ordering fixture**

A small diagram with a `flow-login` flow that exercises every new field. Used to sanity-check `/kb edit` and `/kb validate` behaviour.

- [ ] **Step 11.2: Source-validation fixture**

A diagram with intentional bad `sources` entries (`javascript:foo`, malformed URL, empty string) to verify `/kb validate --fix` strips them.

---

## Task 12: Manual verification

- [ ] **Step 12.1: Run a generation**

In a scratch vault:

```bash
/knowledge-base diagram "OAuth 2.0 authorization code flow"
```

Open the output. Verify:
- Top-level `sources` non-empty (at least one RFC link).
- The `flow-authorization-code` (or similar) carries `nodeOrders`, `startNodeIds`, `endNodeIds`.
- A primary doc at `flow-descriptions/flow-authorization-code.md` exists, has frontmatter `sources`, has multiple sections of prose, and registers in the diagram's `documents[]`.

- [ ] **Step 12.2: Run validate**

```bash
/knowledge-base validate <fixtures/source-validation.json>
```

Verify it flags the bad sources.

```bash
/knowledge-base validate <fixtures/source-validation.json> --fix
```

Verify it strips them.

- [ ] **Step 12.3: Commit if the skill repo is versioned**

If `~/.claude/skills/` is a git repo, commit the changes there with a descriptive message. Otherwise, the file changes are the deliverable.

---

## Self-review

1. **Spec coverage** — §10 (KB skill changes) fully covered: every command file in the table is updated, every archetype gains examples or new sections.
2. **Skill contracts** — sources mandatory at generation; new fields tolerated as empty by validate; transform idempotent.
3. **No placeholders** — every step has explicit text to insert or replace.
4. **Verification path** — Task 11 + Task 12 give a concrete way to confirm the skill outputs valid content for the new app model.
5. **Dependence on Plans 1–4** — flagged at the top. The skill output is forward-compatible with older app builds (new fields are optional and ignored), so this plan can ship before the apps catch up if needed.
