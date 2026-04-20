# Command: validate

Validate a diagram JSON file against the knowledge-base app's schema and semantic rules. Optionally auto-fix fixable issues. Useful when hand-authoring a diagram, importing one from another source, or recovering a file the app refuses to load.

## Usage

```
/knowledge-base validate <path> [--fix] [--report-only]
```

- `<path>` — path to the `.json` file (or a glob like `*.json`) to validate. Required.
- `--fix` — write the corrected JSON back to disk after validation. Without this flag, validation is read-only and only prints a report. The original file is backed up to `<file>.invalid-backup-<ISO-timestamp>.json` before overwriting.
- `--report-only` — alias for "no --fix" (explicit about intent). Default when `--fix` is omitted.

Examples:

```
/knowledge-base validate ./auth-flow.json
/knowledge-base validate ./auth-flow.json --fix
/knowledge-base validate "./diagrams/*.json"
/kb validate broken.json --fix
```

## Inputs

- **path** (string, required): file path or glob. Passed from the SKILL.md dispatcher as the remaining args.
- **fix** (boolean): true if `--fix` was in the args. Strip the flag before treating the rest as the path.
- **vault root** / **vault config** / **gathered context** — passed by SKILL.md as with other sub-commands. Not required for validation itself, but a vault context is useful for cross-file checks (e.g., duplicate node IDs across siblings).

## Schema Reference

The canonical schema lives in `~/.claude/skills/knowledge-base/archetypes/software-architecture.md` under *JSON Schema*. The summary below restates the invariants the validator enforces — if the archetype ever diverges from the app's runtime (in `src/app/knowledge_base/features/diagram/utils/persistence.ts`), the archetype is authoritative for *what the skill produces*, and the app is authoritative for *what the app accepts*. When in doubt, cross-check both.

### Top-level shape

```json
{
  "title": "string",
  "layers":   [LayerDef],
  "nodes":    [SerializedNodeData],
  "connections": [Connection],
  "layerManualSizes": {},
  "lineCurve": "orthogonal" | "curved" | "straight",
  "flows":    [FlowDef],
  "documents": [DocumentMeta]?      // optional, may be omitted
}
```

### LayerDef

```json
{
  "id": "ly-<short-id>",
  "title": "LAYER TITLE",
  "bg": "#rrggbb",
  "border": "#rrggbb",
  "textColor": "#rrggbb"?           // optional
}
```

### SerializedNodeData

```json
{
  "id": "el-<short-id>",
  "label": "string",
  "sub": "string"?,                 // optional
  "icon": "LucideIconName",
  "x": number,
  "y": number,
  "w": number,
  "layer": "ly-<id>",               // required UNLESS shape === "condition"
  "shape": "condition"?             // optional; when "condition", layer may be omitted
}
```

### Connection

```json
{
  "id": "dl-<short-id>",
  "from": "el-<source-id>",
  "to":   "el-<target-id>",
  "fromAnchor": "top-1" | "right-1" | "bottom-1" | "left-1" | "cond-out-0" | ...,
  "toAnchor":   same shape,
  "color": "#rrggbb",
  "label": "string"?,
  "labelPosition": number (0..1)?
}
```

### FlowDef

```json
{
  "id": "flow-<short-id>",
  "name": "string",
  "connectionIds": ["dl-...", "dl-..."]
}
```

**Contiguity invariant**: every connection in `connectionIds` must share at least one node (`from` or `to`) with another connection in the same flow. Single-connection flows are trivially contiguous.

## Step 1: Load and Parse

1. Expand the glob (if any) into a list of target files. For a single path, that's just `[path]`.
2. For each file:
   - Read the file.
   - Try `JSON.parse`. If it throws:
     - Classify the parse error (unexpected token, trailing comma, unclosed brace, etc.).
     - Emit a **FATAL** diagnostic: "Invalid JSON at <file>: <message>". Do NOT attempt to fix malformed JSON automatically — hand-fixing is safer than heuristic repair. Print the first 200 chars around the error column so the user can fix it, then skip to the next file.

If `--fix` is set and the file is not parseable, do NOT write anything — leave the file as-is.

## Step 2: Structural Checks

For each parsed diagram object, run every rule below. Collect diagnostics into three buckets: **errors** (violates a must-have invariant), **warnings** (auto-fixable if `--fix` is set), **info** (style / non-blocking).

### 2.1 Required top-level fields

| Field | Required | Missing → |
|---|---|---|
| `title` | No | Warning: derive from file basename (drop `.json`, unkebab-case → Title Case) |
| `layers` | Yes | Error → set to `[]` under `--fix` (lossy but the app can still open an empty diagram) |
| `nodes` | Yes | Same |
| `connections` | Yes | Same |
| `layerManualSizes` | No | Warning: set to `{}` |
| `lineCurve` | No | Warning: set to `"orthogonal"` |
| `flows` | No | Warning: set to `[]` |
| `documents` | No | Info only |

`lineCurve`, if present, must be one of `"orthogonal" | "curved" | "straight"`. Anything else → warning, replace with `"orthogonal"` under `--fix`.

### 2.2 Type checks

- `title` must be a string. Non-string → warning, coerce with `String(title)`.
- `layers`, `nodes`, `connections`, `flows` must be arrays. Non-array → error; cannot auto-fix without risking data loss.
- `layerManualSizes` must be a plain object (not array, not null). Non-object → warning, reset to `{}`.

## Step 3: Per-Collection Rules

### 3.1 Layers

For each entry `L` in `layers`:

- **L.id** must match `^ly-[a-z0-9-]+$`. If missing → error. If present but malformed (e.g. `layer-1`, `L_foo`) → warning, rewrite to `ly-<kebab(old)>` with `--fix` (keep a map `{oldId -> newId}` so later rules can remap references).
- **L.title** must be a non-empty string. Missing/empty → warning, fallback to `UNTITLED LAYER` under `--fix`. If not uppercase → info (archetype convention, not a hard invariant).
- **L.bg**, **L.border** must match `^#[0-9a-fA-F]{6}$`. Three-digit hex → warning, expand to six (`#abc` → `#aabbcc`). Unknown CSS names → warning, substitute slate defaults (`bg: "#f1f5f9"`, `border: "#cbd5e1"`).
- **Layer IDs must be unique** across `layers`. Duplicate → error; under `--fix`, append `-2`, `-3`, … to later occurrences and update any `nodes[].layer` references that pointed to the later occurrence (heuristically: the LAST node whose `layer === dupId` when seen in document order).

### 3.2 Nodes

For each entry `N` in `nodes`:

- **N.id** must match `^el-[a-z0-9-]+$`. Missing → error. Malformed → warning, rewrite.
- **N.label** must be a non-empty string. Missing/empty → warning, set to `"Untitled"`.
- **N.icon** must be a string. Unknown Lucide icon → info (app defaults to `Database`); do NOT rewrite unless `--fix` is set AND the icon is clearly bogus (`null`, `""`, or not a string at all), in which case set to `"Database"`.
- **N.x, N.y, N.w** must be finite numbers. Missing/NaN → warning; set to safe defaults: `x = 750, y = 100, w = 210`.
- **N.layer** must reference an existing layer ID UNLESS `N.shape === "condition"`. Orphan reference → error; under `--fix`, clear `N.layer` (this will render the node outside any layer rather than reference a non-existent one).
- **Node IDs unique** — same rule as layer IDs. Duplicate → error; under `--fix`, append suffix and remap every `connections[].from`/`to` that pointed to the later occurrence (again, by document-order heuristic).

### 3.3 Connections

For each entry `C` in `connections`:

- **C.id** must match `^dl-[a-z0-9-]+$`. Missing → error.
- **C.from, C.to** must reference existing node IDs. Orphan → error; under `--fix`, drop the connection (removing dangling edges is safer than pointing them somewhere arbitrary).
- **C.fromAnchor, C.toAnchor** must match one of the anchor patterns:
  - `^(top|right|bottom|left)-[0-9]+$` — generic edge anchor
  - `^cond-(out|in)-[0-9]+$` — condition-node anchor
  Missing → warning, default to `"bottom-1"` (fromAnchor) / `"top-1"` (toAnchor). Malformed → same treatment.
- **C.color** must be `^#[0-9a-fA-F]{6}$`. Same normalisation rules as layer colors. Unknown → `#64748b` (slate).
- **C.labelPosition**, if present, must be a number in `[0, 1]`. Out of range → warning, clamp.
- **Connection IDs unique** — same as layers/nodes.

### 3.4 Flows

For each entry `F` in `flows`:

- **F.id** must match `^flow-[a-z0-9-]+$`. Missing → error.
- **F.name** must be a non-empty string. Missing → warning, default to `"Flow"`.
- **F.connectionIds** must be an array of existing connection IDs.
  - Orphan IDs (pointing to removed connections) → warning, drop them under `--fix`.
  - If the resulting array is empty → warning, drop the whole flow under `--fix`.
- **Contiguity**: run a union-find over (connections identified by `F.connectionIds`, edges where two connections share a node). The result must be a single component.
  - Non-contiguous → error. Under `--fix`, split into one flow per connected component, naming them `<name> (1)`, `<name> (2)`, … Alternatively emit a warning and let the user pick — prefer splitting since flows in the app simply won't render if non-contiguous.

## Step 4: Semantic / Quality Checks (info-level)

These do not block the app from opening the file, but they hint at problems the user probably cares about:

- **Unused layers** — layers with no nodes → info.
- **Unused nodes** — nodes with no incoming or outgoing connections → info. (Some diagrams deliberately include "standalone" label nodes; don't auto-remove.)
- **Unused connections** — connections not referenced by any flow → info (perfectly fine, but worth mentioning for complex diagrams).
- **Overlapping coordinates** — two nodes with `|dx| < 70 && |dy| < 120` → info ("tight spacing"); flag only if `w`s overlap.
- **Layer color contrast** — `bg` and `border` identical, or `textColor` matches `bg` → warning (invisible text).

## Step 5: Emit Report

Print a human-readable report. Example:

```
validate <path>

▸ Schema
  ✓ top-level fields present
  ⚠ layerManualSizes missing — defaulted to {} (fixable)

▸ Layers (4)
  ✓ all IDs well-formed and unique
  ℹ "PRESENTATION" uses lowercase title — convention prefers uppercase

▸ Nodes (12)
  ✗ el-auth-svc: layer "ly-authz" does not exist
  ⚠ el-cache: width missing — defaulted to 210

▸ Connections (17)
  ✗ dl-9: from "el-gone" is not a known node  (unfixable without remap — drop under --fix)

▸ Flows (3)
  ✗ flow-login-path: not contiguous (2 components)
      - {dl-1, dl-2, dl-3}
      - {dl-9}
    under --fix this becomes:
      - flow-login-path (1) → [dl-1, dl-2, dl-3]
      - flow-login-path (2) → [dl-9]

Summary: 2 errors, 3 warnings, 1 info. --fix would resolve 3 warnings and 1 error (the contiguity split). The remaining 1 error requires manual attention.
```

Use these glyphs consistently:

- `✓` clean
- `⚠` warning (fixable under `--fix`)
- `✗` error
- `ℹ` info (non-blocking style note)

Always end with a one-line summary of counts and whether the file would change under `--fix`.

## Step 6: Apply Fixes (only when --fix is set)

1. Build the fixed diagram object by applying every auto-fix accumulated in Steps 2–3.
2. Run the validator one more time over the fixed object to confirm it no longer has warnings. Errors may remain (they're flagged as unfixable above); that's fine.
3. Write `<file>.invalid-backup-<ISO-timestamp>.json` with the *original* contents before writing the fixed version. This is non-negotiable — the user must be able to recover if a fix removes something they wanted.
4. Write the fixed JSON back to `<file>` with two-space indentation and a trailing newline.
5. Emit a final line: `Fixed <file>. Backup at <file>.invalid-backup-<timestamp>.json.`

If an error is still present after auto-fix (e.g. an unresolvable orphan reference that we chose to drop), print a warning that the file may still not open cleanly and recommend manual inspection.

## Step 7: Vault Integration (optional)

If a vault was detected and `graphify-out/` exists, after a successful fix:

- Run `cd <vault-root> && graphify . --update` as a best-effort refresh. Skip silently on failure.
- Append a row to `<vault-root>/memory/topic-registry.md` only if the file was previously unregistered AND now parses cleanly. The "fix" path doesn't create new entries by default — we don't want validation to silently claim authorship of a hand-authored file.

No other vault state is touched by validation.

## Design Notes for the Operator

- **Prefer pure Read + Edit**: the validator uses only Read to load the JSON, in-memory reasoning to apply checks, and Write/Edit to emit the fixed output. No external tools beyond `jq`-style JSON handling are required.
- **One validator pass per invocation**: if the user wants to iterate on a partly-fixed file, they re-run `/knowledge-base validate` — don't loop internally beyond the Step 6 double-check.
- **Never discard on parse failure**: a malformed file with real content is more valuable than an empty fixed file. Refuse to write if JSON.parse throws.
- **Preserve unknown fields**: when rewriting fixed JSON, carry through any keys you didn't touch — the app may persist fields the archetype doesn't document (e.g. future extensions like per-node metadata). Only rewrite keys you validated.
