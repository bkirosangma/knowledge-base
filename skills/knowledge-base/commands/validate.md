# Command: validate

Validate (and optionally fix) knowledge-base files. Routes by extension: `.json` diagrams and `.md` documents are both supported. All logic is delegated to `kb_validate.py`, which imports `kb_validate_doc.py` for markdown files.

## Usage

```
/knowledge-base validate <path> [--fix]
```

- `<path>` — file path or glob (e.g. `*.json`, `*.md`, `react-next/**/*`). Required.
- `--fix` — write corrected file back to disk. A timestamped backup is created first.

## What is validated

| Extension | Validator | Checks |
|-----------|-----------|--------|
| `.json` | `kb_validate.py` | ID prefixes, required fields, hex6 colors, anchor names, flow contiguity |
| `.md` | `kb_validate_doc.py` (via `kb_validate.py`) | H1 title, YAML frontmatter, span wiki-links, heading level skips, broken wiki-link targets, Visual overview link, Related section |
| other | — | skipped with `ℹ` notice |

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

## Step 2: Present the output

Print the script's stdout directly to the user. Do not reformat or summarize it.

## Step 3: Vault integration (only when --fix succeeded)

If a vault is detected and `--fix` was set:

```bash
cd "<vault-root>" && graphify . --update 2>/dev/null || true
```

Skip silently on failure. Do not update the topic registry — validation does not claim authorship.
