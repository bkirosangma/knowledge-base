# Knowledge Base Skills Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate `create-architecture` and `init-vault` into a unified `/knowledge-base` skill family with sub-commands: `init`, `diagram`, `document`, `create`.

**Architecture:** A single skill directory at `~/.claude/skills/knowledge-base/` with a router `SKILL.md` that parses sub-commands and dispatches to individual command files in `commands/`. Archetypes live in `archetypes/` and define domain-specific diagram conventions.

**Tech Stack:** Claude Code skills (markdown files with YAML frontmatter), graphify CLI, Bash

**Spec:** `docs/superpowers/specs/2026-04-12-knowledge-base-skills-design.md`

**Note:** This project creates skill files (markdown), not application code. There are no tests — verification is invoking each skill and confirming correct behavior. All files are written to `~/.claude/skills/knowledge-base/`.

---

## File Structure

### New files to create

```
~/.claude/skills/knowledge-base/
  SKILL.md                              # Router skill
  commands/
    init.md                             # /knowledge-base init [path]
    diagram.md                          # /knowledge-base diagram <topic>
    document.md                         # /knowledge-base document <topic> [-i]
    create.md                           # /knowledge-base create <topic> [-i]
  archetypes/
    software-architecture.md            # Concrete archetype (content from create-architecture)
    _archetype-template.md              # Schema for authoring new archetypes
```

### Files to delete

```
~/.claude/skills/create-architecture/SKILL.md   # Replaced by commands/diagram.md
~/.claude/skills/init-vault/SKILL.md            # Replaced by commands/init.md
```

### Files to modify

```
~/.claude/CLAUDE.md                             # Update skill references
```

---

## Task 1: Create the Archetype Template and Software Architecture Archetype

**Files:**
- Create: `~/.claude/skills/knowledge-base/archetypes/_archetype-template.md`
- Create: `~/.claude/skills/knowledge-base/archetypes/software-architecture.md`

These are foundational — the diagram and create commands reference them.

- [ ] **Step 1: Create the archetypes directory**

```bash
mkdir -p ~/.claude/skills/knowledge-base/archetypes
```

- [ ] **Step 2: Write the archetype template schema**

Write `~/.claude/skills/knowledge-base/archetypes/_archetype-template.md`:

```markdown
---
name: <archetype-name>
description: <one-line description of what this archetype is for>
domain-indicators: [<comma-separated keywords that suggest this archetype applies>]
---

# <Archetype Name>

Template for creating domain-specific diagram archetypes. Copy this file, fill in the sections,
and save as `<archetype-name>.md` in this directory.

## Layer Conventions

Define the standard layer categories for this domain, their ordering (top to bottom),
and color assignments.

| Layer | Purpose | Background | Border |
|-------|---------|-----------|--------|
| <layer-name> | <what goes here> | <#hex> | <#hex> |

## Icon Mappings

Map domain concepts to Lucide icon names. Available icons:
`Activity`, `Archive`, `BarChart`, `Bell`, `Box`, `Cable`, `Cloud`, `CloudCog`, `Code`,
`Cog`, `Container`, `Cpu`, `Database`, `DatabaseZap`, `FileCode`, `Fingerprint`, `Folder`,
`GitBranch`, `Globe`, `HardDrive`, `Key`, `Laptop`, `Layers`, `Lock`, `Mail`, `Monitor`,
`Network`, `Plug`, `Radio`, `Router`, `Server`, `ServerCog`, `Shield`, `ShieldCheck`,
`Smartphone`, `Tablet`, `Terminal`, `User`, `Users`, `Wifi`, `Zap`

| Concept | Icon | Why |
|---------|------|-----|
| <domain concept> | <LucideIconName> | <reasoning> |

## Connection Semantics

Define what edge colors and labels mean in this domain.

| Flow Type | Color | Meaning |
|-----------|-------|---------|
| <type> | <#hex> | <what this connection represents> |

## Layout Preferences

- **Primary flow direction:** top-to-bottom | left-to-right
- **Density:** compact | standard | spacious
- **Emphasis:** hierarchy | process | relationships
- **Special rules:** <any domain-specific layout constraints>
```

- [ ] **Step 3: Write the software-architecture archetype**

Write `~/.claude/skills/knowledge-base/archetypes/software-architecture.md`. This reorganizes the entire content of the existing `create-architecture` SKILL.md into the archetype format:

```markdown
---
name: software-architecture
description: System architecture diagrams for software — servers, services, databases, clients, auth, networking
domain-indicators: [software, system, api, microservice, server, database, backend, frontend, cloud, infrastructure, deployment, kubernetes, docker, aws, architecture]
---

# Software Architecture

Archetype for software system architecture diagrams. Produces JSON files compatible with the
knowledge-base diagram viewer.

## JSON Schema

The diagram JSON file follows this structure:

\```json
{
  "title": "string",
  "layers": [LayerDef],
  "nodes": [SerializedNodeData],
  "connections": [Connection],
  "layerManualSizes": {},
  "lineCurve": "orthogonal",
  "flows": [FlowDef]
}
\```

### LayerDef

\```json
{
  "id": "ly-<short-id>",
  "title": "LAYER TITLE IN UPPERCASE",
  "bg": "#hex6",
  "border": "#hex6"
}
\```

### SerializedNodeData

\```json
{
  "id": "el-<short-id>",
  "label": "Node Label",
  "sub": "Optional subtitle/description",
  "icon": "IconName",
  "x": 450,
  "y": 100,
  "w": 210,
  "layer": "ly-<layer-id>"
}
\```

### Connection

\```json
{
  "id": "dl-<short-id>",
  "from": "el-<source-id>",
  "to": "el-<target-id>",
  "fromAnchor": "bottom-1",
  "toAnchor": "top-1",
  "color": "#hex6",
  "label": "Connection Label"
}
\```

### FlowDef

Flows are named groupings of contiguous connections that represent end-to-end data paths.
When selected in the app, non-included elements dim to highlight the path.

\```json
{
  "id": "flow-<descriptive-short-id>",
  "name": "Human Readable Flow Name",
  "connectionIds": ["dl-conn1", "dl-conn2", "dl-conn3"]
}
\```

**Contiguity constraint**: Connections in a flow MUST form a connected graph — each connection
must share at least one node (`from`/`to`) with another connection in the flow.

**Ordering**: List `connectionIds` in traversal order (source → destination).

## Layer Conventions

| Layer | Purpose | Background | Border |
|-------|---------|-----------|--------|
| Clients | Browsers, mobile apps, external consumers | `#eff6ff` | `#bfdbfe` |
| Filters/Middleware | Request processing, auth filters, rate limiting | `#fef3c7` | `#fcd34d` |
| Authentication | Identity providers, auth managers | `#ecfdf5` | `#6ee7b7` |
| Authorization | Access control, voters, decisions | `#fdf2f8` | `#f9a8d4` |
| Application | Controllers, services, business logic | `#f5f3ff` | `#c4b5fd` |
| Data/Infrastructure | Databases, caches, storage, message queues | `#f1f5f9` | `#cbd5e1` |
| Networking | Load balancers, API gateways, DNS | `#ecfeff` | `#a5f3fc` |
| Monitoring | Logging, metrics, alerting | `#fff1f2` | `#fecdd3` |

## Icon Mappings

| Concept | Icon | Why |
|---------|------|-----|
| Web browser | `Globe` | Standard web icon |
| Mobile app | `Smartphone` | Mobile device |
| API/endpoint | `Code` | Code interface |
| Server/service | `Server` | Backend service |
| Server with config | `ServerCog` | Configurable service |
| Database | `Database` | Data storage |
| Database (fast) | `DatabaseZap` | Cache or fast-access store |
| Cloud service | `Cloud` | External cloud |
| Cloud config | `CloudCog` | Managed cloud service |
| Authentication | `Key` | Access/identity |
| Security/firewall | `Shield` | Protection |
| Security (verified) | `ShieldCheck` | Verified/authorized |
| Container | `Container` | Docker/K8s |
| CPU/compute | `Cpu` | Processing |
| Storage | `HardDrive` | Disk/file storage |
| Network | `Network` | Networking |
| Router | `Router` | Traffic routing |
| Load balancer | `Cable` | Connection distribution |
| Plugin/integration | `Plug` | Extension point |
| Email | `Mail` | Email service |
| User | `User` | Single user |
| Users/team | `Users` | Multiple users |
| Monitoring | `Activity` | Metrics/health |
| Alerts | `Bell` | Notifications |
| Terminal | `Terminal` | CLI/shell |
| Fingerprint | `Fingerprint` | Biometric/unique ID |
| Git/version control | `GitBranch` | Source control |
| Layers/stack | `Layers` | Multi-tier |
| Lock | `Lock` | Restricted access |
| Archive | `Archive` | Cold storage |

## Connection Semantics

| Flow Type | Color | Meaning |
|-----------|-------|---------|
| Primary request flow | `#3b82f6` (blue) | HTTP requests, main data path |
| Authentication/security | `#10b981` (green) | Auth delegation, credential verification |
| Authorization/decisions | `#f59e0b` (amber) | Access decisions, exceptions |
| Data access | `#64748b` (slate) | Database queries, storage access |
| Application logic | `#8b5cf6` (purple) | Business logic, service calls |
| Error/fallback | `#ef4444` (red) | Error paths, circuit breakers |

## Layout Preferences

- **Primary flow direction:** top-to-bottom
- **Density:** standard
- **Emphasis:** hierarchy
- **Center axis:** x ≈ 750, all layers align around it

### Anchor Points

Each node has 12 anchor points (3 per side):

| Side | Positions (at 25%, 50%, 75% of edge) |
|------|--------------------------------------|
| Top | `top-0`, `top-1`, `top-2` |
| Bottom | `bottom-0`, `bottom-1`, `bottom-2` |
| Left | `left-0`, `left-1`, `left-2` |
| Right | `right-0`, `right-1`, `right-2` |

### Critical Spacing Rules

**Node Dimensions:**
- Default width: 210px (valid range: 110-230px)
- Node height: 70px for w >= 140, 60px for w = 110 or 130

**Minimum Gaps (from constants.ts):**
- `NODE_GAP` = 8px minimum between nodes (use **70px+** for connection routing room)
- `LAYER_GAP` = 10px minimum between layer boundaries (use **50px+** for visual clarity)
- `LAYER_PADDING` = 25px inside layers around nodes
- `LAYER_TITLE_OFFSET` = 20px extra vertical space at top of layer for title

**Layer Auto-Sizing Formula:**
- Left: `minNodeX - 25`
- Right: `maxNodeX + maxNodeW + 25`
- Top: `minNodeY - 45` (25 padding + 20 title offset)
- Bottom: `maxNodeY + nodeHeight + 25`

**Connection Routing Constants:**
- `STUB_LENGTH` = 20px
- `OBSTACLE_PADDING` = 15px
- `CORNER_RADIUS` = 6px

**Required Spacing for Clean Layouts:**

| Between | Minimum | Recommended | Why |
|---------|---------|-------------|-----|
| Nodes in same row | 8px | **70px** | Stub(20) + ObstaclePad(15) on each side |
| Nodes in same layer, different rows | 8px | **80px** vertical | Space for horizontal connection segments |
| Node edges across adjacent layers | — | **120-160px** | Stubs(20x2) + routing room + label space |
| Layer boundaries | 10px | **50-80px** | Visual separation + routing corridors |

### Symmetry Rules

1. Establish a vertical center axis (x ≈ 750) that all layers align around
2. Symmetric pairs mirror around this axis
3. Symmetric triads have equal spacing with middle node on/near center axis
4. Same gap within a row — all adjacent nodes use identical spacing
5. Row alignment — nodes in the same logical row share the same Y coordinate
6. Vertically aligned connections where possible

### Condition Nodes (Canvas-Level Diamonds)

Condition nodes (`"shape": "condition"`) live on the canvas (no `layer` property) and must
not overlap any layer bounds.

1. Create sufficient gap: `conditionHeight + 2 * LAYER_GAP + 20px` between adjacent layers
2. Center in the gap: Y midpoint between two layer boundaries
3. Center on main axis when connections fan out symmetrically
4. Collision verification: `conditionTop > upperLayerBottom + LAYER_GAP` and `conditionBottom < lowerLayerTop - LAYER_GAP`
5. When no gap exists: place to the right of the wider layer

### Connection Label Positioning

| Scenario | labelPosition | Rationale |
|----------|--------------|-----------|
| Condition outputs | **0.70** | Push label toward target, away from diamond |
| Short vertical fan-outs | **0.60** | Nudge toward children |
| Long diagonal connections | **0.20–0.30** | Keep label near source |
| Cross-layer horizontal | **0.70** | Keep near target end |
| Very long return paths | **0.15–0.20** | Keep near source |
| Short horizontal chains | **0.50** | Midpoint is fine |

## Flow Design Guidelines

1. Identify all meaningful end-to-end paths
2. Create flows for each distinct path — happy paths and error/fallback paths
3. Flows can share connections
4. Name flows descriptively
5. Verify contiguity

### Flow Categories

| Category | Description | Example |
|----------|-------------|---------|
| Happy path | Full request → response | Browser → Filters → Auth → App → DB |
| Authentication paths | Per-provider auth flows | OAuth2: Filter → Manager → Provider → External |
| Error/exception paths | Failure handling | Auth failure → Exception handler → Error response |
| Data access paths | Storage read/write | Service → Repository → Database |
| Cross-cutting paths | Shared infrastructure | Session management, logging pipeline |

## Design Process

1. Identify layers — group by architectural concern
2. List all nodes per layer with appropriate icons
3. Map connections with labeled data flows
4. Establish center axis at x ≈ 750
5. Compute coordinates — start from y=100, add 120-160px between layer node edges
6. Verify all gaps — node-to-node, layer-to-layer, cross-layer
7. Position condition nodes — center in gaps, verify no collisions
8. Adjust label positions per the table above
9. Assign colors per flow type
10. Define flows — trace end-to-end paths, verify contiguity

## Verification

After creating the JSON, load it in the app to verify:
1. All layers render with correct colors and titles
2. All nodes positioned within their layers without overlap
3. All connections route cleanly
4. Labels readable and don't overlap
5. All flows listed in the Architecture Properties panel
6. Selecting a flow correctly dims non-included elements
```

Note: The triple-backtick JSON blocks above use `\``` ` as escape notation. When writing the actual file, use real triple backticks — the escaping is only to avoid breaking the plan's own markdown.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/skills
git add knowledge-base/archetypes/
git commit -m "feat: add archetype template and software-architecture archetype"
```

Note: If `~/.claude/skills/` is not a git repo, skip the commit step.

---

## Task 2: Create the Router (`SKILL.md`)

**Files:**
- Create: `~/.claude/skills/knowledge-base/SKILL.md`

- [ ] **Step 1: Write the router skill file**

Write `~/.claude/skills/knowledge-base/SKILL.md`:

```markdown
---
name: knowledge-base
description: >
  Unified skill for managing knowledge-base vaults. Sub-commands: init (set up a vault),
  diagram (generate a diagram on any topic), document (generate a standalone document),
  create (generate both a document and diagram, linked together).
  Trigger on: "knowledge-base", "kb", "create architecture", "design diagram",
  "architecture of X", "create document", "write about X", "init vault",
  "initialize vault", "set up vault", "create about X", "diagram of X".
argument-hint: <sub-command> [args] — sub-commands: init, diagram, document, create
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, Agent, WebSearch, WebFetch]
version: 1.0.0
---

# Knowledge Base

Unified skill for managing knowledge-base vaults — collections of documents and diagrams
on any topic, linked via wiki-links and indexed by graphify.

## Usage

\```
/knowledge-base init [path]                  # Initialize a vault
/knowledge-base diagram <topic>              # Generate a diagram
/knowledge-base document <topic> [-i]        # Generate a document
/knowledge-base create <topic> [-i]          # Generate both, linked
\```

## Sub-Command Routing

Parse the first argument as the sub-command. Route as follows:

1. **No argument or `help`:** Print the usage block above and a brief description of each sub-command.

2. **`init`:** Read `~/.claude/skills/knowledge-base/commands/init.md` and follow its instructions. Pass remaining arguments as the path.

3. **`diagram`:** Read `~/.claude/skills/knowledge-base/commands/diagram.md` and follow its instructions. Pass remaining arguments as the topic.

4. **`document`:** Read `~/.claude/skills/knowledge-base/commands/document.md` and follow its instructions. Pass remaining arguments as the topic (check for `-i`/`--interactive` flag).

5. **`create`:** Read `~/.claude/skills/knowledge-base/commands/create.md` and follow its instructions. Pass remaining arguments as the topic (check for `-i`/`--interactive` flag).

6. **Unrecognized sub-command:** Treat the entire argument string as a topic and route to `create` (the most common use case).

## Compound Intelligence

Before executing any sub-command, gather context from all available intelligence systems:

1. **graphify** — query the vault's knowledge graph for related content: `/graphify query "<topic>"`
2. **claude-mem** — search past session work: use claude-mem MCP tools to find relevant observations
3. **MEMORY.md** — read the vault's `MEMORY.md` for archetype preferences, topic registry, feedback

Pass this context to the sub-command so it can make informed decisions.

## Vault Detection

Several sub-commands need to know if we're inside a vault:

1. Check if the current working directory (or any parent up to 3 levels) contains `.archdesigner/config.json`
2. If found, that directory is the vault root — read `config.json` for vault name
3. If not found, the command may still work (e.g., `diagram` can write to cwd) but warn that vault features (link index, graphify, archetype learning) won't be available
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills
git add knowledge-base/SKILL.md
git commit -m "feat: add knowledge-base router skill"
```

---

## Task 3: Create the Init Command (`commands/init.md`)

**Files:**
- Create: `~/.claude/skills/knowledge-base/commands/init.md`

- [ ] **Step 1: Create the commands directory**

```bash
mkdir -p ~/.claude/skills/knowledge-base/commands
```

- [ ] **Step 2: Write the init command file**

Write `~/.claude/skills/knowledge-base/commands/init.md`. This absorbs the content from `~/.claude/skills/init-vault/SKILL.md` and adds CLAUDE.md generation, MEMORY.md + memory/ directory, and graphify hook installation:

```markdown
# /knowledge-base init [path]

Initialize a folder as a knowledge-base vault — a collection of documents (`.md`) and
diagrams (`.json`) linked via wiki-links and indexed by graphify.

## Step 1: Resolve target directory

Parse arguments to determine the target path:

1. **No argument:** Use the current working directory (`$PWD`)
2. **Relative path** (e.g., `./my-project`, `subdir`): Resolve relative to `$PWD`
3. **Absolute path** (e.g., `/tmp/vault`, `~/vaults/work`): Use as-is (expand `~`)

Resolve to an absolute canonical path:
\```bash
TARGET_DIR=$(cd "<provided-path>" 2>/dev/null && pwd || echo "<provided-path>")
\```

If the target directory does not exist, create it:
\```bash
mkdir -p "<resolved-path>"
\```

Confirm with the user:
> Initializing vault at: `<resolved-absolute-path>`

Check if it's already a vault:
\```bash
ls -la <resolved-path>/.archdesigner/config.json 2>/dev/null
\```

If config.json exists, inform the user and ask if they want to reinitialize. If reinitializing:
- Preserve existing `_links.json` (don't overwrite backlink data)
- Update `config.json` with new `lastOpened` timestamp
- Only create files that don't already exist
- Warn before overwriting anything

## Step 2: Ask vault name

Ask the user what to name the vault. Suggest the directory name as default.

## Step 3: Create `.archdesigner/` config

\```bash
mkdir -p "<resolved-path>/.archdesigner"
\```

Write `<resolved-path>/.archdesigner/config.json`:

\```json
{
  "version": "1.0",
  "name": "<vault-name>",
  "created": "<ISO-8601-timestamp>",
  "lastOpened": "<ISO-8601-timestamp>"
}
\```

Write `<resolved-path>/.archdesigner/_links.json`:

\```json
{
  "updatedAt": "<ISO-8601-timestamp>",
  "documents": {},
  "backlinks": {}
}
\```

## Step 4: Ask about starter structure

Ask the user which optional starter content to create:

**Option A: Minimal (recommended)**
- Just the `.archdesigner/` config — add documents as needed

**Option B: Documentation structure**
- Creates `docs/` with subdirectories: `docs/architecture/`, `docs/components/`, `docs/guides/`
- Creates a starter `README.md`

**Option C: Full starter kit**
- Everything in Option B, plus:
  - `docs/architecture/001-initial-architecture.md` — ADR template with wiki-link examples
  - `docs/guides/getting-started.md` — getting started template

Starter document templates are the same as the old init-vault skill — use `<vault-name>` in headings,
include wiki-link examples like `[[README]]` and `[[docs/architecture/001-initial-architecture]]`.
Update references from "Architecture Designer" to "Knowledge Base" in template text.

## Step 5: Write `CLAUDE.md`

Write a lean, static `<resolved-path>/CLAUDE.md`:

\```markdown
# <vault-name>

Knowledge-base vault — documents and diagrams on any topic, linked via wiki-links.

## File Conventions

- `.json` files are diagrams (visual overviews rendered by the knowledge-base app)
- `.md` files are documents (rich markdown with wiki-link support)
- `[[wiki-links]]` connect documents to each other and to diagrams
- `.archdesigner/` contains vault config — do not edit manually

## Intelligence

- See `MEMORY.md` for archetype preferences, topic registry, and vault feedback
- Use `/graphify query "<question>"` to search vault content
- Use `/mem-search "<query>"` to recall past session work in this vault

## Archetypes

Diagram archetypes define domain-specific conventions (layer colors, icons, layout).
See `~/.claude/skills/knowledge-base/archetypes/` for available archetypes.
Preferences learned from your corrections are saved in `memory/archetype-preferences.md`.

## Diagram JSON

Diagrams follow the schema defined in the active archetype. The default archetype is
`software-architecture` — see `~/.claude/skills/knowledge-base/archetypes/software-architecture.md`.
\```

## Step 6: Write `MEMORY.md` and `memory/` directory

\```bash
mkdir -p "<resolved-path>/memory"
\```

Write `<resolved-path>/MEMORY.md`:

\```markdown
# Vault Memory

Index of vault-specific memories. These grow as you work.

- [Archetype Preferences](memory/archetype-preferences.md) — Learned diagram style preferences for this vault
- [Topic Registry](memory/topic-registry.md) — Topics covered in this vault
\```

Write `<resolved-path>/memory/archetype-preferences.md`:

\```markdown
---
name: Archetype Preferences
description: Learned diagram style preferences — icon choices, layer colors, layout corrections
type: feedback
---

No preferences recorded yet. As you create diagrams and make corrections,
preferences will be saved here automatically.
\```

Write `<resolved-path>/memory/topic-registry.md`:

\```markdown
---
name: Topic Registry
description: Topics covered in this vault — which have diagrams, which have documents
type: reference
---

No topics registered yet. Topics are added as you create content with
`/knowledge-base create` or `/knowledge-base diagram`.
\```

## Step 7: Install graphify hook

Run graphify's Claude Code installer inside the vault directory so vault content gets indexed:

\```bash
export PATH="$HOME/.local/bin:$PATH"
cd "<resolved-path>" && graphify claude install
\```

If graphify is not installed, skip this step and tell the user:
> graphify not found — run `pipx install graphifyy` to enable knowledge graph indexing.

## Step 8: Create `.graphifyignore`

Write or append to `<resolved-path>/.graphifyignore`:

\```
# Knowledge Vault config
.archdesigner/
memory/
\```

## Step 9: Build initial graphify index

If the vault has existing `.md` or `.json` files, offer to build the initial index:

\```bash
export PATH="$HOME/.local/bin:$PATH"
cd "<resolved-path>" && graphify . --update
\```

If no content exists yet, skip and tell the user they can run `/graphify .` after adding content.

## Step 10: Print summary

\```
Knowledge Base initialized: <vault-name>
  Location:  <resolved-path>
  Config:    .archdesigner/config.json
  Index:     .archdesigner/_links.json
  CLAUDE.md: vault instructions
  Memory:    MEMORY.md + memory/

Intelligence:
  Graphify:  <installed | not available>
  Claude-mem: global (auto-active)

Next steps:
  /knowledge-base create <topic>     — create a document + diagram
  /knowledge-base diagram <topic>    — create a diagram only
  /knowledge-base document <topic>   — create a document only
\```
```

- [ ] **Step 3: Commit**

```bash
cd ~/.claude/skills
git add knowledge-base/commands/init.md
git commit -m "feat: add /knowledge-base init command"
```

---

## Task 4: Create the Diagram Command (`commands/diagram.md`)

**Files:**
- Create: `~/.claude/skills/knowledge-base/commands/diagram.md`

- [ ] **Step 1: Write the diagram command file**

Write `~/.claude/skills/knowledge-base/commands/diagram.md`:

```markdown
# /knowledge-base diagram <topic>

Generate a diagram JSON file for any topic. Not limited to software architecture — handles
mechanical systems, biological processes, business workflows, or any domain.

## Step 1: Detect vault and gather context

1. **Vault detection:** Check for `.archdesigner/config.json` in cwd or up to 3 parent levels.
   If found, read vault name and set vault root path.

2. **Compound intelligence:**
   - Read vault's `memory/archetype-preferences.md` for learned preferences
   - Read vault's `memory/topic-registry.md` for existing topics
   - Query **graphify** for related content in the vault: what diagrams and documents already exist
     on this or adjacent topics? Reuse layer/color conventions for consistency.
   - Query **claude-mem** for past diagram sessions: corrections the user made, preferences expressed

## Step 2: Select archetype

1. Read all archetype files from `~/.claude/skills/knowledge-base/archetypes/` (excluding `_archetype-template.md`)
2. For each archetype, check if the topic matches its `domain-indicators`
3. If a match is found, use that archetype's conventions
4. If no match, use the archetype template (`_archetype-template.md`) as a structural guide and
   adapt on the fly:
   - Choose appropriate layer categories for the domain
   - Map domain concepts to the best-fit Lucide icons
   - Select connection colors that make semantic sense for the domain
   - Apply the same spacing and layout rules from the software-architecture archetype
     (these are universal: anchor points, gaps, symmetry, condition nodes)

## Step 3: Generate the diagram

Follow the design process defined in the selected/adapted archetype:

1. Identify layers — group concepts by category
2. List all nodes per layer with appropriate icons and labels
3. Map connections between nodes with labeled relationships
4. Establish center axis and compute coordinates
5. Verify all gaps and spacing
6. Position any condition nodes
7. Adjust label positions to prevent overlaps
8. Assign connection colors by semantic type
9. Define flows — trace meaningful end-to-end paths, verify contiguity

**Output location:**
- If in a vault: write to `<vault-root>/<topic-slug>.json`
- If not in a vault: write to `<cwd>/<topic-slug>.json`

The `<topic-slug>` is the topic lowercased, spaces replaced with hyphens, special characters removed.

## Step 4: Update vault state

If in a vault:

1. **Update graphify** — rebuild incrementally so the new diagram is immediately queryable:
   \```bash
   export PATH="$HOME/.local/bin:$PATH"
   cd "<vault-root>" && graphify . --update
   \```

2. **Update topic registry** — append an entry to `memory/topic-registry.md`:
   \```markdown
   - **<topic>** — diagram: `<topic-slug>.json` (created <date>)
   \```

3. **Auto-learn archetype preferences** — if Claude adapted conventions for a novel domain
   (new icon mappings, layer color choices), append them to `memory/archetype-preferences.md`:
   \```markdown
   ## <Domain Name> (learned <date>)
   - Icon: <concept> → <LucideIcon> (reason)
   - Layer color: <layer-name> → bg:<#hex>, border:<#hex>
   \```

   Also auto-learn from user corrections during the session: if the user asks to change
   colors, icons, layout, or other conventions, save those corrections as preferences.

## Step 5: Verification

After writing the JSON, tell the user they can verify by opening it in the knowledge-base app:
1. All layers render with correct colors and titles
2. All nodes positioned within layers without overlap
3. All connections route cleanly
4. Labels readable and don't overlap
5. Flows listed and selectable
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills
git add knowledge-base/commands/diagram.md
git commit -m "feat: add /knowledge-base diagram command"
```

---

## Task 5: Create the Document Command (`commands/document.md`)

**Files:**
- Create: `~/.claude/skills/knowledge-base/commands/document.md`

- [ ] **Step 1: Write the document command file**

Write `~/.claude/skills/knowledge-base/commands/document.md`:

```markdown
# /knowledge-base document <topic> [-i|--interactive]

Generate a standalone markdown document on any topic. The document is comprehensive,
well-structured prose — not a template or outline.

## Step 1: Parse arguments

- Extract the topic from the arguments (everything except flags)
- Check for `-i` or `--interactive` flag

## Step 2: Detect vault and gather context

1. **Vault detection:** Check for `.archdesigner/config.json` in cwd or up to 3 parent levels.
   If found, read vault name and set vault root path.

2. **Compound intelligence:**
   - Read vault's `memory/topic-registry.md` for existing topics
   - Query **graphify** for related content: existing diagrams and documents on adjacent topics
   - Query **claude-mem** for past work on this topic, document structure preferences
   - Read vault's `MEMORY.md` for feedback on document style/depth

## Step 3: Interactive mode (if `-i` flag)

If the `-i` or `--interactive` flag is set, ask 2-3 questions before generating:

1. **Target audience:** Who is this document for? (e.g., beginner, expert, mixed)
2. **Depth level:** How detailed should the document be? (e.g., overview, detailed, exhaustive)
3. **Specific angles:** Any particular aspects to focus on or exclude?

Wait for answers before proceeding to generation.

## Step 4: Generate the document

Write a comprehensive, well-structured markdown document:

- **Title** as H1
- **Sections** with clear H2/H3 headings
- **Prose** — actual content, not placeholder text
- **Cross-references:** If related diagrams exist in the vault, include `[[diagram-name.json]]`
  wiki-links where they would help the reader visualize concepts
- **Cross-references:** If related documents exist in the vault, include `[[other-doc]]`
  wiki-links to connect related knowledge

**Output location:**
- If in a vault with doc structure: write to the most appropriate subdirectory
- If in a vault without structure: write to `<vault-root>/<topic-slug>.md`
- If not in a vault: write to `<cwd>/<topic-slug>.md`

## Step 5: Update vault state

If in a vault:

1. **Update graphify** incrementally:
   \```bash
   export PATH="$HOME/.local/bin:$PATH"
   cd "<vault-root>" && graphify . --update
   \```

2. **Update link index** — the wiki-links in the new document need to be tracked.
   If the knowledge-base app is not running, note that the link index will be
   updated automatically when the vault is next opened in the app.

3. **Update topic registry** — append to `memory/topic-registry.md`:
   \```markdown
   - **<topic>** — document: `<topic-slug>.md` (created <date>)
   \```
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills
git add knowledge-base/commands/document.md
git commit -m "feat: add /knowledge-base document command"
```

---

## Task 6: Create the Create Command (`commands/create.md`)

**Files:**
- Create: `~/.claude/skills/knowledge-base/commands/create.md`

- [ ] **Step 1: Write the create command file**

Write `~/.claude/skills/knowledge-base/commands/create.md`:

```markdown
# /knowledge-base create <topic> [-i|--interactive]

The compound command — generates both a document and a diagram on the same topic,
linked via wiki-links. The document is the primary knowledge artifact; the diagram
supplements it as a visual overview that helps the reader orient themselves.

## Step 1: Parse arguments

- Extract the topic from the arguments (everything except flags)
- Check for `-i` or `--interactive` flag

## Step 2: Detect vault and gather context

1. **Vault detection:** Check for `.archdesigner/config.json` in cwd or up to 3 parent levels.
   If found, read vault name and set vault root path.

2. **Compound intelligence:**
   - Read vault's `memory/archetype-preferences.md` for learned diagram preferences
   - Read vault's `memory/topic-registry.md` for existing topics
   - Query **graphify** for related content in the vault
   - Query **claude-mem** for past work on this topic
   - Read vault's `MEMORY.md` for feedback

## Step 3: Interactive mode (if `-i` flag)

If the `-i` or `--interactive` flag is set, ask 2-3 questions:

1. **Target audience:** Who is this for?
2. **Depth level:** Overview, detailed, or exhaustive?
3. **Specific angles:** Particular aspects to focus on or exclude?

Wait for answers before proceeding.

## Step 4: Generate the document FIRST

The document establishes the concepts, structure, and relationships. Generate it following
the same process as `/knowledge-base document` (Step 4 in `commands/document.md`):

- Comprehensive, well-structured prose
- Clear H2/H3 sections
- Cross-references to existing vault content via wiki-links

**Additionally:** Include a wiki-link to the diagram near the top of the document:

\```markdown
# <Topic Title>

> Visual overview: [[<topic-slug>.json]]

<rest of document...>
\```

**Output:** `<topic-slug>.md` at vault root or appropriate subdirectory.

## Step 5: Generate the diagram SECOND

The diagram is informed by the document's content — it maps the key concepts into layers
and nodes. Generate it following the same process as `/knowledge-base diagram` (Steps 2-3
in `commands/diagram.md`):

- Select/adapt archetype based on topic domain
- Layers represent the major categories from the document
- Nodes represent the key concepts
- Connections represent the relationships described in the document
- Flows trace the major paths/processes described in the document

The diagram title should match the document topic.

**Output:** `<topic-slug>.json` at the same location as the document.

## Step 6: Update vault state

If in a vault:

1. **Update graphify** — rebuild incrementally (both files):
   \```bash
   export PATH="$HOME/.local/bin:$PATH"
   cd "<vault-root>" && graphify . --update
   \```

2. **Update link index** — the document's wiki-links (including the `[[<topic-slug>.json]]`
   reference to the diagram) need to be tracked.

3. **Update topic registry** — append to `memory/topic-registry.md`:
   \```markdown
   - **<topic>** — document: `<topic-slug>.md`, diagram: `<topic-slug>.json` (created <date>)
   \```

4. **Auto-learn archetype preferences** — same as `/knowledge-base diagram` Step 4:
   save any novel domain adaptations and user corrections to `memory/archetype-preferences.md`.

## Naming Convention

- Document: `<topic-slug>.md` (e.g., `steam-engine.md`)
- Diagram: `<topic-slug>.json` (e.g., `steam-engine.json`)
- `<topic-slug>`: topic lowercased, spaces replaced with hyphens, special characters removed
- Both files at vault root, or in matching subdirectory if vault has structure
```

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/skills
git add knowledge-base/commands/create.md
git commit -m "feat: add /knowledge-base create command"
```

---

## Task 7: Update Global CLAUDE.md and Clean Up Old Skills

**Files:**
- Modify: `~/.claude/CLAUDE.md`
- Delete: `~/.claude/skills/create-architecture/SKILL.md`
- Delete: `~/.claude/skills/init-vault/SKILL.md`

- [ ] **Step 1: Update global CLAUDE.md**

Read `~/.claude/CLAUDE.md`. Remove the `create-architecture` and `init-vault` references (if any exist — they may be registered elsewhere). Add the `/knowledge-base` skill entry.

The knowledge-base entry should be:

```markdown
# knowledge-base
- **knowledge-base** (`~/.claude/skills/knowledge-base/SKILL.md`) - unified skill for knowledge-base vaults. Sub-commands: init, diagram, document, create. Trigger: `/knowledge-base` or `/kb`
When the user types `/knowledge-base` or `/kb`, invoke the Skill tool with `skill: "knowledge-base"` before doing anything else.
```

Preserve all other existing content (graphify, hybrid-search, compound-dispatch, Memory Routing Protocol, Post-Review Memory Protocol, Post-Implementation Lessons).

- [ ] **Step 2: Delete old skill files**

```bash
rm -rf ~/.claude/skills/create-architecture
rm -rf ~/.claude/skills/init-vault
```

- [ ] **Step 3: Verify no dangling references**

Search for any remaining references to the old skill names in `~/.claude/`:

```bash
grep -r "create-architecture" ~/.claude/ --include="*.md" 2>/dev/null
grep -r "init-vault" ~/.claude/ --include="*.md" 2>/dev/null
```

Fix any found references to point to the new `/knowledge-base` commands.

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/skills
git add -A
git commit -m "feat: update global CLAUDE.md, remove old create-architecture and init-vault skills"
```

---

## Task 8: Verification

- [ ] **Step 1: Verify file structure**

```bash
find ~/.claude/skills/knowledge-base -type f | sort
```

Expected output:
```
~/.claude/skills/knowledge-base/SKILL.md
~/.claude/skills/knowledge-base/archetypes/_archetype-template.md
~/.claude/skills/knowledge-base/archetypes/software-architecture.md
~/.claude/skills/knowledge-base/commands/create.md
~/.claude/skills/knowledge-base/commands/diagram.md
~/.claude/skills/knowledge-base/commands/document.md
~/.claude/skills/knowledge-base/commands/init.md
```

- [ ] **Step 2: Verify old skills are gone**

```bash
ls ~/.claude/skills/create-architecture 2>&1
ls ~/.claude/skills/init-vault 2>&1
```

Expected: both should show "No such file or directory"

- [ ] **Step 3: Verify CLAUDE.md references**

```bash
grep -c "knowledge-base" ~/.claude/CLAUDE.md
grep -c "create-architecture" ~/.claude/CLAUDE.md
grep -c "init-vault" ~/.claude/CLAUDE.md
```

Expected: knowledge-base > 0, create-architecture = 0, init-vault = 0

- [ ] **Step 4: Smoke test — invoke `/knowledge-base` with no args**

Run `/knowledge-base` and verify it prints the help text with sub-commands listed.

- [ ] **Step 5: Final commit**

If any fixes were needed during verification:

```bash
cd ~/.claude/skills
git add -A
git commit -m "fix: address verification findings"
```
