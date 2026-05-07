# Command: validate

Validate (and optionally fix) knowledge-base files. Routes by extension: `.json` diagrams and `.md` documents are both supported. All logic is delegated to `kb_validate.py`, which imports `kb_validate_doc.py` for markdown files.

For music-domain files (`.svg`, `.mid`/`.midi`, music documents, music diagrams), the `--lint-music` flag additionally runs `kb_validate_music.py` which checks music-specific correctness rules.

## Usage

```
/knowledge-base validate <path> [--fix] [--lint-music]
```

- `<path>` — file path or glob (e.g. `*.json`, `*.md`, `react-next/**/*`). Required.
- `--fix` — write corrected file back to disk. A timestamped backup is created first.
- `--lint-music` — additionally run the music linter (`kb_validate_music.py`) on each file.

## What is validated

| Extension | Validator | Checks |
|-----------|-----------|--------|
| `.json` | `kb_validate.py` | ID prefixes, required fields, hex6 colors, anchor names, flow contiguity |
| `.md` | `kb_validate_doc.py` (via `kb_validate.py`) | H1 title, YAML frontmatter, span wiki-links, heading level skips, broken wiki-link targets, Visual overview link, Related section |
| `.svg` (with `--lint-music`) | `kb_validate_music.py` | SVG xmlns, kb-meta comment, non-empty body |
| `.mid`/`.midi` (with `--lint-music`) | `kb_validate_music.py` | Valid MThd header, format, track count |
| `.md` (with `--lint-music`) | `kb_validate_music.py` | Empty H2 sections, H1 presence, wiki-link format |
| `.json` (with `--lint-music`) | `kb_validate_music.py` | Layer/node/connection cross-references |
| other | — | skipped with `ℹ` notice |

### Rules

| Rule | Severity | Auto-fix? |
|---|---|---|
| Every `sources[].url` parses as `http(s)://`. Other schemes (`javascript:`, `data:`, `file:`) → error. | Error | Remove the offending entry on `--fix`. |
| `sources[].title` is a string or absent. Empty string → normalise to omitted on `--fix`. | Warning | Yes |
| `flows[].nodeOrders` keys are flow members (appear as `from`/`to` of one of the flow's `connectionIds`). | Error | Remove orphan keys on `--fix`. |
| `flows[].startNodeIds` / `endNodeIds` entries are flow members. | Error | Remove orphans on `--fix`. |
| `flows[].nodeOrders` values are integers. | Error | Drop non-integers on `--fix`. |
| Empty `nodeOrders` / `startNodeIds` / `endNodeIds` / `sources` is **not** an error — these fields are optional clarity aids. | n/a | n/a |
| `attachedTo[].type` is one of the allowed values. | Error | Drop entry on `--fix`. |
| Document frontmatter `sources:` uses block-list syntax (inline `sources: [{...}]` silently dropped by the parser — block-list only). | Warning | Yes — `kb_transform.py` rewrites inline → canonical block-list. |

The allowed `attachedTo[].type` values are: `root | node | connection | flow | type | tab | tab-section | tab-track`.

## Inputs

- **path** (string, required): file path or glob from the dispatcher.
- **fix** (boolean): true if `--fix` was in the args.

## Step 1: Run the validator script

```bash
python3 ~/.claude/skills/knowledge-base/scripts/kb_validate.py "<path>" [--fix] [--vault-root "<vault-root>"]
```

The script handles all routing and validation internally:

- `.json`: checks every schema rule; under `--fix` writes corrected JSON with a `.invalid-backup-<ISO>` backup
- `.md`: checks document conventions; under `--fix` calls `kb_transform.py --add-conventions` to apply fixable issues
- Emits a human-readable report with `✓ ⚠ ✗ ℹ` glyphs per section
- Exits 0 if no errors, 1 if errors found, 2 on JSON parse failure

Pass `--json` to get machine-readable output.

## Step 1b: Run the music linter (if `--lint-music` was set)

After the standard validator, run the music-specific linter:

```bash
python3 ~/.claude/skills/knowledge-base/scripts/kb_validate_music.py "<path>" [--json-report]
```

- Accepts the same file paths or globs as Step 1.
- Checks music-domain rules: SVG structure, MIDI validity, document H1/H2/wiki-links, diagram cross-references.
- Exits 0 if all files pass, 1 if any errors found.
- Use `--json-report` to get machine-readable JSON output instead of text.

Present the music linter output after the standard validator output. Combine the exit codes: if either validator returns non-zero, report overall failure.

## Step 2: Present the output

Print the script's stdout directly to the user. Do not reformat or summarize it.

## Step 3: Vault integration (only when --fix succeeded)

If a vault is detected and `--fix` was set:

```bash
cd "<vault-root>" && graphify . --update 2>/dev/null || true
```

Skip silently on failure. Do not update the topic registry — validation does not claim authorship.
