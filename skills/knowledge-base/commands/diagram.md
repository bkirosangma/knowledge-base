# Command: diagram

Generate a diagram JSON file for any topic. Uses the archetype system to select visual conventions appropriate to the domain.

## Usage

```
/knowledge-base diagram <topic>
```

The `<topic>` is a free-form string describing what to diagram (e.g., "Kubernetes pod lifecycle", "TCP handshake", "photosynthesis process", "OAuth2 authorization code flow").

## Inputs

- **topic** (string, required): The subject of the diagram, passed from the SKILL.md dispatcher.
- **vault root** (string | null): The vault root path if vault detection succeeded, or null.
- **vault config** (object | null): Parsed `.archdesigner/config.json` if in a vault.
- **gathered context** (object): The compound intelligence context assembled by SKILL.md before dispatching.

## Step 1: Detect Vault and Gather Context

Vault detection is handled by SKILL.md before this command runs. Use the passed-in vault root and gathered context. Additionally, load vault-specific memory files:

### 1a. Archetype Preferences

If a vault is detected, check for `<vault-root>/memory/archetype-preferences.md`. If it exists, read it. This file contains learned icon mappings, color choices, and layout preferences from prior diagram sessions and user corrections. These preferences override archetype defaults when they conflict.

If the file does not exist, that is fine -- it will be created in Step 4.

### 1b. Topic Registry

If a vault is detected, check for `<vault-root>/memory/topic-registry.md`. If it exists, read it. This file lists all previously generated topics with their slugs, archetypes, and creation dates. Use this to:
- Avoid duplicate slugs (append `-2`, `-3`, etc. if the slug already exists)
- Detect related topics the user has diagrammed before (mention them if relevant)

### 1c. Additional Intelligence Queries

Beyond the context SKILL.md already gathered:
- Query graphify for the topic if a vault graph exists: look for related nodes, communities, and structural patterns that could inform the diagram layout.
- Query claude-mem for past diagram sessions: search for observations about prior diagrams, user corrections to layouts or icon choices, and archetype adaptations. Use MCP tool `mcp__plugin_claude-mem_mcp-search__search` with `query: "diagram <topic>"`.

## Step 2: Select Archetype

### 2a. Load All Archetypes

Read all `.md` files from `~/.claude/skills/knowledge-base/archetypes/` **excluding** `_archetype-template.md`. Parse the YAML frontmatter of each file to extract `name`, `description`, and `domain-indicators`.

### 2b. Match Topic to Archetype

For each archetype, check if the topic (lowercased) contains any of its `domain-indicators`. Score each archetype by number of matching indicators.

- **If one archetype wins** (highest match count, at least 1 match): Use that archetype. Read the full archetype file for all conventions (layers, icons, connections, layout, spacing rules, flows).
- **If multiple archetypes tie**: Prefer the one whose `description` most closely relates to the topic. If still ambiguous, use the first match alphabetically.
- **If no archetype matches**: Adapt on the fly (see 2c).

### 2c. On-the-Fly Adaptation

When no archetype matches, create ad-hoc conventions using `_archetype-template.md` as the structural guide:

1. **Layer categories**: Invent 3-6 layer categories appropriate to the topic's domain. Each layer needs a purpose, background color (`#hex6`), and border color (`#hex6`). Use soft pastel backgrounds with matching stronger borders (follow the color pattern from the software-architecture archetype).

2. **Icon mappings**: Map the topic's concepts to Lucide icons from the available set listed in the archetype template. Choose icons by visual metaphor:
   - People/roles: `User`, `Users`
   - Data/storage: `Database`, `HardDrive`, `Archive`, `Folder`
   - Processing/compute: `Cpu`, `Cog`, `ServerCog`
   - Communication: `Mail`, `Bell`, `Radio`, `Wifi`
   - Security: `Shield`, `ShieldCheck`, `Lock`, `Key`, `Fingerprint`
   - Monitoring: `Activity`, `BarChart`, `Monitor`
   - External/cloud: `Cloud`, `CloudCog`, `Globe`
   - Code/config: `Code`, `FileCode`, `Terminal`, `GitBranch`
   - Networking: `Network`, `Router`, `Cable`, `Plug`
   - Generic containers: `Box`, `Container`, `Layers`, `Server`

3. **Connection colors**: Assign 3-6 distinct colors for different flow types in the diagram. Use the software-architecture connection palette as a starting point and adapt:
   - Primary flow: `#3b82f6` (blue)
   - Secondary/alternate: `#10b981` (green)
   - Decision/branch: `#f59e0b` (amber)
   - Data/resource: `#64748b` (slate)
   - Internal/logic: `#8b5cf6` (purple)
   - Error/exception: `#ef4444` (red)

4. **Layout preferences**: Apply universal spacing rules from the software-architecture archetype (these are app constants and apply to ALL diagrams regardless of domain). Choose flow direction based on topic nature:
   - Processes, pipelines, hierarchies: top-to-bottom
   - Timelines, sequences, workflows: left-to-right
   - Ecosystems, networks: radial (approximate with centered layout)

5. **Check archetype preferences**: If `archetype-preferences.md` was loaded in Step 1a, apply any learned preferences that are relevant (e.g., the user previously chose `Cpu` for "processor" in a hardware diagram -- reuse that mapping).

## Step 3: Generate the Diagram

Follow the design process defined in the selected archetype (or the adapted conventions from 2c). The software-architecture archetype's Design Process section is the canonical reference -- adapt it to the domain.

### 3a. Design Process

Execute these steps in order:

1. **Identify layers**: Group the topic's concepts by category/concern. Each group becomes a layer. Assign layer colors from the archetype or adaptation.

2. **List all nodes**: For each layer, enumerate the specific components/concepts. Assign each:
   - `id`: `el-<short-descriptive-id>` (e.g., `el-browser`, `el-auth-svc`, `el-ribosomes`)
   - `label`: Human-readable name
   - `sub`: Optional subtitle or brief description
   - `icon`: From the archetype icon mappings or adapted mappings
   - `w`: Width in px (default 210, range 110-230)
   - `layer`: The layer ID this node belongs to

3. **Map connections**: Identify all relationships between nodes. Assign each:
   - `id`: `dl-<short-descriptive-id>`
   - `from` / `to`: Node IDs
   - `fromAnchor` / `toAnchor`: Anchor points (see Anchor Points in software-architecture archetype)
   - `color`: From the connection semantics
   - `label`: What flows along this connection
   - `labelPosition`: Adjusted per the Label Positioning table (do NOT leave all at 0.5)

4. **Establish center axis**: Set x ~ 750. Design symmetric pairs and triads around this axis.

5. **Compute coordinates**: Start from y = 100. Apply spacing rules:
   - Same-row horizontal gap: 70px+ between node edges
   - Cross-layer vertical gap: 120-160px between node edges across adjacent layers
   - Layer boundary gap: 50-80px between layer boundaries
   - Within-layer padding: 25px inside layers around nodes
   - Layer title offset: 20px extra at top of each layer

6. **Verify all gaps**: Check every node-to-node and layer-to-layer gap meets minimums. Fix any violations before proceeding.

7. **Position condition nodes** (if any): Place between layers with sufficient gap. Condition nodes have `"shape": "condition"` and NO `layer` property. Verify no layer collisions using the formula from the archetype.

8. **Adjust label positions**: Set `labelPosition` per scenario to prevent overlaps (condition outputs: 0.70, fan-outs: 0.60, long diagonals: 0.20-0.30, etc.).

9. **Assign colors**: Ensure each flow type uses a distinct color for visual tracing.

10. **Define flows**: Trace all meaningful end-to-end paths. Each flow:
    - Has an `id`: `flow-<descriptive-id>`
    - Has a `name`: Human-readable description of the path
    - Has `connectionIds`: Array of connection IDs forming a contiguous graph, listed in traversal order
    - Verify the contiguity constraint: each connection shares at least one node with another connection in the same flow

### 3b. JSON Output

Produce the diagram as a JSON file conforming to the schema defined in the software-architecture archetype:

```json
{
  "title": "<Diagram Title>",
  "layers": [LayerDef],
  "nodes": [SerializedNodeData],
  "connections": [Connection],
  "layerManualSizes": {},
  "lineCurve": "orthogonal",
  "flows": [FlowDef]
}
```

See the software-architecture archetype for the full schema of each type (LayerDef, SerializedNodeData, Connection, FlowDef).

### 3c. Output Location

- **If in a vault**: Write the JSON to `<vault-root>/<topic-slug>.json`
- **If not in a vault**: Write the JSON to `<cwd>/<topic-slug>.json`

### 3d. Topic Slug

Convert the topic to a file-safe slug:
1. Lowercase the topic string
2. Replace spaces with hyphens
3. Remove all characters that are not `a-z`, `0-9`, or `-`
4. Collapse consecutive hyphens into one
5. Trim leading/trailing hyphens

Examples:
- "Kubernetes Pod Lifecycle" -> `kubernetes-pod-lifecycle`
- "OAuth2 Authorization Code Flow" -> `oauth2-authorization-code-flow`
- "TCP/IP 3-Way Handshake" -> `tcpip-3-way-handshake`

If the slug already exists in the topic registry (Step 1b), append a numeric suffix: `<slug>-2`, `<slug>-3`, etc.

## Step 4: Update Vault State

Skip this entire step if no vault was detected.

### 4a. Update graphify

If graphify is available in the vault, run an incremental rebuild to index the new diagram:

```bash
cd <vault-root> && graphify . --update
```

If graphify is not installed or the command fails, skip silently -- this is a best-effort enhancement.

### 4b. Update Topic Registry

Append an entry to `<vault-root>/memory/topic-registry.md`. Create the file (and `memory/` directory) if they don't exist.

**Format of topic-registry.md:**

```markdown
# Topic Registry

All topics generated in this vault, ordered by creation date.

| Date | Topic | Slug | Archetype | File |
|------|-------|------|-----------|------|
| <ISO-date> | <topic> | <slug> | <archetype-name or "adapted"> | <filename>.json |
```

If the file already exists, append a new row to the table. If creating for the first time, write the header and the first row.

### 4c. Auto-Learn Archetype Preferences

Save any new or adapted conventions to `<vault-root>/memory/archetype-preferences.md`. Create the file (and `memory/` directory) if they don't exist.

**What to save:**

1. **Icon mappings used**: If the archetype was adapted on the fly (no match), save all icon choices so future diagrams in this domain reuse them.
2. **Color choices**: Save any custom layer colors or connection colors that were invented for a new domain.
3. **Layout decisions**: If a non-default flow direction was chosen, record it with the domain context.
4. **User corrections**: If during the session the user asks to change an icon, color, label, or layout choice, save the correction as a learned preference.

**Format of archetype-preferences.md:**

```markdown
# Archetype Preferences

Learned preferences from past diagram sessions. These override archetype defaults.

## Icon Overrides

| Domain | Concept | Icon | Learned From |
|--------|---------|------|-------------|
| <domain> | <concept> | <icon> | <topic> (<date>) |

## Color Preferences

| Domain | Flow Type | Color | Learned From |
|--------|-----------|-------|-------------|
| <domain> | <flow-type> | <color> | <topic> (<date>) |

## Layout Preferences

| Domain | Setting | Value | Learned From |
|--------|---------|-------|-------------|
| <domain> | <setting> | <value> | <topic> (<date>) |
```

If the file already exists, merge new entries into the existing tables. Do not duplicate entries -- if an identical mapping already exists, skip it.

### 4d. Auto-Learn from User Corrections

If the user requests changes to the generated diagram during the session (e.g., "change the database icon to HardDrive", "make the auth connections red instead of green", "move the API gateway to the left"), apply the change to the JSON file AND save the preference to `archetype-preferences.md` so future diagrams benefit from the correction.

When saving a correction, record:
- The original choice and the user's preferred choice
- The domain context so it applies to similar future topics
- The date for freshness tracking

## Step 5: Verification

After writing the JSON file, present the user with a verification checklist and tell them to load the diagram in the knowledge-base app:

```
Diagram generated: <filename>.json
Location: <full-path>

Please open this file in the knowledge-base app and verify:

1. All layers render with correct colors and titles
2. All nodes are positioned within their layers without overlap
3. All connections route cleanly between nodes
4. Labels are readable and don't overlap other elements
5. All flows are listed in the Architecture Properties panel
6. Selecting a flow correctly highlights the intended path

If anything needs adjustment, describe the change and I'll update
the diagram and save the preference for future use.
```

If in a vault, also mention:
```
Vault updated:
- Topic registered in memory/topic-registry.md
- Preferences saved to memory/archetype-preferences.md
- graphify index updated (if available)
```
